'use server'

import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'

export type TranscriptClassRow = {
  id: string
  name: string
  org_id: string
  org_name: string
  teacher_name: string
  student_count: number
  assessment_count: number
  is_locked: boolean
  start_date: string | null
  end_date: string | null
}

async function getOrgSubtreeIds(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: orgId,
  })
  if (error) return [orgId]
  const ids = (data ?? []) as string[]
  return ids.includes(orgId) ? ids : [orgId, ...ids]
}

/**
 * Danh sách lớp trong subtree org đang chọn — cho bảng điểm tổng (dashboard).
 * Kèm tên đơn vị, sĩ số active, số bài KT, trạng thái chốt sổ.
 */
export async function getTranscriptClasses(
  orgId: string | null
): Promise<{ data: TranscriptClassRow[]; error?: string }> {
  if (!orgId) {
    return { data: [], error: 'Chưa chọn tổ chức.' }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Chưa đăng nhập.' }

    const auth = await isAuthorizedRpc(supabase, {
      p_user_id: user.id,
      p_target_org_id: orgId,
      p_required_role: 'academic_staff',
      p_menu_key: 'staff_ops',
    })
    if (auth.error || auth.data !== true) {
      return { data: [], error: 'Bạn không có quyền xem bảng điểm tổng.' }
    }

    const orgIds = await getOrgSubtreeIds(supabase, orgId)

    const { data: classes, error } = await supabase
      .from('classes')
      .select(
        'id, name, org_id, teacher_id, start_date, end_date, profiles(full_name), organizations(name)'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('name')

    if (error) {
      return { data: [], error: error.message }
    }

    const rows = classes ?? []
    const classIds = rows.map((r) => r.id)
    const studentCount = new Map<string, number>()
    const assessmentCount = new Map<string, number>()
    const lockedSet = new Set<string>()

    if (classIds.length > 0) {
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'active')
        .is('deleted_at', null)

      for (const e of enrolls ?? []) {
        studentCount.set(e.class_id, (studentCount.get(e.class_id) ?? 0) + 1)
      }

      const { data: assessments } = await supabase
        .from('assessments')
        .select('class_id')
        .in('class_id', classIds)
        .is('deleted_at', null)

      for (const a of assessments ?? []) {
        assessmentCount.set(a.class_id, (assessmentCount.get(a.class_id) ?? 0) + 1)
      }

      const { data: results } = await supabase
        .from('class_results')
        .select('class_id, is_locked')
        .in('class_id', classIds)

      for (const r of results ?? []) {
        if (r.is_locked) lockedSet.add(r.class_id)
      }
    }

    const data: TranscriptClassRow[] = rows.map((row) => {
      const teacher = row.profiles as
        | { full_name?: string }
        | { full_name?: string }[]
        | null
      const org = row.organizations as
        | { name?: string }
        | { name?: string }[]
        | null
      const teacherName = Array.isArray(teacher)
        ? teacher[0]?.full_name ?? 'Chưa gán'
        : teacher?.full_name ?? 'Chưa gán'
      const orgName = Array.isArray(org)
        ? org[0]?.name ?? '—'
        : org?.name ?? '—'

      return {
        id: row.id,
        name: row.name,
        org_id: row.org_id,
        org_name: orgName,
        teacher_name: teacherName,
        student_count: studentCount.get(row.id) ?? 0,
        assessment_count: assessmentCount.get(row.id) ?? 0,
        is_locked: lockedSet.has(row.id),
        start_date: row.start_date,
        end_date: row.end_date,
      }
    })

    return { data }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải danh sách lớp.',
    }
  }
}
