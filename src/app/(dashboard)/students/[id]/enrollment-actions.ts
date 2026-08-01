'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'

// ============================================================
// QUẢN LÝ GHI DANH (Student 360) - migration 030
// Giáo vụ / Quản lý cơ sở có thể: ghi danh vào lớp, chuyển lớp,
// bảo lưu (paused), thôi học (dropped), học xong (completed).
// - Check sĩ số tối đa (classes.max_students) trước khi ghi danh.
// - Ghi lý do (status_note) để truy vết vận hành.
// - Authz: is_authorized(user, org học sinh, 'academic_staff').
// ============================================================

export type EnrollmentRow = {
  id: string
  classId: string
  className: string
  status: 'active' | 'completed' | 'dropped' | 'paused'
  statusNote: string | null
  createdAt: string
}

export type EnrollableClass = {
  id: string
  name: string
  activeCount: number
  maxStudents: number | null
}

export type EnrollmentPanel = {
  enrollments: EnrollmentRow[]
  classes: EnrollableClass[]
}

type ActionResult = { error: string } | { error?: undefined }

async function authorizeForStudent(studentId: string): Promise<
  { error: string } | { error?: undefined; orgId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: student } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()
  if (!student) return { error: 'Học sinh không tồn tại.' }

  const { data: authorized } = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: student.org_id,
    p_required_role: 'academic_staff',
    p_menu_key: 'students',
  })
  if (authorized !== true) {
    return { error: 'Bạn không có quyền quản lý ghi danh cho học sinh này.' }
  }
  return { orgId: student.org_id as string }
}

/** Danh sách ghi danh của học sinh + các lớp có thể ghi danh (kèm sĩ số) */
export async function getEnrollmentPanel(studentId: string): Promise<
  { error: string } | { error?: undefined; panel: EnrollmentPanel }
> {
  try {
    const authz = await authorizeForStudent(studentId)
    if (authz.error !== undefined) return { error: authz.error }

    const supabase = createClient()
    const [enrollmentsResult, classesResult] = await Promise.all([
      supabase
        .from('enrollments')
        .select('id, class_id, status, created_at, classes(name)')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('classes')
        .select('id, name')
        .eq('org_id', authz.orgId)
        .is('deleted_at', null)
        .order('name'),
    ])
    if (enrollmentsResult.error) return { error: enrollmentsResult.error.message }

    // status_note có thể chưa tồn tại (pre-030) -> query riêng, bỏ qua lỗi
    const noteById = new Map<string, string | null>()
    const { data: noteRows } = await supabase
      .from('enrollments')
      .select('id, status_note')
      .eq('student_id', studentId)
      .is('deleted_at', null)
    for (const row of noteRows ?? []) {
      noteById.set(row.id, (row as { status_note?: string | null }).status_note ?? null)
    }

    // max_students có thể chưa tồn tại (pre-030)
    const maxById = new Map<string, number | null>()
    const { data: maxRows } = await supabase
      .from('classes')
      .select('id, max_students')
      .eq('org_id', authz.orgId)
      .is('deleted_at', null)
    for (const row of maxRows ?? []) {
      maxById.set(row.id, (row as { max_students?: number | null }).max_students ?? null)
    }

    // Sĩ số active hiện tại của từng lớp
    const classIds = (classesResult.data ?? []).map((c) => c.id)
    const activeCount = new Map<string, number>()
    if (classIds.length > 0) {
      const { data: activeRows } = await supabase
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'active')
        .is('deleted_at', null)
      for (const row of activeRows ?? []) {
        activeCount.set(row.class_id, (activeCount.get(row.class_id) ?? 0) + 1)
      }
    }

    const pickName = (value: unknown): string => {
      const obj = Array.isArray(value) ? value[0] : value
      return (obj as { name?: string } | null)?.name ?? 'Lớp học'
    }

    return {
      panel: {
        enrollments: (enrollmentsResult.data ?? []).map((row) => ({
          id: row.id,
          classId: row.class_id,
          className: pickName(row.classes),
          status: row.status as EnrollmentRow['status'],
          statusNote: noteById.get(row.id) ?? null,
          createdAt: row.created_at,
        })),
        classes: (classesResult.data ?? []).map((cls) => ({
          id: cls.id,
          name: cls.name,
          activeCount: activeCount.get(cls.id) ?? 0,
          maxStudents: maxById.get(cls.id) ?? null,
        })),
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Sĩ số check: lớp còn chỗ không? */
async function assertClassHasCapacity(
  supabase: ReturnType<typeof createClient>,
  classId: string
): Promise<string | null> {
  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, max_students')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!cls) return 'Lớp học không tồn tại.'

  const max = (cls as { max_students?: number | null }).max_students
  if (max == null) return null

  const { count } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('status', 'active')
    .is('deleted_at', null)
  if ((count ?? 0) >= max) {
    return `Lớp ${cls.name} đã đầy (${count}/${max}). Tăng sĩ số tối đa hoặc chọn lớp khác.`
  }
  return null
}

/** Ghi danh học sinh vào lớp (tái kích hoạt nếu từng ghi danh trước đó) */
export async function enrollStudentToClass(
  studentId: string,
  classId: string,
  note?: string
): Promise<ActionResult> {
  if (!classId) return { error: 'Vui lòng chọn lớp.' }
  try {
    const authz = await authorizeForStudent(studentId)
    if (authz.error !== undefined) return { error: authz.error }

    const supabase = createClient()
    const capacityError = await assertClassHasCapacity(supabase, classId)
    if (capacityError) return { error: capacityError }

    // unique (class_id, student_id): nếu từng ghi danh -> update lại active
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'active') {
        return { error: 'Học sinh đã đang học lớp này.' }
      }
      let { error } = await supabase
        .from('enrollments')
        .update(withStatusMeta({ status: 'active', deleted_at: null }, note))
        .eq('id', existing.id)
      if (error && /status_note|status_changed_at|column/i.test(error.message)) {
        const retry = await supabase
          .from('enrollments')
          .update({ status: 'active', deleted_at: null })
          .eq('id', existing.id)
        error = retry.error
      }
      if (error) return { error: `Không ghi danh được: ${error.message}` }
    } else {
      const { data: cls } = await supabase
        .from('classes')
        .select('org_id')
        .eq('id', classId)
        .maybeSingle()
      const { error } = await supabase.from('enrollments').insert({
        org_id: cls?.org_id ?? authz.orgId,
        class_id: classId,
        student_id: studentId,
        status: 'active',
      })
      if (error) return { error: `Không ghi danh được: ${error.message}` }
    }

    revalidatePath(`/students/${studentId}`)
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

function withStatusMeta(
  base: Record<string, unknown>,
  note?: string
): Record<string, unknown> {
  return {
    ...base,
    status_note: note?.trim() || null,
    status_changed_at: new Date().toISOString(),
  }
}

/** Đổi trạng thái ghi danh: bảo lưu / thôi học / học xong / học lại */
export async function updateEnrollmentStatus(
  studentId: string,
  enrollmentId: string,
  status: 'active' | 'paused' | 'dropped' | 'completed',
  note: string
): Promise<ActionResult> {
  if (!['active', 'paused', 'dropped', 'completed'].includes(status)) {
    return { error: 'Trạng thái không hợp lệ.' }
  }
  if ((status === 'paused' || status === 'dropped') && note.trim().length < 3) {
    return { error: 'Vui lòng ghi lý do khi bảo lưu / thôi học.' }
  }
  try {
    const authz = await authorizeForStudent(studentId)
    if (authz.error !== undefined) return { error: authz.error }

    const supabase = createClient()
    let { error } = await supabase
      .from('enrollments')
      .update(withStatusMeta({ status }, note))
      .eq('id', enrollmentId)
      .eq('student_id', studentId)

    // Pre-030: cột status_note/status_changed_at hoặc status 'paused' chưa có
    if (error && /status_note|status_changed_at|column/i.test(error.message)) {
      const retry = await supabase
        .from('enrollments')
        .update({ status })
        .eq('id', enrollmentId)
        .eq('student_id', studentId)
      error = retry.error
    }
    if (error) {
      if (/enrollments_status_check/i.test(error.message)) {
        return {
          error:
            'Trạng thái "Bảo lưu" cần migration 030_operations.sql — hãy chạy trong Supabase SQL Editor.',
        }
      }
      return { error: `Không đổi được trạng thái: ${error.message}` }
    }

    revalidatePath(`/students/${studentId}`)
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Chuyển lớp: đóng ghi danh cũ (dropped + lý do) rồi ghi danh lớp mới */
export async function transferEnrollment(
  studentId: string,
  enrollmentId: string,
  newClassId: string,
  note: string
): Promise<ActionResult> {
  if (!newClassId) return { error: 'Vui lòng chọn lớp chuyển đến.' }
  try {
    const authz = await authorizeForStudent(studentId)
    if (authz.error !== undefined) return { error: authz.error }

    const supabase = createClient()
    const { data: current } = await supabase
      .from('enrollments')
      .select('id, class_id, classes(name)')
      .eq('id', enrollmentId)
      .eq('student_id', studentId)
      .maybeSingle()
    if (!current) return { error: 'Ghi danh không tồn tại.' }
    if (current.class_id === newClassId) return { error: 'Lớp chuyển đến trùng lớp hiện tại.' }

    const capacityError = await assertClassHasCapacity(supabase, newClassId)
    if (capacityError) return { error: capacityError }

    // Ghi danh lớp mới TRƯỚC (nếu fail thì chưa động gì tới lớp cũ)
    const enrollResult = await enrollStudentToClass(
      studentId,
      newClassId,
      note.trim() || 'Chuyển lớp'
    )
    if (enrollResult.error !== undefined) return { error: enrollResult.error }

    const oldName = (() => {
      const obj = Array.isArray(current.classes) ? current.classes[0] : current.classes
      return (obj as { name?: string } | null)?.name ?? 'lớp cũ'
    })()
    let { error } = await supabase
      .from('enrollments')
      .update(
        withStatusMeta(
          { status: 'dropped' },
          `Chuyển lớp từ ${oldName}${note.trim() ? ` — ${note.trim()}` : ''}`
        )
      )
      .eq('id', enrollmentId)
    if (error && /status_note|status_changed_at|column/i.test(error.message)) {
      const retry = await supabase
        .from('enrollments')
        .update({ status: 'dropped' })
        .eq('id', enrollmentId)
      error = retry.error
    }
    if (error) return { error: `Đã ghi danh lớp mới nhưng không đóng được lớp cũ: ${error.message}` }

    revalidatePath(`/students/${studentId}`)
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
