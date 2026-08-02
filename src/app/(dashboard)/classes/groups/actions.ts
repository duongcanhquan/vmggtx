'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

export type ClassGroupRow = {
  id: string
  org_id: string
  org_name: string
  name: string
  homeroom_teacher_id: string | null
  homeroom_name: string
  max_students: number | null
  member_count: number
  section_count: number
  start_date: string | null
  end_date: string | null
}

function migHint(msg: string): string {
  if (/class_groups|class_group_members|group_id|does not exist|schema cache/i.test(msg)) {
    return 'Database chưa có lớp hành chính. Chạy supabase/migrations/064_class_groups_teachers.sql trong SQL Editor.'
  }
  return msg
}

async function requireScope(orgId: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' as const }

  const auth = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
    p_menu_key: 'classes',
  })
  if (auth.error || auth.data !== true) {
    return { error: 'Bạn không có quyền quản lý lớp hành chính.' as const }
  }
  const orgIds = await getDescendantOrgIds(supabase, orgId)
  return {
    supabase,
    userId: user.id,
    orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
  }
}

export async function listClassGroups(
  orgId: string | null
): Promise<{ data: ClassGroupRow[]; error?: string }> {
  if (!orgId) return { data: [], error: 'Chưa chọn tổ chức.' }
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('class_groups')
      .select(
        'id, org_id, name, homeroom_teacher_id, max_students, start_date, end_date, organizations(name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('name')

    if (error) return { data: [], error: migHint(error.message) }

    const groupIds = (data ?? []).map((r) => r.id as string)
    const homeroomIds = (data ?? [])
      .map((r) => r.homeroom_teacher_id as string | null)
      .filter((id): id is string => Boolean(id))

    const [{ data: members }, { data: sections }, { data: teachers }] =
      await Promise.all([
        groupIds.length
          ? scope.supabase
              .from('class_group_members')
              .select('group_id')
              .in('group_id', groupIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as { group_id: string }[] }),
        groupIds.length
          ? scope.supabase
              .from('classes')
              .select('group_id')
              .in('group_id', groupIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as { group_id: string }[] }),
        homeroomIds.length
          ? scope.supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', homeroomIds)
              .is('deleted_at', null)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ])

    const memberCount = new Map<string, number>()
    for (const m of members ?? []) {
      const gid = m.group_id as string
      memberCount.set(gid, (memberCount.get(gid) ?? 0) + 1)
    }
    const sectionCount = new Map<string, number>()
    for (const s of sections ?? []) {
      const gid = s.group_id as string
      if (!gid) continue
      sectionCount.set(gid, (sectionCount.get(gid) ?? 0) + 1)
    }
    const teacherName = new Map(
      (teachers ?? []).map((t) => [t.id as string, t.full_name as string])
    )

    const pick = <T,>(v: T | T[] | null): T | null =>
      Array.isArray(v) ? v[0] ?? null : v

    return {
      data: (data ?? []).map((row) => {
        const org = pick(
          row.organizations as { name?: string } | { name?: string }[] | null
        )
        const hrId = row.homeroom_teacher_id as string | null
        return {
          id: row.id as string,
          org_id: row.org_id as string,
          org_name: org?.name ?? '—',
          name: row.name as string,
          homeroom_teacher_id: hrId,
          homeroom_name: hrId ? teacherName.get(hrId) ?? '—' : '—',
          max_students: row.max_students == null ? null : Number(row.max_students),
          member_count: memberCount.get(row.id as string) ?? 0,
          section_count: sectionCount.get(row.id as string) ?? 0,
          start_date: (row.start_date as string | null) ?? null,
          end_date: (row.end_date as string | null) ?? null,
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lớp hành chính.',
    }
  }
}

export async function createClassGroup(
  orgId: string,
  input: {
    name: string
    homeroomTeacherId?: string | null
    maxStudents?: number | null
    startDate?: string
    endDate?: string
  }
): Promise<{ error?: string; id?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Tên lớp hành chính bắt buộc.' }

  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }

    const { data, error } = await scope.supabase
      .from('class_groups')
      .insert({
        org_id: orgId,
        name,
        homeroom_teacher_id: input.homeroomTeacherId || null,
        max_students: input.maxStudents ?? null,
        start_date: input.startDate || null,
        end_date: input.endDate || null,
      })
      .select('id')
      .maybeSingle()

    if (error) return { error: migHint(error.message) }
    revalidatePath('/classes')
    revalidatePath('/classes/groups')
    return { id: data?.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tạo lớp hành chính.' }
  }
}

export async function softDeleteClassGroup(
  orgId: string,
  groupId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }

    const { error } = await scope.supabase
      .from('class_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', groupId)
      .is('deleted_at', null)

    if (error) return { error: migHint(error.message) }
    revalidatePath('/classes/groups')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa.' }
  }
}

/** Tạo học phần gắn cohort + copy roster (MVP) */
export async function createSectionFromGroup(
  orgId: string,
  input: {
    groupId: string
    name: string
    subjectId: string
    teacherId?: string
  }
): Promise<{ error?: string; classId?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Tên học phần bắt buộc.' }
  if (!input.subjectId) return { error: 'Chọn môn học.' }

  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }

    const { data: group, error: gErr } = await scope.supabase
      .from('class_groups')
      .select('id, org_id')
      .eq('id', input.groupId)
      .is('deleted_at', null)
      .maybeSingle()
    if (gErr) return { error: migHint(gErr.message) }
    if (!group || !scope.orgIds.includes(group.org_id as string)) {
      return { error: 'Lớp hành chính không tồn tại.' }
    }

    const { data: cls, error: cErr } = await scope.supabase
      .from('classes')
      .insert({
        org_id: group.org_id,
        group_id: group.id,
        name,
        subject_id: input.subjectId,
        teacher_id: input.teacherId || null,
      })
      .select('id')
      .maybeSingle()

    if (cErr) return { error: migHint(cErr.message) }
    const classId = cls?.id as string

    if (input.teacherId) {
      await scope.supabase.from('class_teachers').upsert(
        {
          org_id: group.org_id,
          class_id: classId,
          teacher_id: input.teacherId,
          role: 'lead',
        },
        { onConflict: 'class_id,teacher_id' }
      )
    }

    const { data: members } = await scope.supabase
      .from('class_group_members')
      .select('student_id')
      .eq('group_id', group.id)
      .is('deleted_at', null)

    if (members?.length) {
      await scope.supabase.from('enrollments').insert(
        members.map((m) => ({
          org_id: group.org_id,
          class_id: classId,
          student_id: m.student_id,
          status: 'active',
        }))
      )
    }

    revalidatePath('/classes')
    revalidatePath('/classes/groups')
    return { classId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tạo học phần.' }
  }
}

export async function listGroupMembers(
  orgId: string,
  groupId: string
): Promise<{ data: { id: string; student_id: string; full_name: string }[]; error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('class_group_members')
      .select('id, student_id, profiles!class_group_members_student_id_fkey(full_name)')
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('created_at')

    if (error) {
      // fallback without FK hint
      const fb = await scope.supabase
        .from('class_group_members')
        .select('id, student_id')
        .eq('group_id', groupId)
        .is('deleted_at', null)
      if (fb.error) return { data: [], error: migHint(error.message) }
      const ids = (fb.data ?? []).map((r) => r.student_id as string)
      const { data: profiles } = ids.length
        ? await scope.supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', ids)
        : { data: [] }
      const nameMap = new Map(
        (profiles ?? []).map((p) => [p.id as string, p.full_name as string])
      )
      return {
        data: (fb.data ?? []).map((r) => ({
          id: r.id as string,
          student_id: r.student_id as string,
          full_name: nameMap.get(r.student_id as string) ?? '—',
        })),
      }
    }

    return {
      data: (data ?? []).map((r) => {
        const p = r.profiles as { full_name?: string } | { full_name?: string }[] | null
        const name = Array.isArray(p) ? p[0]?.full_name : p?.full_name
        return {
          id: r.id as string,
          student_id: r.student_id as string,
          full_name: name ?? '—',
        }
      }),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải HV.' }
  }
}

export async function listStudentsForGroupPick(
  orgId: string
): Promise<{ data: { id: string; full_name: string }[]; error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { data: [], error: scope.error }
    const { data, error } = await scope.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'student')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('full_name')
      .limit(500)
    if (error) return { data: [], error: error.message }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        full_name: r.full_name as string,
      })),
    }
  } catch {
    return { data: [] }
  }
}

export async function addStudentsToGroup(
  orgId: string,
  groupId: string,
  studentIds: string[]
): Promise<{ error?: string; added?: number }> {
  if (!studentIds.length) return { error: 'Chọn ít nhất một học viên.' }
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }

    const { data: group } = await scope.supabase
      .from('class_groups')
      .select('id, org_id')
      .eq('id', groupId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!group || !scope.orgIds.includes(group.org_id as string)) {
      return { error: 'Lớp hành chính không hợp lệ.' }
    }

    let added = 0
    for (const sid of studentIds) {
      const { data: existing } = await scope.supabase
        .from('class_group_members')
        .select('id, deleted_at')
        .eq('group_id', groupId)
        .eq('student_id', sid)
        .maybeSingle()
      if (existing && !existing.deleted_at) continue
      if (existing?.deleted_at) {
        await scope.supabase
          .from('class_group_members')
          .update({ deleted_at: null })
          .eq('id', existing.id)
        added += 1
      } else {
        const { error } = await scope.supabase.from('class_group_members').insert({
          org_id: group.org_id,
          group_id: groupId,
          student_id: sid,
        })
        if (!error) added += 1
      }
    }
    revalidatePath('/classes/groups')
    return { added }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi thêm HV.' }
  }
}

export async function removeStudentFromGroup(
  orgId: string,
  memberId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }
    const { error } = await scope.supabase
      .from('class_group_members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', memberId)
      .is('deleted_at', null)
    if (error) return { error: migHint(error.message) }
    revalidatePath('/classes/groups')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi gỡ HV.' }
  }
}

export type ClassTeacherRow = {
  id: string
  teacher_id: string
  full_name: string
  role: 'lead' | 'co' | 'grader'
}

export async function listClassTeachers(
  orgId: string,
  classId: string
): Promise<{ data: ClassTeacherRow[]; error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('class_teachers')
      .select('id, teacher_id, role')
      .eq('class_id', classId)
      .is('deleted_at', null)

    if (error) return { data: [], error: migHint(error.message) }
    const ids = (data ?? []).map((r) => r.teacher_id as string)
    const { data: profiles } = ids.length
      ? await scope.supabase.from('profiles').select('id, full_name').in('id', ids)
      : { data: [] }
    const names = new Map(
      (profiles ?? []).map((p) => [p.id as string, p.full_name as string])
    )
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        teacher_id: r.teacher_id as string,
        full_name: names.get(r.teacher_id as string) ?? '—',
        role: r.role as 'lead' | 'co' | 'grader',
      })),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải GV.' }
  }
}

export async function upsertClassTeacher(
  orgId: string,
  classId: string,
  teacherId: string,
  role: 'lead' | 'co' | 'grader'
): Promise<{ error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }

    const { data: cls } = await scope.supabase
      .from('classes')
      .select('id, org_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls || !scope.orgIds.includes(cls.org_id as string)) {
      return { error: 'Học phần không hợp lệ.' }
    }

    if (role === 'lead') {
      await scope.supabase
        .from('class_teachers')
        .update({ role: 'co' })
        .eq('class_id', classId)
        .eq('role', 'lead')
        .is('deleted_at', null)
        .neq('teacher_id', teacherId)

      await scope.supabase
        .from('classes')
        .update({ teacher_id: teacherId })
        .eq('id', classId)
    }

    const { error } = await scope.supabase.from('class_teachers').upsert(
      {
        org_id: cls.org_id,
        class_id: classId,
        teacher_id: teacherId,
        role,
        deleted_at: null,
      },
      { onConflict: 'class_id,teacher_id' }
    )
    if (error) return { error: migHint(error.message) }
    revalidatePath('/classes')
    revalidatePath('/classes/groups')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi gán GV.' }
  }
}

export async function removeClassTeacher(
  orgId: string,
  rowId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { error: scope.error }
    const { error } = await scope.supabase
      .from('class_teachers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', rowId)
      .is('deleted_at', null)
    if (error) return { error: migHint(error.message) }
    revalidatePath('/classes/groups')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi gỡ GV.' }
  }
}

export async function listSectionsInOrg(
  orgId: string
): Promise<{ data: { id: string; name: string }[]; error?: string }> {
  try {
    const scope = await requireScope(orgId)
    if ('error' in scope) return { data: [], error: scope.error }
    const { data, error } = await scope.supabase
      .from('classes')
      .select('id, name')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('name')
    if (error) return { data: [], error: error.message }
    return { data: (data ?? []) as { id: string; name: string }[] }
  } catch {
    return { data: [] }
  }
}
