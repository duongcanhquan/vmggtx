'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'

// ============================================================
// HỒ SƠ GIẢNG VIÊN (/teachers) - admin-side
// - Danh bạ giảng viên trong phạm vi quản lý (subtree).
// - Gán/gỡ LỚP cho giảng viên (cập nhật classes.teacher_id).
// Quyền: campus_admin / academic_staff (hoặc được GÁN kiêm nhiệm
// key 'teachers' - is_authorized v2 với p_menu_key).
// ============================================================

export type TeacherRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  org_id: string | null
  org_name: string
  /** Lớp đang phụ trách */
  classes: { id: string; name: string }[]
}

export type AssignableClass = {
  id: string
  name: string
  org_name: string
  /** Giảng viên hiện tại của lớp (null = chưa gán) */
  teacher_id: string | null
  teacher_name: string | null
  student_count: number
}

type Gate =
  | { error: string }
  | { error?: undefined; userId: string; scope: string[] | null }

/** Gác cổng: đăng nhập + đủ quyền vận hành (role hoặc kiêm nhiệm 'teachers') */
async function requireTeacherManager(): Promise<Gate> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: me } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!me) return { error: 'Không tìm thấy hồ sơ của bạn.' }

  if (me.role === 'super_admin') return { userId: user.id, scope: null }
  if (!me.org_id) return { error: 'Tài khoản chưa gắn cơ sở.' }

  // Role vận hành hoặc quyền kiêm nhiệm 'teachers' (049)
  const { data: authorized } = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: me.org_id,
    p_required_role: 'academic_staff',
    p_menu_key: 'teachers',
  })
  if (authorized !== true) {
    return { error: 'Bạn không có quyền quản lý hồ sơ giảng viên.' }
  }

  const scope = await getDescendantOrgIds(supabase, me.org_id)
  return { userId: user.id, scope }
}

/** Danh bạ giảng viên + lớp đang phụ trách (2 query song song) */
export async function getTeacherDirectory(): Promise<
  { error: string } | { error?: undefined; teachers: TeacherRow[] }
> {
  const gate = await requireTeacherManager()
  if (gate.error !== undefined) return { error: gate.error }

  const supabase = createClient()

  let teacherQuery = supabase
    .from('profiles')
    .select('id, full_name, email, phone, org_id, organizations(name)')
    .eq('role', 'teacher')
    .is('deleted_at', null)
    .order('full_name')
  if (gate.scope) teacherQuery = teacherQuery.in('org_id', gate.scope)

  let classQuery = supabase
    .from('classes')
    .select('id, name, teacher_id')
    .not('teacher_id', 'is', null)
    .is('deleted_at', null)
  if (gate.scope) classQuery = classQuery.in('org_id', gate.scope)

  const [{ data: teachers, error: tError }, { data: classes, error: cError }] =
    await Promise.all([teacherQuery, classQuery])

  if (tError) return { error: `Lỗi tải giảng viên: ${tError.message}` }
  if (cError) return { error: `Lỗi tải lớp học: ${cError.message}` }

  const classesByTeacher = new Map<string, { id: string; name: string }[]>()
  for (const cls of classes ?? []) {
    if (!cls.teacher_id) continue
    const list = classesByTeacher.get(cls.teacher_id) ?? []
    list.push({ id: cls.id, name: cls.name })
    classesByTeacher.set(cls.teacher_id, list)
  }

  return {
    teachers: (teachers ?? []).map((row) => {
      const org = row.organizations as { name: string } | { name: string }[] | null
      return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: (row.phone as string | null) ?? null,
        org_id: row.org_id,
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        classes: classesByTeacher.get(row.id) ?? [],
      }
    }),
  }
}

/** Toàn bộ lớp trong phạm vi (để gán) + sĩ số + giảng viên hiện tại */
export async function getAssignableClasses(): Promise<
  { error: string } | { error?: undefined; classes: AssignableClass[] }
> {
  const gate = await requireTeacherManager()
  if (gate.error !== undefined) return { error: gate.error }

  const supabase = createClient()

  let query = supabase
    .from('classes')
    .select(
      'id, name, teacher_id, organizations(name), teacher:profiles!classes_teacher_id_fkey(full_name), enrollments(count)'
    )
    .is('deleted_at', null)
    .order('name')
  if (gate.scope) query = query.in('org_id', gate.scope)

  const { data, error } = await query
  if (error) return { error: `Lỗi tải danh sách lớp: ${error.message}` }

  return {
    classes: (data ?? []).map((row) => {
      const org = row.organizations as { name: string } | { name: string }[] | null
      const teacher = row.teacher as { full_name: string } | { full_name: string }[] | null
      const enrollCount = Array.isArray(row.enrollments)
        ? ((row.enrollments[0] as { count?: number } | undefined)?.count ?? 0)
        : 0
      return {
        id: row.id,
        name: row.name,
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        teacher_id: row.teacher_id,
        teacher_name: Array.isArray(teacher)
          ? teacher[0]?.full_name ?? null
          : teacher?.full_name ?? null,
        student_count: enrollCount,
      }
    }),
  }
}

/**
 * GÁN/GỠ lớp cho giảng viên: các lớp trong addIds -> teacher_id = giảng viên;
 * các lớp trong removeIds (đang thuộc giảng viên) -> teacher_id = null.
 * Ghi bằng user client -> RLS trên classes chặn ngoài phạm vi lần 2.
 */
export async function assignClassesToTeacher(
  teacherId: string,
  addIds: string[],
  removeIds: string[]
): Promise<{ error?: string }> {
  if (!teacherId) return { error: 'Thiếu ID giảng viên.' }
  const gate = await requireTeacherManager()
  if (gate.error !== undefined) return { error: gate.error }

  const supabase = createClient()

  // Giảng viên phải là teacher trong phạm vi của mình
  const { data: teacher } = await supabase
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', teacherId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!teacher || teacher.role !== 'teacher') {
    return { error: 'Giảng viên không tồn tại hoặc ngoài phạm vi của bạn.' }
  }
  if (gate.scope && (!teacher.org_id || !gate.scope.includes(teacher.org_id))) {
    return { error: 'Giảng viên này không thuộc phạm vi quản lý của bạn.' }
  }

  if (addIds.length > 0) {
    let update = supabase
      .from('classes')
      .update({ teacher_id: teacherId })
      .in('id', addIds)
      .is('deleted_at', null)
    if (gate.scope) update = update.in('org_id', gate.scope)
    const { error } = await update
    if (error) return { error: `Lỗi gán lớp: ${error.message}` }
  }

  if (removeIds.length > 0) {
    let update = supabase
      .from('classes')
      .update({ teacher_id: null })
      .in('id', removeIds)
      .eq('teacher_id', teacherId) // chỉ gỡ lớp ĐANG thuộc giảng viên này
      .is('deleted_at', null)
    if (gate.scope) update = update.in('org_id', gate.scope)
    const { error } = await update
    if (error) return { error: `Lỗi gỡ lớp: ${error.message}` }
  }

  revalidatePath('/teachers')
  return {}
}
