'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// KHẢO SÁT GIÁO VIÊN ẨN DANH (migration 022) - PHÁT MÃ.
//
// generateEvaluationTokens: Admin phát mã dùng-1-lần cho học sinh
// trong lớp (chống spam: unique campaign+class+student).
// ============================================================

/** Sinh mã ngẫu nhiên 8 ký tự dễ đọc (bỏ 0/O, 1/I tránh nhầm) */
function randomToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

export type IssuedToken = {
  studentId: string
  studentName: string
  token: string
  isUsed: boolean
  isNew: boolean
}

export type GenerateTokensResult =
  | { error: string }
  | { error?: undefined; tokens: IssuedToken[]; createdCount: number }

/**
 * Phát token khảo sát cho TOÀN BỘ học sinh đang ghi danh trong lớp.
 * Idempotent: học sinh đã có token của (đợt, lớp) này thì trả lại
 * token cũ, không tạo trùng (unique constraint chặn thêm ở tầng DB).
 */
export async function generateEvaluationTokens(
  campaignId: string,
  classId: string
): Promise<GenerateTokensResult> {
  const campaignParsed = requiredId('Thiếu ID đợt khảo sát.').safeParse(campaignId)
  if (!campaignParsed.success) return zodFail(campaignParsed.error)
  const classParsed = requiredId('Thiếu ID lớp học.').safeParse(classId)
  if (!classParsed.success) return zodFail(classParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    // Đợt khảo sát + chốt quyền campus_admin trên org của đợt
    const { data: campaign } = await supabase
      .from('evaluation_campaigns')
      .select('id, org_id, status')
      .eq('id', campaignParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!campaign) return { error: 'Đợt khảo sát không tồn tại.' }
    if (campaign.status !== 'active') {
      return { error: 'Đợt khảo sát đã đóng - không phát thêm mã.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: campaign.org_id,
      p_required_role: 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền phát mã cho đợt khảo sát này.' }
    }

    // Lớp phải nằm trong subtree của org đợt khảo sát
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: campaign.org_id,
    })
    const scopeOrgIds = new Set<string>((subtree as string[] | null) ?? [campaign.org_id])
    scopeOrgIds.add(campaign.org_id)

    const admin = createAdminClient()
    const { data: cls } = await admin
      .from('classes')
      .select('id, org_id')
      .eq('id', classParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls || !scopeOrgIds.has(cls.org_id)) {
      return { error: 'Lớp học không thuộc phạm vi của đợt khảo sát.' }
    }

    // Học sinh đang ghi danh + token đã phát trước đó
    const [enrollmentsResult, existingResult] = await Promise.all([
      admin
        .from('enrollments')
        .select('student_id')
        .eq('class_id', classParsed.data)
        .is('deleted_at', null),
      admin
        .from('evaluation_tokens')
        .select('student_id, token, is_used')
        .eq('campaign_id', campaignParsed.data)
        .eq('class_id', classParsed.data),
    ])
    const studentIds = [
      ...new Set((enrollmentsResult.data ?? []).map((e) => e.student_id as string)),
    ]
    if (studentIds.length === 0) {
      return { error: 'Lớp chưa có học sinh ghi danh nào.' }
    }
    const existingByStudent = new Map(
      (existingResult.data ?? []).map((t) => [t.student_id as string, t])
    )

    const { data: students } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds)
    const nameById = new Map((students ?? []).map((s) => [s.id, s.full_name]))

    // Tạo token cho học sinh CHƯA có
    const newRows = studentIds
      .filter((studentId) => !existingByStudent.has(studentId))
      .map((studentId) => ({
        campaign_id: campaignParsed.data,
        class_id: classParsed.data,
        student_id: studentId,
        token: randomToken(),
      }))
    if (newRows.length > 0) {
      const { error: insertError } = await admin.from('evaluation_tokens').insert(newRows)
      if (insertError) return { error: `Không thể phát mã: ${insertError.message}` }
    }

    const tokens: IssuedToken[] = studentIds.map((studentId) => {
      const existing = existingByStudent.get(studentId)
      const created = newRows.find((row) => row.student_id === studentId)
      return {
        studentId,
        studentName: nameById.get(studentId) ?? '—',
        token: (existing?.token as string) ?? created?.token ?? '—',
        isUsed: existing?.is_used === true,
        isNew: created !== undefined,
      }
    })

    return { tokens, createdCount: newRows.length }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi phát mã.',
    }
  }
}

// LƯU Ý: việc NỘP đánh giá (verify token + AI filter độc hại + insert
// Service Role) nằm ở `src/app/api/evaluations/actions.ts` - hàm
// submitEvaluation(token, evaluationData).
