import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { embed, streamText, type LanguageModel } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIConfig, type TenantAIConfig } from '@/lib/ai/getTenantAIConfig'

export const maxDuration = 60

// ============================================================
// CORE AI COPILOT - API duy nhất xử lý MỌI yêu cầu AI của hệ thống.
//
// - Multi-tenant: API Key + Model lấy từ getAIConfig(orgId)
//   (key của org -> org Mẹ -> env), provider khởi tạo ĐỘNG
//   (OpenAI / Google Gemini / Anthropic Claude).
// - RAG Isolation: mọi context đều qua match_lesson_materials
//   với p_org_id BẮT BUỘC (migration 018).
// - taskType quyết định vai trò + nguồn context:
//     tutor       : học sinh hỏi bài  (RAG theo LỚP)
//     lesson_plan : giáo viên tạo giáo án (RAG toàn cơ sở = syllabus)
//     hr_query    : tra cứu quy chế nội bộ (RAG toàn cơ sở)
// ============================================================

const AI_MAINTENANCE_MESSAGE = 'Trợ lý AI đang bảo trì, vui lòng quay lại sau'

const TASK_TYPES = ['tutor', 'lesson_plan', 'hr_query'] as const

const bodySchema = z.object({
  prompt: z.string().trim().min(1, 'Thiếu prompt.').max(4000, 'Prompt tối đa 4000 ký tự.'),
  taskType: z.enum(TASK_TYPES),
  orgId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
})

type MatchedMaterial = { content: string; metadata?: Record<string, unknown> }

// ---------- Khởi tạo Provider ĐỘNG theo cấu hình tenant ----------
function buildChatModel(config: TenantAIConfig): LanguageModel | null {
  switch (config.provider) {
    case 'google': {
      const apiKey = config.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      if (!apiKey) return null
      return createGoogleGenerativeAI({ apiKey })(config.model)
    }
    case 'anthropic': {
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
      if (!apiKey) return null
      return createAnthropic({ apiKey })(config.model)
    }
    default: {
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY
      if (!apiKey) return null
      return createOpenAI({ apiKey })(config.model)
    }
  }
}

// ---------- System Prompt theo taskType ----------
function buildSystemPrompt(taskType: (typeof TASK_TYPES)[number], context: string) {
  switch (taskType) {
    case 'tutor':
      return `Bạn là gia sư của trung tâm GDTX, trả lời bằng tiếng Việt, ngắn gọn và dễ hiểu.
CHỈ trả lời dựa vào tài liệu dưới đây. Nếu tài liệu không chứa thông tin liên quan, hãy nói rõ là tài liệu của lớp chưa đề cập nội dung này và gợi ý học sinh hỏi giáo viên.

TÀI LIỆU CỦA LỚP:
${context}`
    case 'lesson_plan':
      return `Bạn là chuyên gia sư phạm của trung tâm GDTX. Dựa vào khung chương trình dưới đây, tạo GIÁO ÁN 45 PHÚT bằng tiếng Việt theo cấu trúc: Mục tiêu bài học, Chuẩn bị, Tiến trình (Khởi động - Hình thành kiến thức - Luyện tập - Vận dụng, kèm phân bổ thời gian từng phần), Đánh giá & Dặn dò.
Nếu khung chương trình không đề cập chủ đề được yêu cầu, hãy ghi chú rõ và soạn theo chuẩn kiến thức phổ thông.

KHUNG CHƯƠNG TRÌNH (SYLLABUS):
${context}`
    case 'hr_query':
      return `Bạn là trợ lý hành chính - nhân sự của trung tâm GDTX, trả lời bằng tiếng Việt, chính xác và thận trọng.
CHỈ trả lời dựa trên quy chế/tài liệu nội bộ dưới đây. Nếu quy chế không đề cập, hãy trả lời rằng chưa có quy định và đề nghị người hỏi liên hệ phòng nhân sự - TUYỆT ĐỐI không tự suy diễn quy định.

QUY CHẾ / TÀI LIỆU NỘI BỘ:
${context}`
  }
}

export async function POST(request: NextRequest) {
  // ===== BƯỚC 0: XÁC THỰC - không cho gọi API ẩn danh =====
  // [SECURITY AUDIT] getUser() verify JWT với Supabase (getSession chỉ đọc cookie)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Bạn cần đăng nhập để sử dụng Trợ lý AI.', { status: 401 })
  }

  // ===== BƯỚC 1: VALIDATE INPUT (zod) =====
  const rawBody = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Body không hợp lệ.' },
      { status: 400 }
    )
  }
  const { prompt, taskType, classId } = parsed.data

  // ===== BƯỚC 2: XÁC ĐỊNH org_id ĐÁNG TIN CẬY =====
  // - tutor: org lấy từ LỚP HỌC (server-side truth, không tin client).
  // - lesson_plan / hr_query: orgId client gửi lên phải nằm trong phạm
  //   vi của user (chống mượn API Key của cơ sở khác để đốt chi phí).
  let orgId: string
  let ragClassId: string | null = null

  if (taskType === 'tutor') {
    if (!classId) {
      return NextResponse.json({ error: 'taskType=tutor cần classId.' }, { status: 400 })
    }
    const { data: cls } = await supabase
      .from('classes')
      .select('id, org_id, teacher_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls) {
      return NextResponse.json({ error: 'Lớp học không tồn tại.' }, { status: 404 })
    }

    // [SECURITY AUDIT] Chống "mượn" API key tenant qua classId lạ:
    // caller phải LÀ học viên ghi danh lớp / GV của lớp / Staff của org
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

    orgId = cls.org_id
    ragClassId = cls.id
  } else {
    const requestedOrgId = parsed.data.orgId
    if (!requestedOrgId) {
      return NextResponse.json({ error: `taskType=${taskType} cần orgId.` }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, org_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile) {
      return NextResponse.json({ error: 'Không tìm thấy hồ sơ người dùng.' }, { status: 403 })
    }

    let inScope = profile.role === 'super_admin' || profile.org_id === requestedOrgId
    if (!inScope) {
      const { data: inSubtree } = await supabase.rpc('is_org_in_my_subtree', {
        p_target_org_id: requestedOrgId,
      })
      inScope = inSubtree === true
    }
    if (!inScope) {
      return NextResponse.json(
        { error: 'TỪ CHỐI: Cơ sở này không thuộc phạm vi của bạn.' },
        { status: 403 }
      )
    }
    orgId = requestedOrgId
  }

  // ===== [STUDENT 360] Ghi nhật ký câu hỏi tutor (fire-and-forget) =====
  if (taskType === 'tutor') {
    void (async () => {
      try {
        const admin = createAdminClient()
        await admin.from('student_ai_chats').insert({
          org_id: orgId,
          student_id: user.id,
          class_id: classId ?? null,
          task_type: 'tutor',
          question: prompt.slice(0, 2000),
        })
      } catch {
        // bảng chưa migrate / user chưa có profile -> bỏ qua
      }
    })()
  }

  // ===== BƯỚC 3-5: cấu hình tenant + RAG + stream (bọc try/catch) =====
  try {
    const tenantConfig = await getAIConfig(orgId)

    // Khởi tạo Provider động (OpenAI / Google / Anthropic)
    const aiModel = buildChatModel(tenantConfig)
    if (!aiModel) {
      return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
    }

    // ===== BƯỚC 4: RAG context - embedding luôn cần key OpenAI
    // (cột vector cố định 1536 chiều = text-embedding-3-small)
    const embeddingKey =
      tenantConfig.provider === 'openai' && tenantConfig.apiKey
        ? tenantConfig.apiKey
        : process.env.OPENAI_API_KEY

    let context = '(Chưa có tài liệu nào trong kho tri thức của cơ sở)'
    if (embeddingKey) {
      const embeddingClient = createOpenAI({ apiKey: embeddingKey })
      const { embedding } = await embed({
        model: embeddingClient.embedding('text-embedding-3-small'),
        value: prompt,
        abortSignal: AbortSignal.timeout(30_000),
      })

      // [CÁCH LY TUYỆT ĐỐI] p_org_id bắt buộc; tutor khoanh theo lớp,
      // lesson_plan / hr_query tìm TOÀN CƠ SỞ (filter_class_id null)
      const { data: materials, error: rpcError } = await supabase.rpc(
        'match_lesson_materials',
        {
          query_embedding: embedding,
          p_org_id: orgId,
          filter_class_id: ragClassId,
          match_count: taskType === 'tutor' ? 5 : 8,
        }
      )
      if (rpcError) {
        console.error('[AI Copilot] Lỗi RPC match_lesson_materials:', rpcError.message)
        return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
      }

      const found = (materials as MatchedMaterial[] | null) ?? []
      if (found.length > 0) {
        context = found
          .map((m, i) => `[Tài liệu ${i + 1}] ${m.content}`)
          .join('\n---\n')
      }
    }

    // ===== BƯỚC 5: stream câu trả lời =====
    const result = streamText({
      model: aiModel,
      system: buildSystemPrompt(taskType, context),
      prompt,
    })

    return result.toDataStreamResponse({
      getErrorMessage: () => AI_MAINTENANCE_MESSAGE,
    })
  } catch (error) {
    console.error(
      '[AI Copilot] Tầng AI gặp sự cố:',
      error instanceof Error ? error.message : error
    )
    return new NextResponse(AI_MAINTENANCE_MESSAGE, { status: 503 })
  }
}
