'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requiredId, zodFail, type ActionResult } from '@/lib/validation/schemas'

// ============================================================
// QUẢN LÝ KHẢO THÍ (/staff/exams)
// - getExamBoard: bài thi (assessments) của các lớp trong subtree
//   org của user + trạng thái khóa (class_results.lock_status).
// - extendGradingDeadline: "Gia hạn nhập điểm" - dời deadline về
//   tương lai + mở lock_status (giáo viên nhập bù theo đơn xin phép).
// - lockClassResults: "Chốt sổ điểm" - lock_status='locked'
//   (trigger DB chặn tuyệt đối mọi thay đổi điểm).
// ============================================================

export type ExamStatus = 'open' | 'pending_review' | 'locked'

export type ExamRow = {
  assessmentId: string
  assessmentName: string
  classId: string
  className: string
  orgId: string
  gradingDeadline: string | null
  lockStatus: 'open' | 'review' | 'locked'
  /** Trạng thái hiển thị: xanh (còn hạn) / vàng (quá hạn chờ duyệt) / đỏ (đã chốt) */
  status: ExamStatus
  gradeCount: number
}

export type ExamBoardResult =
  | { error: string }
  | { error?: undefined; exams: ExamRow[] }

/** Xác định phạm vi org (subtree của org user; super_admin thấy theo org gốc của mình) */
async function getScope(): Promise<
  { error: string } | { error?: undefined; userId: string; orgIds: string[] }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile?.org_id) return { error: 'Tài khoản chưa gắn cơ sở.' }

  const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: profile.org_id,
  })
  const orgIds = (subtree as string[] | null) ?? [profile.org_id]
  if (!orgIds.includes(profile.org_id)) orgIds.push(profile.org_id)
  return { userId: user.id, orgIds }
}

export async function getExamBoard(): Promise<ExamBoardResult> {
  try {
    const scope = await getScope()
    if (scope.error !== undefined) return { error: scope.error }

    const supabase = createClient()
    // [ĐA TẦNG] lọc org_id tường minh; RLS gradebook chặn thêm ở DB
    const { data: assessments, error } = await supabase
      .from('assessments')
      .select('id, name, class_id, org_id, grading_deadline, classes(name)')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('grading_deadline', { ascending: true, nullsFirst: false })
    if (error) return { error: `Không tải được danh sách bài thi: ${error.message}` }

    const rows = (assessments ?? []) as unknown as {
      id: string
      name: string
      class_id: string
      org_id: string
      grading_deadline: string | null
      classes: { name: string } | null
    }[]

    // Trạng thái khóa theo lớp + số điểm đã nhập theo bài
    const classIds = [...new Set(rows.map((row) => row.class_id))]
    const lockByClass = new Map<string, 'open' | 'review' | 'locked'>()
    if (classIds.length > 0) {
      const { data: results } = await supabase
        .from('class_results')
        .select('class_id, lock_status')
        .in('class_id', classIds)
        .is('deleted_at', null)
      for (const result of results ?? []) {
        lockByClass.set(result.class_id, result.lock_status as 'open' | 'review' | 'locked')
      }
    }

    const assessmentIds = rows.map((row) => row.id)
    const gradeCounts = new Map<string, number>()
    if (assessmentIds.length > 0) {
      const { data: grades } = await supabase
        .from('grades')
        .select('assessment_id')
        .in('assessment_id', assessmentIds)
        .is('deleted_at', null)
      for (const grade of grades ?? []) {
        gradeCounts.set(
          grade.assessment_id,
          (gradeCounts.get(grade.assessment_id) ?? 0) + 1
        )
      }
    }

    const now = Date.now()
    const exams: ExamRow[] = rows.map((row) => {
      const lockStatus = lockByClass.get(row.class_id) ?? 'open'
      const expired =
        row.grading_deadline !== null && now > new Date(row.grading_deadline).getTime()
      const status: ExamStatus =
        lockStatus === 'locked' ? 'locked' : expired ? 'pending_review' : 'open'
      return {
        assessmentId: row.id,
        assessmentName: row.name,
        classId: row.class_id,
        className: row.classes?.name ?? 'Lớp học',
        orgId: row.org_id,
        gradingDeadline: row.grading_deadline,
        lockStatus,
        status,
        gradeCount: gradeCounts.get(row.id) ?? 0,
      }
    })

    // Vàng (chờ duyệt) nổi lên trước, rồi xanh, rồi đỏ
    const order: Record<ExamStatus, number> = { pending_review: 0, open: 1, locked: 2 }
    exams.sort((a, b) => order[a.status] - order[b.status])

    return { exams }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

/** Chốt cửa: academic_staff trở lên trên org đích */
async function assertExamOfficer(orgId: string): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Bạn chưa đăng nhập.'

  const { data: authorized, error } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
  })
  if (error) return `Lỗi kiểm tra phân quyền: ${error.message}`
  if (authorized !== true) {
    return 'TỪ CHỐI: Chỉ Giáo vụ/Khảo thí trở lên được thao tác trên cơ sở này.'
  }
  return null
}

const extendSchema = z.object({
  assessmentId: requiredId('Thiếu ID bài thi.'),
  // datetime-local: YYYY-MM-DDTHH:mm
  newDeadline: z
    .string({ required_error: 'Vui lòng chọn hạn nhập điểm mới.' })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Hạn nhập điểm không đúng định dạng.'),
})

/**
 * "Gia hạn nhập điểm": dời grading_deadline về tương lai + mở lại
 * lock_status của lớp (nếu đang review/locked) để GV nhập bù.
 */
export async function extendGradingDeadline(rawValues: unknown): Promise<ActionResult> {
  const parsed = extendSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)

  const newDeadline = new Date(parsed.data.newDeadline)
  if (Number.isNaN(newDeadline.getTime())) {
    return { error: 'Hạn nhập điểm mới không hợp lệ.' }
  }
  if (newDeadline.getTime() <= Date.now()) {
    return { error: 'Hạn nhập điểm mới phải ở tương lai.' }
  }

  try {
    const supabase = createClient()
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, class_id, org_id')
      .eq('id', parsed.data.assessmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assessment) return { error: 'Bài thi không tồn tại.' }

    const authError = await assertExamOfficer(assessment.org_id)
    if (authError) return { error: authError }

    const { error: updateError } = await supabase
      .from('assessments')
      .update({ grading_deadline: newDeadline.toISOString() })
      .eq('id', assessment.id)
    if (updateError) return { error: `Không thể gia hạn: ${updateError.message}` }

    // Mở khóa lớp để trigger DB cho nhập lại
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: unlockError } = await supabase.from('class_results').upsert(
      {
        org_id: assessment.org_id,
        class_id: assessment.class_id,
        lock_status: 'open',
        locked_at: null,
        locked_by: user?.id ?? null,
      },
      { onConflict: 'class_id' }
    )
    if (unlockError) return { error: `Gia hạn xong nhưng không mở được khóa: ${unlockError.message}` }

    revalidatePath('/staff/exams')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi gia hạn.',
    }
  }
}

/** "Chốt sổ điểm": lock_status='locked' — trigger DB chặn mọi thay đổi điểm. */
export async function lockClassResults(classId: string): Promise<ActionResult> {
  const parsed = requiredId('Thiếu ID lớp học.').safeParse(classId)
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const supabase = createClient()
    const { data: cls } = await supabase
      .from('classes')
      .select('id, org_id')
      .eq('id', parsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls) return { error: 'Lớp học không tồn tại.' }

    const authError = await assertExamOfficer(cls.org_id)
    if (authError) return { error: authError }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('class_results').upsert(
      {
        org_id: cls.org_id,
        class_id: cls.id,
        lock_status: 'locked',
        locked_at: new Date().toISOString(),
        locked_by: user?.id ?? null,
      },
      { onConflict: 'class_id' }
    )
    if (error) return { error: `Không thể chốt sổ: ${error.message}` }

    revalidatePath('/staff/exams')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi chốt sổ.',
    }
  }
}
