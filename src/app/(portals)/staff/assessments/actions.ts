'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// PORTAL KHẢO THÍ CHUYÊN SÂU (/staff/assessments) - migration 036
// 1) Mã đề thi (exam_variants): tạo/xóa mã đề + link file đề.
// 2) Giám thị: gán GV vào phòng thi (tái dùng exam_schedules +
//    exam_proctors từ migration 031, action assign ở exam-schedule).
// 3) Đơn thi lại (re_examination_requests): "Duyệt & Xếp lịch" TỰ
//    SINH assessment "Thi lại" mới và gắn vào đơn (new_assessment_id);
//    các đơn cùng bài thi được gom về CÙNG một buổi thi lại.
// [ĐA TẦNG] SSR client + RLS subtree, double-check role tường minh.
// ============================================================

const STAFF_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

export type AssessmentOption = {
  id: string
  name: string
  className: string
}

export type ExamVariantRow = {
  id: string
  assessmentId: string
  assessmentName: string
  variantCode: string
  fileUrl: string | null
}

export type ProctorRoomRow = {
  id: string
  assessmentName: string
  room: string
  startTime: string
  endTime: string
  proctors: { id: string; teacherName: string; role: string }[]
}

export type ReExamStatus = 'pending' | 'approved' | 'rejected' | 'rescheduled'

export type ReExamRequestRow = {
  id: string
  studentName: string
  assessmentName: string
  className: string
  reason: string
  status: ReExamStatus
  createdAt: string
  decisionNote: string | null
  newAssessmentName: string | null
}

export type AssessmentOpsBoard = {
  assessments: AssessmentOption[]
  variants: ExamVariantRow[]
  rooms: ProctorRoomRow[]
  teachers: { id: string; name: string }[]
  requests: ReExamRequestRow[]
  /** true = database chưa chạy migration 036 */
  migrationMissing: boolean
}

type ActionResult = { error: string } | { error?: undefined }

async function requireStaff(): Promise<
  { error: string } | { error?: undefined; userId: string; orgId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || !STAFF_ROLES.includes(profile.role) || !profile.org_id) {
    return { error: 'Chức năng này dành cho Giáo vụ / Khảo thí.' }
  }
  return { userId: user.id, orgId: profile.org_id }
}

const pick = (value: unknown) => (Array.isArray(value) ? value[0] : value)
const pickName = (value: unknown): string =>
  ((pick(value) as { name?: string; full_name?: string } | null)?.name ??
    (pick(value) as { full_name?: string } | null)?.full_name ??
    '—') as string

export async function getAssessmentOps(): Promise<
  { error: string } | ({ error?: undefined } & AssessmentOpsBoard)
> {
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, auth.orgId)

    const [assessmentsResult, roomsResult, teachersResult, variantsResult, requestsResult] =
      await Promise.all([
        supabase
          .from('assessments')
          .select('id, name, classes(name)')
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('exam_schedules')
          .select(
            'id, room, start_time, end_time, assessments(name), exam_proctors(id, role, profiles(full_name))'
          )
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .gte('end_time', new Date(Date.now() - 24 * 3600_000).toISOString())
          .order('start_time', { ascending: true })
          .limit(50),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('org_id', orgIds)
          .eq('role', 'teacher')
          .is('deleted_at', null)
          .order('full_name'),
        supabase
          .from('exam_variants')
          .select('id, assessment_id, variant_code, file_url, assessments(name)')
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('re_examination_requests')
          .select(
            'id, reason, status, created_at, decision_note, profiles!re_examination_requests_student_id_fkey(full_name), assessments!re_examination_requests_assessment_id_fkey(name, classes(name)), new_assessment:assessments!re_examination_requests_new_assessment_id_fkey(name)'
          )
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(100),
      ])

    // Thiếu migration 036 -> phần mã đề + đơn thi lại trống, còn lại vẫn chạy
    const migrationMissing =
      variantsResult.error !== null || requestsResult.error !== null

    const assessments: AssessmentOption[] = (assessmentsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      className: pickName(row.classes),
    }))

    const rooms: ProctorRoomRow[] = (roomsResult.data ?? []).map((row) => ({
      id: row.id,
      assessmentName: pickName(row.assessments),
      room: row.room,
      startTime: row.start_time,
      endTime: row.end_time,
      proctors: ((row.exam_proctors as unknown[] | null) ?? []).map((proctor) => {
        const p = proctor as { id: string; role: string; profiles: unknown }
        return {
          id: p.id,
          teacherName: pickName(p.profiles),
          role: p.role === 'proctor_2' ? 'Giám thị 2' : 'Giám thị 1',
        }
      }),
    }))

    const variants: ExamVariantRow[] = (variantsResult.data ?? []).map((row) => ({
      id: row.id,
      assessmentId: row.assessment_id,
      assessmentName: pickName(row.assessments),
      variantCode: row.variant_code,
      fileUrl: row.file_url,
    }))

    const requests: ReExamRequestRow[] = (requestsResult.data ?? []).map((row) => {
      const assessment = pick(row.assessments) as {
        name?: string
        classes?: unknown
      } | null
      return {
        id: row.id,
        studentName: pickName(row.profiles),
        assessmentName: assessment?.name ?? '—',
        className: pickName(assessment?.classes),
        reason: row.reason,
        status: row.status as ReExamStatus,
        createdAt: row.created_at,
        decisionNote: row.decision_note,
        newAssessmentName:
          (pick(row.new_assessment) as { name?: string } | null)?.name ?? null,
      }
    })

    return {
      assessments,
      variants,
      rooms,
      teachers: (teachersResult.data ?? []).map((t) => ({ id: t.id, name: t.full_name })),
      requests,
      migrationMissing,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

// ============================================================
// MÃ ĐỀ THI
// ============================================================

export async function addExamVariant(
  assessmentId: string,
  variantCode: string,
  fileUrl: string
): Promise<ActionResult> {
  const code = variantCode.trim()
  if (!assessmentId || !code) return { error: 'Chọn bài kiểm tra và nhập mã đề.' }
  if (code.length > 50) return { error: 'Mã đề tối đa 50 ký tự.' }
  const url = fileUrl.trim()
  if (url && !/^https?:\/\/.+/i.test(url)) {
    return { error: 'Link file đề phải bắt đầu bằng http(s)://' }
  }

  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    // Lấy org_id từ assessment (đảm bảo cùng subtree qua RLS)
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, org_id')
      .eq('id', assessmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assessment) return { error: 'Không tìm thấy bài kiểm tra trong phạm vi của bạn.' }

    const { error } = await supabase.from('exam_variants').insert({
      org_id: assessment.org_id,
      assessment_id: assessmentId,
      variant_code: code,
      file_url: url || null,
      created_by: auth.userId,
    })
    if (error) {
      if (/uq_exam_variant/i.test(error.message)) {
        return { error: `Mã đề "${code}" đã tồn tại cho bài kiểm tra này.` }
      }
      if (/exam_variants|does not exist/i.test(error.message)) {
        return { error: 'Database thiếu migration 036_assessment_workflows.sql.' }
      }
      return { error: `Không tạo được mã đề: ${error.message}` }
    }
    revalidatePath('/staff/assessments')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

export async function deleteExamVariant(variantId: string): Promise<ActionResult> {
  if (!variantId) return { error: 'Thiếu mã đề.' }
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error } = await supabase
      .from('exam_variants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', variantId)
    if (error) return { error: `Không xóa được mã đề: ${error.message}` }
    revalidatePath('/staff/assessments')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

// ============================================================
// DUYỆT ĐƠN THI LẠI - "Duyệt & Xếp lịch" tự sinh assessment mới
// ============================================================

export async function resolveReExamRequest(
  requestId: string,
  action: 'approve' | 'reject',
  note: string
): Promise<{ error: string } | { error?: undefined; newAssessmentName?: string }> {
  if (!requestId) return { error: 'Thiếu mã đơn.' }
  const trimmedNote = note.trim()
  if (action === 'reject' && trimmedNote.length < 3) {
    return { error: 'Từ chối phải kèm lý do (ít nhất 3 ký tự).' }
  }

  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: request } = await supabase
      .from('re_examination_requests')
      .select(
        'id, status, assessment_id, org_id, assessments!re_examination_requests_assessment_id_fkey(id, name, class_id, weight, max_score, org_id)'
      )
      .eq('id', requestId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!request) return { error: 'Không tìm thấy đơn trong phạm vi của bạn.' }
    if (request.status !== 'pending') {
      return { error: 'Đơn này đã được xử lý trước đó.' }
    }

    if (action === 'reject') {
      const { error } = await supabase
        .from('re_examination_requests')
        .update({
          status: 'rejected',
          decided_by: auth.userId,
          decision_note: trimmedNote.slice(0, 500),
          decided_at: new Date().toISOString(),
        })
        .eq('id', requestId)
      if (error) return { error: `Không từ chối được đơn: ${error.message}` }
      revalidatePath('/staff/assessments')
      return {}
    }

    // ===== APPROVE & XẾP LỊCH =====
    const assessment = pick(request.assessments) as {
      id: string
      name: string
      class_id: string
      weight: number
      max_score: number
      org_id: string
    } | null
    if (!assessment) return { error: 'Bài kiểm tra gốc không còn tồn tại.' }

    // Gom đơn: nếu đã có buổi "Thi lại" sinh cho bài này thì DÙNG CHUNG,
    // tránh mỗi đơn tạo 1 assessment riêng lẻ.
    const { data: sibling } = await supabase
      .from('re_examination_requests')
      .select('new_assessment_id')
      .eq('assessment_id', request.assessment_id)
      .eq('status', 'rescheduled')
      .not('new_assessment_id', 'is', null)
      .is('deleted_at', null)
      .order('decided_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let newAssessmentId = sibling?.new_assessment_id as string | null
    let newAssessmentName = `Thi lại - ${assessment.name}`

    if (newAssessmentId) {
      const { data: existing } = await supabase
        .from('assessments')
        .select('id, name')
        .eq('id', newAssessmentId)
        .is('deleted_at', null)
        .maybeSingle()
      if (existing) {
        newAssessmentName = existing.name
      } else {
        newAssessmentId = null
      }
    }

    if (!newAssessmentId) {
      const { data: created, error: createError } = await supabase
        .from('assessments')
        .insert({
          org_id: assessment.org_id,
          class_id: assessment.class_id,
          name: newAssessmentName,
          weight: assessment.weight,
          max_score: assessment.max_score,
        })
        .select('id')
        .single()
      if (createError || !created) {
        return { error: `Không sinh được buổi thi lại: ${createError?.message ?? 'lỗi không rõ'}` }
      }
      newAssessmentId = created.id
    }

    const { error: updateError } = await supabase
      .from('re_examination_requests')
      .update({
        status: 'rescheduled',
        new_assessment_id: newAssessmentId,
        decided_by: auth.userId,
        decision_note: trimmedNote ? trimmedNote.slice(0, 500) : null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (updateError) return { error: `Không cập nhật được đơn: ${updateError.message}` }

    revalidatePath('/staff/assessments')
    return { newAssessmentName }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
