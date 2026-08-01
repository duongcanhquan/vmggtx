'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================
// B2B PORTAL (/b2b) - migration 037
// Doanh nghiệp liên kết (role enterprise_partner) quản lý và
// CHẤM ĐIỂM thực tập sinh của mình. Điểm (0-10) + nhận xét được
// ĐỒNG BỘ về hồ sơ học nghề của trung tâm:
//   vocational_records.practice_score / practice_feedback.
// [BẢO MẬT] SSR client + RLS: partner chỉ thấy internships có
// enterprise_id = get_my_enterprise_id(). Bước sync dùng admin
// client SAU KHI đã xác thực kỳ thực tập thuộc đúng doanh nghiệp.
// ============================================================

export type InternRow = {
  id: string
  studentId: string
  studentName: string
  maSV: string | null
  position: string | null
  startDate: string
  endDate: string | null
  status: 'active' | 'completed' | 'terminated'
  rating: number | null
  feedback: string | null
  ratedAt: string | null
}

export type B2BBoard = {
  enterpriseName: string
  industry: string | null
  taxCode: string | null
  interns: InternRow[]
  stats: {
    total: number
    active: number
    completed: number
    rated: number
    avgRating: number | null
  }
  /** true = database chưa chạy migration 037 */
  migrationMissing: boolean
}

type ActionResult = { error: string } | { error?: undefined }

async function requirePartner(): Promise<
  | { error: string }
  | { error?: undefined; userId: string; enterpriseId: string; orgId: string | null }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, org_id, enterprise_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  // Cột enterprise_id chưa tồn tại = chưa chạy migration 037
  if (error) return { error: 'Hệ thống chưa kích hoạt B2B Portal (thiếu migration 037).' }
  if (!profile || profile.role !== 'enterprise_partner' || !profile.enterprise_id) {
    return { error: 'Chức năng này dành cho tài khoản Doanh nghiệp đối tác.' }
  }
  return {
    userId: user.id,
    enterpriseId: profile.enterprise_id as string,
    orgId: (profile.org_id as string | null) ?? null,
  }
}

const pick = (value: unknown) => (Array.isArray(value) ? value[0] : value)

export async function getB2BBoard(): Promise<
  { error: string } | ({ error?: undefined } & B2BBoard)
> {
  try {
    const auth = await requirePartner()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()

    const [enterpriseResult, internsResult] = await Promise.all([
      supabase
        .from('enterprises')
        .select('name, industry, tax_code')
        .eq('id', auth.enterpriseId)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('internships')
        .select(
          'id, student_id, position, start_date, end_date, status, enterprise_rating, feedback_notes, rated_at, profiles!internships_student_id_fkey(full_name, "MaSV")'
        )
        .eq('enterprise_id', auth.enterpriseId)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(500),
    ])

    const migrationMissing =
      enterpriseResult.error !== null || internsResult.error !== null

    const interns: InternRow[] = (internsResult.data ?? []).map((row) => {
      const student = pick(row.profiles) as
        | { full_name?: string; MaSV?: string | null }
        | null
      return {
        id: row.id,
        studentId: row.student_id,
        studentName: student?.full_name ?? '—',
        maSV: student?.MaSV ?? null,
        position: row.position,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status as InternRow['status'],
        rating: row.enterprise_rating === null ? null : Number(row.enterprise_rating),
        feedback: row.feedback_notes,
        ratedAt: row.rated_at,
      }
    })

    const rated = interns.filter((i) => i.rating !== null)
    const avgRating =
      rated.length > 0
        ? Math.round(
            (rated.reduce((sum, i) => sum + (i.rating ?? 0), 0) / rated.length) * 100
          ) / 100
        : null

    return {
      enterpriseName: enterpriseResult.data?.name ?? 'Doanh nghiệp đối tác',
      industry: enterpriseResult.data?.industry ?? null,
      taxCode: enterpriseResult.data?.tax_code ?? null,
      interns,
      stats: {
        total: interns.length,
        active: interns.filter((i) => i.status === 'active').length,
        completed: interns.filter((i) => i.status === 'completed').length,
        rated: rated.length,
        avgRating,
      },
      migrationMissing,
    }
  } catch {
    return { error: 'Không tải được dữ liệu thực tập sinh. Vui lòng thử lại.' }
  }
}

/**
 * Doanh nghiệp chấm điểm thực hành (0-10) + nhận xét thái độ nghề nghiệp.
 * Điểm được ĐỒNG BỘ về vocational_records của trung tâm (upsert).
 */
export async function rateIntern(input: {
  internshipId: string
  rating: number
  feedback: string
}): Promise<ActionResult> {
  try {
    const auth = await requirePartner()
    if (auth.error !== undefined) return { error: auth.error }

    const rating = Number(input.rating)
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      return { error: 'Điểm phải nằm trong khoảng 0 đến 10.' }
    }
    const feedback = (input.feedback ?? '').trim().slice(0, 2000)

    const supabase = createClient()

    // Xác thực kỳ thực tập thuộc đúng doanh nghiệp (RLS cũng chặn, nhưng
    // cần dữ liệu student_id/org_id cho bước sync)
    const { data: internship } = await supabase
      .from('internships')
      .select('id, student_id, org_id, enterprise_id')
      .eq('id', input.internshipId)
      .eq('enterprise_id', auth.enterpriseId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!internship) {
      return { error: 'Không tìm thấy kỳ thực tập này tại doanh nghiệp của bạn.' }
    }

    const { error: updateError } = await supabase
      .from('internships')
      .update({
        enterprise_rating: rating,
        feedback_notes: feedback || null,
        rated_by: auth.userId,
        rated_at: new Date().toISOString(),
      })
      .eq('id', internship.id)
      .eq('enterprise_id', auth.enterpriseId)
    if (updateError) {
      return { error: 'Không lưu được điểm. Vui lòng thử lại.' }
    }

    // ---- ĐỒNG BỘ về bảng điểm nghề của trung tâm ----
    // Partner không có quyền ghi vocational_records -> dùng admin client
    // sau khi đã xác thực internship ở trên.
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('vocational_records')
      .select('id')
      .eq('student_id', internship.student_id)
      .eq('org_id', internship.org_id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    const syncPayload = {
      practice_score: rating,
      practice_feedback: feedback || null,
      partner_enterprise_id: internship.enterprise_id,
    }

    if (existing) {
      await admin.from('vocational_records').update(syncPayload).eq('id', existing.id)
    } else {
      await admin.from('vocational_records').insert({
        student_id: internship.student_id,
        org_id: internship.org_id,
        ...syncPayload,
      })
    }

    revalidatePath('/b2b')
    revalidatePath('/b2b/interns')
    revalidatePath('/b2b/reviews')
    return {}
  } catch {
    return { error: 'Có lỗi khi chấm điểm. Vui lòng thử lại.' }
  }
}
