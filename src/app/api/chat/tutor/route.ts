import { createOpenAI } from '@ai-sdk/openai'
import { embed, streamText, convertToCoreMessages, type Message } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIConfig } from '@/lib/ai/getTenantAIConfig'

// [QA GATE] Body phải qua Zod trước khi dùng (đồng bộ chuẩn với copilot route)
const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(['user', 'assistant', 'system', 'data']),
        content: z.string().max(8000),
      })
    )
    .min(1, 'Thiếu messages.'),
  class_id: z.string().uuid('class_id không hợp lệ.'),
})

export const maxDuration = 30

type MatchedMaterial = {
  id: string
  class_id: string
  content: string
  similarity: number
}

/**
 * Thông báo an toàn khi tầng AI (OpenAI) gặp sự cố - API key hết hạn,
 * quota cạn, mạng lỗi... Trả plain text để useChat hiển thị nguyên văn,
 * KHÔNG để exception làm sập ứng dụng.
 */
const AI_MAINTENANCE_MESSAGE = 'Trợ lý AI đang bảo trì, vui lòng quay lại sau'

/**
 * API AI Tutor (RAG):
 * 0. [BẢO MẬT] Chặn gọi ẩn danh: bắt buộc có session Supabase hợp lệ
 * 1. Nhận { messages, class_id }
 * 2. Embed câu hỏi cuối của user (text-embedding-3-small, 1536 chiều)
 * 3. Gọi RPC match_lesson_materials - LUÔN lọc theo class_id (multi-tenant)
 * 4. Nhúng tài liệu vào system prompt, stream câu trả lời bằng gpt-4o-mini
 */
export async function POST(request: NextRequest) {
  // ===== BƯỚC 0: XÁC THỰC - dòng đầu tiên, không cho gọi API ẩn danh =====
  // [SECURITY AUDIT] getUser() verify JWT với Supabase (getSession chỉ đọc cookie)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Bạn cần đăng nhập để sử dụng Gia sư AI.', {
      status: 401,
    })
  }

  const rawBody = await request.json().catch(() => null)
  const parsedBody = bodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.errors[0]?.message ?? 'Body không hợp lệ.' },
      { status: 400 }
    )
  }
  const messages = parsedBody.data.messages as Message[]
  const classId = parsedBody.data.class_id

  // Tin nhắn cuối cùng của user = câu hỏi cần tìm tài liệu
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUserMessage?.content) {
    return NextResponse.json(
      { error: 'Không tìm thấy câu hỏi của user trong `messages`' },
      { status: 400 }
    )
  }

  // ===== Xác định org của lớp - BẮT BUỘC cho Data Isolation RAG =====
  const { data: cls } = await supabase
    .from('classes')
    .select('id, org_id, teacher_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!cls) {
    return NextResponse.json(
      { error: 'Lớp học không tồn tại hoặc đã bị xóa.' },
      { status: 404 }
    )
  }

  // ===== [SECURITY AUDIT] Caller phải THUỘC lớp: học viên ghi danh /
  // GV của lớp / Staff của org (chống mượn API key tenant qua classId lạ)
  if (cls.teacher_id !== user.id) {
    const [{ data: enrollment }, { data: staffAuthorized }] = await Promise.all([
      supabase
        .from('enrollments')
        .select('id')
        .eq('class_id', cls.id)
        .eq('student_id', user.id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase.rpc('is_authorized', {
        p_user_id: user.id,
        p_target_org_id: cls.org_id,
        p_required_role: 'academic_staff',
      }),
    ])
    if (!enrollment && staffAuthorized !== true) {
      return NextResponse.json(
        { error: 'TỪ CHỐI: Bạn không thuộc lớp học này.' },
        { status: 403 }
      )
    }
  }

  // ===== [STUDENT 360] Ghi nhật ký câu hỏi (fire-and-forget) =====
  // Cố vấn học tập xem học sinh hay hỏi AI về môn gì tại /students/[id].
  // Lỗi ghi log không được ảnh hưởng luồng chat chính.
  void (async () => {
    try {
      const admin = createAdminClient()
      await admin.from('student_ai_chats').insert({
        org_id: cls.org_id,
        student_id: user.id,
        class_id: classId,
        task_type: 'tutor',
        question: String(lastUserMessage.content).slice(0, 2000),
      })
    } catch {
      // bảng chưa migrate / user chưa có profile -> bỏ qua
    }
  })()

  // ===== Toàn bộ phần gọi AI nằm trong try/catch: OpenAI lỗi (key hết
  // hạn, quota, timeout...) -> trả thông báo bảo trì, không ném exception.
  try {
    // [MULTI-TENANT AI] Key theo cơ sở: org -> org Mẹ -> env OPENAI_API_KEY.
    // Embedding luôn dùng text-embedding-3-small (cột vector cố định 1536
    // chiều) - key tenant quyết định AI TRẢ PHÍ cho cơ sở nào.
    const aiConfig = await getAIConfig(cls.org_id)
    const apiKey =
      aiConfig.provider === 'openai' && aiConfig.apiKey
        ? aiConfig.apiKey
        : process.env.OPENAI_API_KEY
    if (!apiKey) {
      return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
    }
    const openaiClient = createOpenAI({ apiKey })
    const chatModel =
      aiConfig.provider === 'openai' && aiConfig.apiKey ? aiConfig.model : 'gpt-4o-mini'

    // Bước 2: embed câu hỏi
    const { embedding } = await embed({
      model: openaiClient.embedding('text-embedding-3-small'),
      value: lastUserMessage.content,
      abortSignal: AbortSignal.timeout(30_000),
    })

    // Bước 3: tìm tài liệu giảng dạy liên quan - match_lesson_materials
    // [CÁCH LY TUYỆT ĐỐI] p_org_id BẮT BUỘC (migration 018): vector search
    // không bao giờ chạy nếu thiếu org_id, kèm lọc đúng lớp qua filter_class_id.
    const { data: materials, error: rpcError } = await supabase.rpc(
      'match_lesson_materials',
      {
        query_embedding: embedding,
        p_org_id: cls.org_id,
        filter_class_id: classId,
        match_count: 5,
      }
    )

    if (rpcError) {
      console.error('[AI Tutor] Lỗi RPC match_lesson_materials:', rpcError.message)
      return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
    }

    const context =
      (materials as MatchedMaterial[] | null)
        ?.map((m, i) => `[Tài liệu ${i + 1}] ${m.content}`)
        .join('\n---\n') || '(Chưa có tài liệu nào cho lớp này)'

    // Bước 4: stream câu trả lời với ngữ cảnh tài liệu (model của tenant)
    const result = streamText({
      model: openaiClient(chatModel),
      system: `Bạn là gia sư của trung tâm GDTX, trả lời bằng tiếng Việt, ngắn gọn và dễ hiểu.
Hãy dùng tài liệu sau để trả lời. Nếu tài liệu không chứa thông tin liên quan, hãy nói rõ là tài liệu của lớp chưa đề cập và trả lời theo kiến thức chung (ghi chú rõ điều đó).

TÀI LIỆU CỦA LỚP:
${context}`,
      messages: convertToCoreMessages(messages),
    })

    return result.toDataStreamResponse({
      // Lỗi giữa chừng khi đang stream (VD: quota cạn) cũng trả câu an toàn
      getErrorMessage: () => AI_MAINTENANCE_MESSAGE,
    })
  } catch (error) {
    console.error(
      '[AI Tutor] Tầng AI gặp sự cố:',
      error instanceof Error ? error.message : error
    )
    return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
  }
}
