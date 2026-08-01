'use server'

import { createOpenAI } from '@ai-sdk/openai'
import { embedMany, generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIConfig } from '@/lib/ai/getTenantAIConfig'

// ============================================================
// LMS x AI - phía GIÁO VIÊN:
//   1. generateLessonDraft : AI soạn nháp bài giảng theo chủ đề
//   2. generateQuizDraft   : AI tạo câu hỏi trắc nghiệm (từ nội
//      dung bài giảng đã có hoặc từ chủ đề tự nhập)
//   3. indexLessonToRAG    : "Cho AI học" - băm nhỏ nội dung bài
//      giảng, embedding và nạp vào lesson_materials để Gia sư AI
//      (RAG /api/chat/tutor) trả lời học viên DỰA TRÊN bài giảng.
//   4. getLessonRagStatus  : bài nào đã được AI học (số chunk)
//
// API Key lấy theo TENANT (getAIConfig: org -> org Mẹ -> env).
// ============================================================

// ---------- Quyền: GV chủ nhiệm lớp hoặc academic_staff+ subtree ----------
type ClassAuth =
  | { error: string; cls?: undefined; userId?: undefined }
  | { error?: undefined; cls: { id: string; name: string; org_id: string }; userId: string }

async function authorize(classId: string): Promise<ClassAuth> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn cần đăng nhập.' }

  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, org_id, teacher_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!cls) return { error: 'Không tìm thấy lớp học.' }

  let allowed = cls.teacher_id === user.id
  if (!allowed) {
    const { data: staffOk } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: cls.org_id,
      p_required_role: 'academic_staff',
    })
    allowed = Boolean(staffOk)
  }
  if (!allowed) return { error: 'Bạn không có quyền với lớp này.' }

  return { cls: { id: cls.id, name: cls.name, org_id: cls.org_id }, userId: user.id }
}

// ---------- API key AI theo tenant ----------
async function getTenantOpenAI(orgId: string) {
  const aiConfig = await getAIConfig(orgId)
  const apiKey =
    aiConfig.provider === 'openai' && aiConfig.apiKey ? aiConfig.apiKey : process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const model =
    aiConfig.provider === 'openai' && aiConfig.apiKey ? aiConfig.model : 'gpt-4o-mini'
  return { client: createOpenAI({ apiKey }), model }
}

const AI_UNAVAILABLE =
  'Chưa có API Key AI: cấu hình tại Cài đặt > Cấu hình AI hoặc đặt biến môi trường OPENAI_API_KEY.'
const AI_FAILED = 'Gọi AI thất bại (key hết hạn / hết quota?). Vui lòng thử lại sau.'

// ============================================================
// 1. AI SOẠN BÀI GIẢNG
// ============================================================
export type LessonDraft = {
  title: string
  description: string
  content: string
}

const lessonDraftInput = z.object({
  classId: z.string().uuid(),
  topic: z.string().trim().min(3, 'Nhập chủ đề (tối thiểu 3 ký tự).').max(300),
  audience: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
})

export async function generateLessonDraft(
  input: z.infer<typeof lessonDraftInput>
): Promise<{ error: string } | { draft: LessonDraft }> {
  try {
    const parsed = lessonDraftInput.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

    const auth = await authorize(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }

    const ai = await getTenantOpenAI(auth.cls.org_id)
    if (!ai) return { error: AI_UNAVAILABLE }

    const { object } = await generateObject({
      model: ai.client(ai.model),
      abortSignal: AbortSignal.timeout(60_000),
      schema: z.object({
        title: z.string().describe('Tiêu đề bài giảng ngắn gọn, hấp dẫn'),
        description: z.string().describe('Mô tả 1-2 câu về bài giảng'),
        content: z
          .string()
          .describe(
            'Nội dung bài giảng đầy đủ dạng văn bản có cấu trúc: mục tiêu, kiến thức trọng tâm, ví dụ minh họa, bài tập vận dụng, tổng kết'
          ),
      }),
      prompt: `Bạn là giáo viên giỏi của trung tâm GDTX Việt Nam. Soạn một bài giảng hoàn chỉnh bằng tiếng Việt.

Chủ đề: ${parsed.data.topic}
Lớp: ${auth.cls.name}${parsed.data.audience ? `\nĐối tượng học viên: ${parsed.data.audience}` : ''}${parsed.data.notes ? `\nYêu cầu thêm của giáo viên: ${parsed.data.notes}` : ''}

Cấu trúc nội dung bắt buộc:
1. MỤC TIÊU BÀI HỌC (3-4 gạch đầu dòng)
2. KIẾN THỨC TRỌNG TÂM (giải thích rõ ràng, chia mục nhỏ)
3. VÍ DỤ MINH HỌA (ít nhất 2 ví dụ có lời giải)
4. BÀI TẬP VẬN DỤNG (3-5 bài, chưa kèm lời giải)
5. TỔNG KẾT & DẶN DÒ

Viết dễ hiểu, phù hợp học viên GDTX (nhiều em mất gốc). Nội dung tối thiểu 500 từ.`,
    })

    return {
      draft: {
        title: object.title.slice(0, 200),
        description: object.description.slice(0, 1000),
        content: object.content.slice(0, 50000),
      },
    }
  } catch (e) {
    console.error('[LMS AI] generateLessonDraft:', e instanceof Error ? e.message : e)
    return { error: AI_FAILED }
  }
}

// ============================================================
// 2. AI TẠO CÂU HỎI TRẮC NGHIỆM
// ============================================================
export type AIQuizQuestion = {
  question: string
  options: string[]
  correctIndex: number
  points: number
}

const quizDraftInput = z.object({
  classId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  topic: z.string().trim().max(300).optional().default(''),
  count: z.number().int().min(1).max(20).default(5),
})

export async function generateQuizDraft(
  input: z.infer<typeof quizDraftInput>
): Promise<{ error: string } | { questions: AIQuizQuestion[] }> {
  try {
    const parsed = quizDraftInput.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

    const auth = await authorize(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }

    // Nguồn kiến thức: nội dung bài giảng đã chọn (ưu tiên) hoặc chủ đề tự nhập
    let sourceText = ''
    let sourceLabel = parsed.data.topic
    if (parsed.data.lessonId) {
      const supabase = createClient()
      const { data: lesson } = await supabase
        .from('lms_lessons')
        .select('title, content, description')
        .eq('id', parsed.data.lessonId)
        .eq('class_id', auth.cls.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (!lesson) return { error: 'Không tìm thấy bài giảng nguồn.' }
      sourceLabel = lesson.title
      sourceText = [lesson.description, lesson.content].filter(Boolean).join('\n\n').slice(0, 12000)
    }
    if (!sourceText && !sourceLabel) {
      return { error: 'Chọn bài giảng nguồn hoặc nhập chủ đề để AI tạo câu hỏi.' }
    }

    const ai = await getTenantOpenAI(auth.cls.org_id)
    if (!ai) return { error: AI_UNAVAILABLE }

    const { object } = await generateObject({
      model: ai.client(ai.model),
      abortSignal: AbortSignal.timeout(60_000),
      schema: z.object({
        questions: z
          .array(
            z.object({
              question: z.string().describe('Nội dung câu hỏi'),
              options: z.array(z.string()).describe('4 phương án A, B, C, D'),
              correctIndex: z.number().int().describe('Chỉ số phương án đúng (0-3)'),
            })
          )
          .describe(`Đúng ${parsed.data.count} câu hỏi trắc nghiệm`),
      }),
      prompt: `Bạn là giáo viên ra đề trắc nghiệm cho trung tâm GDTX Việt Nam. Tạo đúng ${parsed.data.count} câu hỏi trắc nghiệm tiếng Việt, mỗi câu 4 phương án và CHỈ 1 đáp án đúng.

Chủ đề: ${sourceLabel}
${sourceText ? `NỘI DUNG BÀI GIẢNG (căn cứ ra đề - KHÔNG hỏi ngoài nội dung này):\n${sourceText}` : 'Ra đề theo kiến thức phổ thông chuẩn của chủ đề trên.'}

Yêu cầu: câu hỏi rõ ràng, độ khó tăng dần, phương án nhiễu hợp lý, không đánh số A/B/C/D trong nội dung phương án.`,
    })

    const questions: AIQuizQuestion[] = object.questions
      .filter((q) => q.options.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.options.length)
      .slice(0, parsed.data.count)
      .map((q) => ({
        question: q.question.slice(0, 2000),
        options: q.options.slice(0, 6).map((o) => o.slice(0, 500)),
        correctIndex: q.correctIndex,
        points: 1,
      }))

    if (questions.length === 0) return { error: 'AI không tạo được câu hỏi hợp lệ, thử lại nhé.' }
    return { questions }
  } catch (e) {
    console.error('[LMS AI] generateQuizDraft:', e instanceof Error ? e.message : e)
    return { error: AI_FAILED }
  }
}

// ============================================================
// 3. "CHO AI HỌC" - INDEX BÀI GIẢNG VÀO KHO RAG
// ============================================================
const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 150
const MAX_CHUNKS = 100

function chunkText(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!text) return []
  const chunks: string[] = []
  let start = 0
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_SIZE, text.length)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const paragraphBreak = slice.lastIndexOf('\n\n')
      const sentenceBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'))
      const spaceBreak = slice.lastIndexOf(' ')
      const cut =
        paragraphBreak > CHUNK_SIZE * 0.4
          ? paragraphBreak
          : sentenceBreak > CHUNK_SIZE * 0.4
            ? sentenceBreak + 1
            : spaceBreak > CHUNK_SIZE * 0.4
              ? spaceBreak
              : slice.length
      end = start + cut
    }
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 30) chunks.push(chunk)
    if (end >= text.length) break
    start = Math.max(end - CHUNK_OVERLAP, start + 1)
  }
  return chunks
}

/**
 * Nạp nội dung bài giảng vào kho tri thức RAG của lớp:
 * - Xóa các chunk cũ của CHÍNH bài giảng này (re-index an toàn)
 * - Băm nhỏ (title + mô tả + nội dung) -> embedding -> lesson_materials
 * - Gia sư AI (/api/chat/tutor) sẽ trả lời học viên dựa trên bài giảng.
 */
export async function indexLessonToRAG(
  classId: string,
  lessonId: string
): Promise<{ error: string } | { chunkCount: number }> {
  try {
    const auth = await authorize(classId)
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: lesson } = await supabase
      .from('lms_lessons')
      .select('id, title, description, content, created_by')
      .eq('id', lessonId)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lesson) return { error: 'Không tìm thấy bài giảng.' }

    const fullText = [
      `BÀI GIẢNG: ${lesson.title}`,
      lesson.description ?? '',
      lesson.content ?? '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const chunks = chunkText(fullText)
    if (chunks.length === 0) {
      return { error: 'Bài giảng chưa có nội dung văn bản để AI học (hãy soạn phần Nội dung).' }
    }

    const ai = await getTenantOpenAI(auth.cls.org_id)
    if (!ai) return { error: AI_UNAVAILABLE }

    let embeddings: number[][]
    try {
      const result = await embedMany({
        model: ai.client.embedding('text-embedding-3-small'),
        values: chunks,
        abortSignal: AbortSignal.timeout(60_000),
      })
      embeddings = result.embeddings
    } catch {
      return { error: AI_FAILED }
    }

    // Admin client: xóa chunk cũ theo metadata lesson_id rồi chèn mới
    // (đã authorize GV/Staff của đúng lớp ở trên)
    const admin = createAdminClient()
    await admin
      .from('lesson_materials')
      .delete()
      .eq('org_id', auth.cls.org_id)
      .eq('class_id', classId)
      .eq('metadata->>lesson_id', lessonId)

    const { error: insertError } = await admin.from('lesson_materials').insert(
      chunks.map((content, index) => ({
        org_id: auth.cls.org_id,
        class_id: classId,
        content,
        embedding: JSON.stringify(embeddings[index]),
        metadata: {
          file_name: `Bài giảng: ${lesson.title}`,
          source: 'lms_lesson',
          lesson_id: lessonId,
          chunk_index: index,
          total_chunks: chunks.length,
        },
      }))
    )
    if (insertError) return { error: 'Không lưu được vào kho tri thức: ' + insertError.message }

    return { chunkCount: chunks.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi nạp bài giảng cho AI.' }
  }
}

/** Trạng thái RAG của các bài giảng trong lớp: lessonId -> số chunk đã index */
export async function getLessonRagStatus(
  classId: string
): Promise<Record<string, number>> {
  try {
    const auth = await authorize(classId)
    if (auth.error !== undefined) return {}

    const supabase = createClient()
    const { data } = await supabase
      .from('lesson_materials')
      .select('metadata')
      .eq('class_id', classId)
      .eq('metadata->>source', 'lms_lesson')
      .is('deleted_at', null)
      .limit(2000)

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      const lessonId = (row.metadata as Record<string, unknown> | null)?.lesson_id
      if (typeof lessonId === 'string') counts[lessonId] = (counts[lessonId] ?? 0) + 1
    }
    return counts
  } catch {
    return {}
  }
}
