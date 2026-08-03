'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// KHẢO SÁT GIÁO VIÊN ẨN DANH (migration 022) - PHÁT MÃ.
//
// - generateEvaluationTokens: phát mã 1 lớp (idempotent).
// - syncCampaignEvaluationTokens: phát mã TOÀN BỘ lớp có HV
//   ghi danh + đã gán GV trong phạm vi đợt (mở chức năng = HS
//   vào cổng là đánh giá được, mỗi lớp 1 lần / đợt = 1 kỳ).
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

export type SyncCampaignTokensResult =
  | { error: string }
  | {
      error?: undefined
      classCount: number
      createdCount: number
      totalIssued: number
    }

async function assertCampaignAdmin(campaignId: string): Promise<
  | { error: string }
  | { error?: undefined; campaign: { id: string; org_id: string; status: string } }
> {
  const supabase = createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()
  if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

  const { data: campaign } = await supabase
    .from('evaluation_campaigns')
    .select('id, org_id, status')
    .eq('id', campaignId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!campaign) return { error: 'Đợt khảo sát không tồn tại.' }

  const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
    p_user_id: currentUser.id,
    p_target_org_id: campaign.org_id,
    p_required_role: 'campus_admin',
  })
  if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Bạn không có quyền phát mã cho đợt khảo sát này.' }
  }

  return { campaign }
}

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
    const auth = await assertCampaignAdmin(campaignParsed.data)
    if (auth.error !== undefined) return { error: auth.error }
    if (auth.campaign.status !== 'active') {
      return { error: 'Đợt khảo sát đã đóng - không phát thêm mã.' }
    }

    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: auth.campaign.org_id,
    })
    const scopeOrgIds = new Set<string>((subtree as string[] | null) ?? [auth.campaign.org_id])
    scopeOrgIds.add(auth.campaign.org_id)

    const admin = createAdminClient()
    const { data: cls } = await admin
      .from('classes')
      .select('id, org_id, teacher_id')
      .eq('id', classParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls || !scopeOrgIds.has(cls.org_id)) {
      return { error: 'Lớp học không thuộc phạm vi của đợt khảo sát.' }
    }
    if (!cls.teacher_id) {
      return { error: 'Lớp chưa gán giáo viên — không thể mở đánh giá.' }
    }

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

/**
 * Mở / đồng bộ đợt: phát mã cho mọi lớp có GV + HS ghi danh trong subtree.
 * An toàn gọi lại khi có HV ghi danh muộn trong kỳ.
 */
export async function syncCampaignEvaluationTokens(
  campaignId: string
): Promise<SyncCampaignTokensResult> {
  const campaignParsed = requiredId('Thiếu ID đợt khảo sát.').safeParse(campaignId)
  if (!campaignParsed.success) return zodFail(campaignParsed.error)

  try {
    const auth = await assertCampaignAdmin(campaignParsed.data)
    if (auth.error !== undefined) return { error: auth.error }
    if (auth.campaign.status !== 'active') {
      return { error: 'Đợt khảo sát đã đóng - không phát thêm mã.' }
    }

    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: auth.campaign.org_id,
    })
    const orgIds = (subtree as string[] | null) ?? [auth.campaign.org_id]
    if (!orgIds.includes(auth.campaign.org_id)) orgIds.push(auth.campaign.org_id)

    const admin = createAdminClient()
    const { data: classes, error: classError } = await admin
      .from('classes')
      .select('id, teacher_id')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .not('teacher_id', 'is', null)
    if (classError) return { error: `Không đọc được danh sách lớp: ${classError.message}` }

    const eligibleClasses = classes ?? []
    if (eligibleClasses.length === 0) {
      return { classCount: 0, createdCount: 0, totalIssued: 0 }
    }

    const classIds = eligibleClasses.map((cls) => cls.id)
    const [enrollmentsResult, existingResult] = await Promise.all([
      admin
        .from('enrollments')
        .select('class_id, student_id')
        .in('class_id', classIds)
        .is('deleted_at', null),
      admin
        .from('evaluation_tokens')
        .select('class_id, student_id')
        .eq('campaign_id', campaignParsed.data),
    ])

    const existingKeys = new Set(
      (existingResult.data ?? []).map((row) => `${row.class_id}:${row.student_id}`)
    )

    const newRows: {
      campaign_id: string
      class_id: string
      student_id: string
      token: string
    }[] = []
    const classesWithEnrollment = new Set<string>()

    for (const enrollment of enrollmentsResult.data ?? []) {
      const classId = enrollment.class_id as string
      const studentId = enrollment.student_id as string
      classesWithEnrollment.add(classId)
      const key = `${classId}:${studentId}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      newRows.push({
        campaign_id: campaignParsed.data,
        class_id: classId,
        student_id: studentId,
        token: randomToken(),
      })
    }

    // Insert theo lô để tránh payload quá lớn
    const BATCH = 200
    for (let i = 0; i < newRows.length; i += BATCH) {
      const chunk = newRows.slice(i, i + BATCH)
      const { error: insertError } = await admin.from('evaluation_tokens').insert(chunk)
      if (insertError) return { error: `Không thể phát mã hàng loạt: ${insertError.message}` }
    }

    return {
      classCount: classesWithEnrollment.size,
      createdCount: newRows.length,
      totalIssued: existingKeys.size,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi đồng bộ mã đánh giá.',
    }
  }
}

// LƯU Ý: việc NỘP đánh giá (verify token + AI filter độc hại + insert
// Service Role) nằm ở `src/app/api/evaluations/actions.ts` - hàm
// submitEvaluation(token, evaluationData).
