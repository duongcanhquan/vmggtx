'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { emailSchema, phoneVNSchema, zodFail } from '@/lib/validation/schemas'
import { z } from 'zod'

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
  teaching_major: string | null
  subjects: { id: string; name: string }[]
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
    .select('id, full_name, email, phone, org_id, teaching_major, organizations(name)')
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

  let subjectLinkQuery = supabase
    .from('teacher_subjects')
    .select('teacher_id, subject_id, subjects(name)')
    .is('deleted_at', null)
  if (gate.scope) subjectLinkQuery = subjectLinkQuery.in('org_id', gate.scope)

  const [
    { data: teachers, error: tError },
    { data: classes, error: cError },
    { data: subjectLinks, error: sError },
  ] = await Promise.all([teacherQuery, classQuery, subjectLinkQuery])

  if (tError) {
    // Fallback nếu 063 chưa chạy (thiếu teaching_major)
    if (/teaching_major|schema cache|PGRST204/i.test(tError.message)) {
      let fallbackQ = supabase
        .from('profiles')
        .select('id, full_name, email, phone, org_id, organizations(name)')
        .eq('role', 'teacher')
        .is('deleted_at', null)
        .order('full_name')
      if (gate.scope) fallbackQ = fallbackQ.in('org_id', gate.scope)
      const [{ data: teachersFb, error: fbErr }, { data: classesFb }] =
        await Promise.all([fallbackQ, classQuery])
      if (fbErr) return { error: `Lỗi tải giảng viên: ${fbErr.message}` }
      const classesByTeacherFb = new Map<string, { id: string; name: string }[]>()
      for (const cls of classesFb ?? []) {
        if (!cls.teacher_id) continue
        const list = classesByTeacherFb.get(cls.teacher_id) ?? []
        list.push({ id: cls.id, name: cls.name })
        classesByTeacherFb.set(cls.teacher_id, list)
      }
      return {
        teachers: (teachersFb ?? []).map((row) => {
          const org = row.organizations as
            | { name: string }
            | { name: string }[]
            | null
          return {
            id: row.id,
            full_name: row.full_name,
            email: row.email,
            phone: (row.phone as string | null) ?? null,
            org_id: row.org_id,
            org_name: Array.isArray(org)
              ? org[0]?.name ?? '—'
              : org?.name ?? '—',
            teaching_major: null,
            subjects: [],
            classes: classesByTeacherFb.get(row.id) ?? [],
          }
        }),
        error: undefined,
      }
    }
    return { error: `Lỗi tải giảng viên: ${tError.message}` }
  }
  if (cError) return { error: `Lỗi tải lớp học: ${cError.message}` }

  const classesByTeacher = new Map<string, { id: string; name: string }[]>()
  for (const cls of classes ?? []) {
    if (!cls.teacher_id) continue
    const list = classesByTeacher.get(cls.teacher_id) ?? []
    list.push({ id: cls.id, name: cls.name })
    classesByTeacher.set(cls.teacher_id, list)
  }

  const subjectsByTeacher = new Map<string, { id: string; name: string }[]>()
  if (!sError) {
    for (const link of subjectLinks ?? []) {
      const sub = link.subjects as { name?: string } | { name?: string }[] | null
      const name = Array.isArray(sub) ? sub[0]?.name : sub?.name
      if (!name) continue
      const list = subjectsByTeacher.get(link.teacher_id as string) ?? []
      list.push({ id: link.subject_id as string, name })
      subjectsByTeacher.set(link.teacher_id as string, list)
    }
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
        teaching_major: (row.teaching_major as string | null) ?? null,
        subjects: subjectsByTeacher.get(row.id) ?? [],
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
 * SỬA hồ sơ giảng viên: họ tên / SĐT / email liên hệ.
 * Gác cổng bằng requireTeacherManager + kiểm tra subtree, sau đó ghi bằng
 * admin client (RLS cũ chỉ cho campus_admin update -> giáo vụ sẽ bị chặn
 * im lặng nếu ghi bằng user client).
 */
export async function updateTeacherProfile(
  teacherId: string,
  input: {
    fullName: string
    phone: string
    email: string
    teachingMajor?: string
    subjectIds?: string[]
  }
): Promise<{ error?: string }> {
  if (!teacherId) return { error: 'Thiếu ID giảng viên.' }
  const fullName = input.fullName.trim()
  if (fullName.length < 2) return { error: 'Họ tên phải có ít nhất 2 ký tự.' }

  // [QA-FIX E] Validate SĐT / email (trước đây chỉ trim)
  const phoneParsed = z
    .union([z.literal(''), phoneVNSchema])
    .safeParse(input.phone.trim())
  if (!phoneParsed.success) return zodFail(phoneParsed.error)
  const emailRaw = input.email.trim()
  if (emailRaw) {
    const emailParsed = emailSchema.safeParse(emailRaw)
    if (!emailParsed.success) return zodFail(emailParsed.error)
  }

  const gate = await requireTeacherManager()
  if (gate.error !== undefined) return { error: gate.error }

  const supabase = createClient()
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

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      phone: phoneParsed.data || null,
      email: emailRaw || null,
      teaching_major: input.teachingMajor?.trim() || null,
    })
    .eq('id', teacherId)
  if (error) {
    if (/teaching_major|schema cache|PGRST204/i.test(error.message)) {
      const retry = await admin
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phoneParsed.data || null,
          email: emailRaw || null,
        })
        .eq('id', teacherId)
      if (retry.error) return { error: `Lỗi cập nhật hồ sơ: ${retry.error.message}` }
      return {
        error:
          'Đã lưu tên/SĐT/email. Chạy migration 063_teacher_subjects.sql để lưu ngành & môn dạy.',
      }
    }
    return { error: `Lỗi cập nhật hồ sơ: ${error.message}` }
  }

  if (input.subjectIds && teacher.org_id) {
    const desired = Array.from(new Set(input.subjectIds.filter(Boolean)))
    const { data: existing } = await admin
      .from('teacher_subjects')
      .select('id, subject_id, deleted_at')
      .eq('teacher_id', teacherId)

    const existingMap = new Map(
      (existing ?? []).map((r) => [r.subject_id as string, r])
    )

    for (const sid of desired) {
      const row = existingMap.get(sid)
      if (!row) {
        const { error: insErr } = await admin.from('teacher_subjects').insert({
          org_id: teacher.org_id,
          teacher_id: teacherId,
          subject_id: sid,
        })
        if (insErr && !/teacher_subjects|does not exist/i.test(insErr.message)) {
          return { error: `Lỗi gắn môn: ${insErr.message}` }
        }
      } else if (row.deleted_at) {
        await admin
          .from('teacher_subjects')
          .update({ deleted_at: null })
          .eq('id', row.id)
      }
    }

    for (const [sid, row] of existingMap) {
      if (!desired.includes(sid) && !row.deleted_at) {
        await admin
          .from('teacher_subjects')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    }
  }

  revalidatePath('/teachers')
  return {}
}

/** Môn active để gán hồ sơ GV */
export async function listSubjectsForTeacherForm(): Promise<{
  data: { id: string; name: string }[]
  error?: string
}> {
  const gate = await requireTeacherManager()
  if (gate.error !== undefined) return { data: [], error: gate.error }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name')
  if (error) return { data: [], error: error.message }
  return { data: data ?? [] }
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

    // Đồng bộ class_teachers lead (064) — bỏ qua nếu chưa migration
    const { data: classRows } = await supabase
      .from('classes')
      .select('id, org_id')
      .in('id', addIds)
      .is('deleted_at', null)
    for (const cls of classRows ?? []) {
      await supabase.from('class_teachers').upsert(
        {
          org_id: cls.org_id,
          class_id: cls.id,
          teacher_id: teacherId,
          role: 'lead',
          deleted_at: null,
        },
        { onConflict: 'class_id,teacher_id' }
      )
    }
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

    await supabase
      .from('class_teachers')
      .update({ deleted_at: new Date().toISOString() })
      .in('class_id', removeIds)
      .eq('teacher_id', teacherId)
      .is('deleted_at', null)
  }

  revalidatePath('/teachers')
  return {}
}
