'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCampaignEvaluationTokens } from '@/lib/actions/evaluations'
import { campaignSchema, requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// QUẢN LÝ ĐỢT KHẢO SÁT GIÁO VIÊN (/academic/campaigns)
// - getCampaigns / createCampaign: tạo đợt = mở đánh giá kỳ
//   (tự phát mã cho mọi lớp có GV + HV ghi danh).
// - closeCampaign: đóng đợt (HS không nộp thêm).
// - getCampaignDetail: tiến độ theo lớp.
// ============================================================

async function assertCampusAdmin(orgId: string): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Bạn chưa đăng nhập.'

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (profile?.role === 'super_admin') {
    return 'Super Admin không vận hành đánh giá tại cơ sở. Dùng tài khoản Quản lý cơ sở / Giáo vụ.'
  }

  const { data: authorized, error } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'campus_admin',
  })
  if (error) return `Lỗi kiểm tra phân quyền: ${error.message}`
  if (authorized !== true) {
    return 'TỪ CHỐI: Chỉ Quản lý cơ sở / Giáo vụ được quản lý đợt khảo sát của cơ sở này.'
  }
  return null
}

export type CampaignRow = {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'active' | 'closed'
  orgId: string
}

export type CampaignsResult =
  | { error: string }
  | { error?: undefined; campaigns: CampaignRow[] }

export async function getCampaigns(orgId: string): Promise<CampaignsResult> {
  const parsed = requiredId('Thiếu org_id: vui lòng chọn cơ sở.').safeParse(orgId)
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const authError = await assertCampusAdmin(parsed.data)
    if (authError) return { error: authError }

    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: parsed.data,
    })
    const orgIds = (subtree as string[] | null) ?? [parsed.data]
    if (!orgIds.includes(parsed.data)) orgIds.push(parsed.data)

    // [ĐA TẦNG] lọc org_id tường minh; RLS 022 chặn thêm ở tầng DB
    const { data, error } = await supabase
      .from('evaluation_campaigns')
      .select('id, name, start_date, end_date, status, org_id')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) return { error: `Không đọc được danh sách đợt khảo sát: ${error.message}` }

    return {
      campaigns: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status as 'active' | 'closed',
        orgId: row.org_id,
      })),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

export type CreateCampaignResult =
  | { error: string }
  | { error?: undefined; id: string; createdTokenCount: number; classCount: number }

export async function createCampaign(rawValues: unknown): Promise<CreateCampaignResult> {
  const parsed = campaignSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const authError = await assertCampusAdmin(values.orgId)
    if (authError) return { error: authError }

    const supabase = createClient()

    // Mỗi org chỉ nên có 1 đợt đang mở giao ngày (1 lần / kỳ).
    const { data: activeOverlaps } = await supabase
      .from('evaluation_campaigns')
      .select('id, name')
      .eq('org_id', values.orgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .lte('start_date', values.endDate)
      .gte('end_date', values.startDate)
      .limit(1)
    const activeOverlap = activeOverlaps?.[0]
    if (activeOverlap) {
      return {
        error: `Đang có đợt "${activeOverlap.name}" còn mở trong khoảng ngày này. Đóng đợt cũ trước khi mở kỳ mới (mỗi học sinh đánh giá 1 lần / kỳ).`,
      }
    }

    const { data, error } = await supabase
      .from('evaluation_campaigns')
      .insert({
        org_id: values.orgId,
        name: values.name,
        start_date: values.startDate,
        end_date: values.endDate,
        status: 'active',
      })
      .select('id')
      .single()
    if (error) return { error: `Không thể tạo đợt khảo sát: ${error.message}` }

    // Tự phát mã cho mọi lớp đang học → HS vào cổng là đánh giá được.
    const sync = await syncCampaignEvaluationTokens(data.id)
    if (sync.error !== undefined) {
      revalidatePath('/academic/campaigns')
      return {
        id: data.id,
        createdTokenCount: 0,
        classCount: 0,
        // Vẫn tạo đợt; admin có thể bấm "Đồng bộ mã" lại.
      }
    }

    revalidatePath('/academic/campaigns')
    revalidatePath('/academic/evaluations')
    revalidatePath('/portal')
    return {
      id: data.id,
      createdTokenCount: sync.createdCount,
      classCount: sync.classCount,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi tạo đợt.',
    }
  }
}

export type CloseCampaignResult = { error: string } | { error?: undefined }

export async function closeCampaign(campaignId: string): Promise<CloseCampaignResult> {
  const parsed = requiredId('Thiếu ID đợt khảo sát.').safeParse(campaignId)
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const supabase = createClient()
    const { data: campaign } = await supabase
      .from('evaluation_campaigns')
      .select('id, org_id, status')
      .eq('id', parsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!campaign) return { error: 'Đợt khảo sát không tồn tại.' }

    const authError = await assertCampusAdmin(campaign.org_id)
    if (authError) return { error: authError }
    if (campaign.status === 'closed') return {}

    const { error } = await supabase
      .from('evaluation_campaigns')
      .update({ status: 'closed' })
      .eq('id', parsed.data)
    if (error) return { error: `Không đóng được đợt khảo sát: ${error.message}` }

    revalidatePath('/academic/campaigns')
    revalidatePath(`/academic/campaigns/${parsed.data}`)
    revalidatePath('/academic/evaluations')
    revalidatePath('/portal')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi đóng đợt.',
    }
  }
}

export type CampaignClassRow = {
  classId: string
  className: string
  teacherName: string
  enrolledCount: number
  issuedCount: number
  usedCount: number
}

export type CampaignDetailResult =
  | { error: string }
  | { error?: undefined; campaign: CampaignRow; classes: CampaignClassRow[] }

export async function getCampaignDetail(campaignId: string): Promise<CampaignDetailResult> {
  const parsed = requiredId('Thiếu ID đợt khảo sát.').safeParse(campaignId)
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const supabase = createClient()
    // RLS: campus_admin chỉ đọc được đợt trong subtree của mình
    const { data: campaign } = await supabase
      .from('evaluation_campaigns')
      .select('id, name, start_date, end_date, status, org_id')
      .eq('id', parsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!campaign) return { error: 'Đợt khảo sát không tồn tại hoặc bạn không có quyền xem.' }

    const authError = await assertCampusAdmin(campaign.org_id)
    if (authError) return { error: authError }

    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: campaign.org_id,
    })
    const orgIds = (subtree as string[] | null) ?? [campaign.org_id]
    if (!orgIds.includes(campaign.org_id)) orgIds.push(campaign.org_id)

    const admin = createAdminClient()
    const [classesResult, tokensResult] = await Promise.all([
      admin
        .from('classes')
        .select('id, name, teacher_id, org_id')
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('name'),
      admin
        .from('evaluation_tokens')
        .select('class_id, is_used')
        .eq('campaign_id', parsed.data),
    ])
    const classes = classesResult.data ?? []

    // Thống kê token theo lớp
    const tokenStats = new Map<string, { issued: number; used: number }>()
    for (const token of tokensResult.data ?? []) {
      const stat = tokenStats.get(token.class_id) ?? { issued: 0, used: 0 }
      stat.issued += 1
      if (token.is_used) stat.used += 1
      tokenStats.set(token.class_id, stat)
    }

    // Sĩ số ghi danh theo lớp
    const classIds = classes.map((cls) => cls.id)
    const enrolledByClass = new Map<string, number>()
    if (classIds.length > 0) {
      const { data: enrollments } = await admin
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .is('deleted_at', null)
      for (const enrollment of enrollments ?? []) {
        enrolledByClass.set(
          enrollment.class_id,
          (enrolledByClass.get(enrollment.class_id) ?? 0) + 1
        )
      }
    }

    // Tên giáo viên
    const teacherIds = [...new Set(classes.map((cls) => cls.teacher_id).filter(Boolean))]
    const nameById = new Map<string, string>()
    if (teacherIds.length > 0) {
      const { data: teachers } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds as string[])
      for (const teacher of teachers ?? []) nameById.set(teacher.id, teacher.full_name)
    }

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        status: campaign.status as 'active' | 'closed',
        orgId: campaign.org_id,
      },
      classes: classes
        .map((cls) => {
          const stat = tokenStats.get(cls.id) ?? { issued: 0, used: 0 }
          return {
            classId: cls.id,
            className: cls.name,
            teacherName: cls.teacher_id
              ? (nameById.get(cls.teacher_id) ?? 'Chưa rõ')
              : 'Chưa gán GV',
            enrolledCount: enrolledByClass.get(cls.id) ?? 0,
            issuedCount: stat.issued,
            usedCount: stat.used,
          }
        })
        // Ưu tiên lớp có HV / đã phát phiếu; lớp trống xếp cuối
        .sort((a, b) => {
          const score = (row: CampaignClassRow) =>
            (row.issuedCount > 0 ? 2 : 0) + (row.enrolledCount > 0 ? 1 : 0)
          return score(b) - score(a) || a.className.localeCompare(b.className, 'vi')
        }),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
