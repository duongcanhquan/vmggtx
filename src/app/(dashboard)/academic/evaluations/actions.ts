'use server'

import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getAIConfig } from '@/lib/ai/getTenantAIConfig'
import { requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// BÁO CÁO ĐÁNH GIÁ GIÁO VIÊN (/academic/evaluations)
// - getEvaluationReport: AVG 3 tiêu chí theo từng giáo viên trong
//   subtree của currentOrgId (RLS 022 là lớp chặn thứ 2).
// - summarizeTeacherFeedback: [AI TÓM TẮT] gom toàn bộ feedback_text
//   của 1 giáo viên -> gpt-4o-mini viết "Điểm mạnh / Cần cải thiện".
// ============================================================

export type TeacherEvalStat = {
  teacherId: string
  teacherName: string
  avgTeaching: number
  avgAttitude: number
  avgPunctuality: number
  avgOverall: number
  totalResponses: number
  feedbackCount: number
}

export type EvaluationReportResult =
  | { error: string }
  | { error?: undefined; stats: TeacherEvalStat[] }

const round1 = (n: number) => Math.round(n * 10) / 10

/** Chốt cửa chung: campus_admin trở lên trên org đích */
async function assertCampusAdmin(orgId: string): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Bạn chưa đăng nhập.'

  const { data: authorized, error } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'campus_admin',
  })
  if (error) return `Lỗi kiểm tra phân quyền: ${error.message}`
  if (authorized !== true) {
    return 'TỪ CHỐI: Chỉ Campus Admin được xem báo cáo đánh giá của cơ sở này.'
  }
  return null
}

export async function getEvaluationReport(orgId: string): Promise<EvaluationReportResult> {
  const orgParsed = requiredId('Thiếu org_id: vui lòng chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  try {
    const authError = await assertCampusAdmin(orgParsed.data)
    if (authError) return { error: authError }

    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: orgParsed.data,
    })
    const orgIds = (subtree as string[] | null) ?? [orgParsed.data]
    if (!orgIds.includes(orgParsed.data)) orgIds.push(orgParsed.data)

    // [ĐA TẦNG] Lọc org_id tường minh; RLS 022 chặn thêm ở tầng DB
    const { data: results, error } = await supabase
      .from('evaluation_results')
      .select('teacher_id, rating_teaching, rating_attitude, rating_punctuality, feedback_text')
      .in('org_id', orgIds)
      .is('deleted_at', null)
    if (error) return { error: `Không đọc được kết quả khảo sát: ${error.message}` }

    if (!results || results.length === 0) return { stats: [] }

    // Group theo giáo viên -> AVG từng tiêu chí
    const byTeacher = new Map<
      string,
      { teaching: number; attitude: number; punctuality: number; count: number; feedback: number }
    >()
    for (const row of results) {
      const acc =
        byTeacher.get(row.teacher_id) ?? {
          teaching: 0,
          attitude: 0,
          punctuality: 0,
          count: 0,
          feedback: 0,
        }
      acc.teaching += row.rating_teaching
      acc.attitude += row.rating_attitude
      acc.punctuality += row.rating_punctuality
      acc.count += 1
      if (row.feedback_text) acc.feedback += 1
      byTeacher.set(row.teacher_id, acc)
    }

    const teacherIds = [...byTeacher.keys()]
    const { data: teachers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds)
    const nameById = new Map((teachers ?? []).map((t) => [t.id, t.full_name]))

    const stats: TeacherEvalStat[] = teacherIds
      .map((teacherId) => {
        const acc = byTeacher.get(teacherId)!
        const avgTeaching = round1(acc.teaching / acc.count)
        const avgAttitude = round1(acc.attitude / acc.count)
        const avgPunctuality = round1(acc.punctuality / acc.count)
        return {
          teacherId,
          teacherName: nameById.get(teacherId) ?? 'Giáo viên ẩn',
          avgTeaching,
          avgAttitude,
          avgPunctuality,
          avgOverall: round1((avgTeaching + avgAttitude + avgPunctuality) / 3),
          totalResponses: acc.count,
          feedbackCount: acc.feedback,
        }
      })
      .sort((a, b) => b.avgOverall - a.avgOverall)

    return { stats }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tải báo cáo.',
    }
  }
}

export type SummarizeResult =
  | { error: string }
  | { error?: undefined; summary: string; feedbackCount: number }

/**
 * [AI TÓM TẮT] Gom toàn bộ ý kiến tự do của 1 giáo viên và nhờ
 * gpt-4o-mini viết tóm tắt "Điểm mạnh / Cần cải thiện".
 */
export async function summarizeTeacherFeedback(
  teacherId: string,
  orgId: string
): Promise<SummarizeResult> {
  const teacherParsed = requiredId('Thiếu ID giáo viên.').safeParse(teacherId)
  if (!teacherParsed.success) return zodFail(teacherParsed.error)
  const orgParsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  try {
    const authError = await assertCampusAdmin(orgParsed.data)
    if (authError) return { error: authError }

    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: orgParsed.data,
    })
    const orgIds = (subtree as string[] | null) ?? [orgParsed.data]
    if (!orgIds.includes(orgParsed.data)) orgIds.push(orgParsed.data)

    const { data: rows, error } = await supabase
      .from('evaluation_results')
      .select('feedback_text')
      .eq('teacher_id', teacherParsed.data)
      .in('org_id', orgIds)
      .not('feedback_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return { error: `Không đọc được ý kiến: ${error.message}` }

    const feedbacks = (rows ?? [])
      .map((row) => (row.feedback_text as string).trim())
      .filter(Boolean)
    if (feedbacks.length === 0) {
      return { error: 'Giáo viên này chưa có ý kiến đóng góp dạng văn bản nào.' }
    }

    // ===== Gọi AI (key theo tenant, fallback env) =====
    const aiConfig = await getAIConfig(orgParsed.data)
    const apiKey =
      aiConfig.provider === 'openai' && aiConfig.apiKey
        ? aiConfig.apiKey
        : process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { error: 'Trợ lý AI đang bảo trì, vui lòng quay lại sau.' }
    }

    try {
      const openaiClient = createOpenAI({ apiKey })
      const { text } = await generateText({
        model: openaiClient('gpt-4o-mini'),
        abortSignal: AbortSignal.timeout(30_000),
        prompt: `Dưới đây là ${feedbacks.length} ý kiến ẨN DANH của học sinh đánh giá một giáo viên (tiếng Việt):

${feedbacks.map((f, i) => `${i + 1}. "${f}"`).join('\n')}

Hãy viết một đoạn tóm tắt ngắn gọn (tối đa 150 từ) cho Ban giám hiệu, đúng định dạng:
Điểm mạnh: ...
Cần cải thiện: ...

Chỉ dựa trên nội dung ý kiến, không bịa thêm. Nếu không có điểm cần cải thiện, ghi "Chưa ghi nhận".`,
      })
      return { summary: text.trim(), feedbackCount: feedbacks.length }
    } catch {
      return { error: 'Trợ lý AI đang bảo trì, vui lòng quay lại sau.' }
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tóm tắt ý kiến.',
    }
  }
}
