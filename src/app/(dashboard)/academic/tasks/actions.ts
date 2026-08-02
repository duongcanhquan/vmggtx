'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

export type WorkTaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type WorkTaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export type WorkTaskRow = {
  id: string
  org_id: string
  title: string
  description: string | null
  status: WorkTaskStatus
  priority: WorkTaskPriority
  due_at: string | null
  created_by: string | null
  created_at: string
  assignee_ids: string[]
  assignee_names: string[]
}

export type StaffOption = { id: string; full_name: string; role: string }

function migrationHint(message: string): string {
  if (/work_tasks|work_task_assignees|does not exist|schema cache/i.test(message)) {
    return 'Database chưa có bảng phân công. Chạy supabase/migrations/059_work_tasks.sql trong SQL Editor.'
  }
  return message
}

async function requireStaffScope(orgId: string): Promise<
  | { error: string }
  | {
      error?: undefined
      supabase: ReturnType<typeof createClient>
      userId: string
      orgIds: string[]
    }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const auth = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
    p_menu_key: 'work_tasks',
  })
  if (auth.error || auth.data !== true) {
    return { error: 'Bạn không có quyền quản lý phân công trong đơn vị này.' }
  }

  const orgIds = await getDescendantOrgIds(supabase, orgId)
  return { supabase, userId: user.id, orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds] }
}

export async function listAssignableStaff(
  orgId: string | null
): Promise<{ data: StaffOption[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireStaffScope(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('org_id', scope.orgIds)
      .in('role', [
        'campus_admin',
        'academic_staff',
        'admission_staff',
        'accountant',
        'teacher',
      ])
      .is('deleted_at', null)
      .order('full_name')

    if (error) return { data: [], error: error.message }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        full_name: r.full_name as string,
        role: r.role as string,
      })),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải nhân sự.' }
  }
}

export async function listWorkTasks(
  orgId: string | null,
  filters?: { status?: string }
): Promise<{ data: WorkTaskRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireStaffScope(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    let query = scope.supabase
      .from('work_tasks')
      .select(
        'id, org_id, title, description, status, priority, due_at, created_by, created_at, work_task_assignees(user_id, profiles(full_name))'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters?.status) query = query.eq('status', filters.status)

    const { data, error } = await query
    if (error) return { data: [], error: migrationHint(error.message) }

    return {
      data: (data ?? []).map((row) => mapTaskRow(row)),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải việc.',
    }
  }
}

function mapTaskRow(row: Record<string, unknown>): WorkTaskRow {
  const assignees = row.work_task_assignees as
    | {
        user_id: string
        profiles: { full_name?: string } | { full_name?: string }[] | null
      }[]
    | null
  const ids: string[] = []
  const names: string[] = []
  for (const a of assignees ?? []) {
    ids.push(a.user_id)
    const p = a.profiles
    names.push(
      Array.isArray(p) ? p[0]?.full_name ?? '—' : p?.full_name ?? '—'
    )
  }
  return {
    id: String(row.id),
    org_id: String(row.org_id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    status: row.status as WorkTaskStatus,
    priority: row.priority as WorkTaskPriority,
    due_at: (row.due_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    assignee_ids: ids,
    assignee_names: names,
  }
}

export async function createWorkTask(
  orgId: string,
  input: {
    title: string
    description?: string
    priority?: WorkTaskPriority
    dueAt?: string | null
    assigneeIds: string[]
  }
): Promise<{ error?: string; id?: string }> {
  const title = input.title.trim()
  if (!title) return { error: 'Nhập tiêu đề công việc.' }
  if (title.length > 200) return { error: 'Tiêu đề tối đa 200 ký tự.' }

  try {
    const scope = await requireStaffScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { data: task, error } = await scope.supabase
      .from('work_tasks')
      .insert({
        org_id: orgId,
        title,
        description: input.description?.trim() || null,
        priority: input.priority ?? 'normal',
        due_at: input.dueAt || null,
        created_by: scope.userId,
        status: 'todo',
      })
      .select('id')
      .maybeSingle()

    if (error) return { error: migrationHint(error.message) }
    if (!task?.id) return { error: 'Không tạo được việc.' }

    const uniqueAssignees = [...new Set(input.assigneeIds.filter(Boolean))]
    if (uniqueAssignees.length > 0) {
      const { error: aErr } = await scope.supabase.from('work_task_assignees').insert(
        uniqueAssignees.map((userId) => ({
          org_id: orgId,
          task_id: task.id,
          user_id: userId,
        }))
      )
      if (aErr) {
        return { error: migrationHint(aErr.message), id: task.id as string }
      }
    }

    revalidatePath('/academic/tasks')
    revalidatePath('/teacher/tasks')
    return { id: task.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tạo việc.' }
  }
}

export async function updateWorkTaskStatus(
  orgId: string,
  taskId: string,
  status: WorkTaskStatus
): Promise<{ error?: string }> {
  try {
    const scope = await requireStaffScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await scope.supabase
      .from('work_tasks')
      .update({ status })
      .eq('id', taskId)
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)

    if (error) return { error: migrationHint(error.message) }
    revalidatePath('/academic/tasks')
    revalidatePath('/teacher/tasks')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi cập nhật.' }
  }
}

export async function setWorkTaskAssignees(
  orgId: string,
  taskId: string,
  assigneeIds: string[]
): Promise<{ error?: string }> {
  try {
    const scope = await requireStaffScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { data: task } = await scope.supabase
      .from('work_tasks')
      .select('id, org_id')
      .eq('id', taskId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!task || !scope.orgIds.includes(task.org_id as string)) {
      return { error: 'Không tìm thấy việc.' }
    }

    await scope.supabase.from('work_task_assignees').delete().eq('task_id', taskId)

    const unique = [...new Set(assigneeIds.filter(Boolean))]
    if (unique.length > 0) {
      const { error } = await scope.supabase.from('work_task_assignees').insert(
        unique.map((userId) => ({
          org_id: task.org_id,
          task_id: taskId,
          user_id: userId,
        }))
      )
      if (error) return { error: migrationHint(error.message) }
    }

    revalidatePath('/academic/tasks')
    revalidatePath('/teacher/tasks')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi gán người.' }
  }
}

export async function softDeleteWorkTask(
  orgId: string,
  taskId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireStaffScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await scope.supabase
      .from('work_tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)

    if (error) return { error: migrationHint(error.message) }
    revalidatePath('/academic/tasks')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa việc.' }
  }
}

/** Việc được giao cho CHÍNH user (cổng GV / nhân sự) */
export async function listMyWorkTasks(): Promise<{
  data: WorkTaskRow[]
  error?: string
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Chưa đăng nhập.' }

    const { data: links, error: lErr } = await supabase
      .from('work_task_assignees')
      .select('task_id')
      .eq('user_id', user.id)

    if (lErr) return { data: [], error: migrationHint(lErr.message) }
    const ids = (links ?? []).map((l) => l.task_id as string)
    if (ids.length === 0) return { data: [] }

    const { data, error } = await supabase
      .from('work_tasks')
      .select(
        'id, org_id, title, description, status, priority, due_at, created_by, created_at, work_task_assignees(user_id, profiles(full_name))'
      )
      .in('id', ids)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('due_at', { ascending: true, nullsFirst: false })

    if (error) return { data: [], error: migrationHint(error.message) }
    return { data: (data ?? []).map((row) => mapTaskRow(row)) }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải việc của tôi.',
    }
  }
}

/** Người được giao tự cập nhật trạng thái */
export async function updateMyWorkTaskStatus(
  taskId: string,
  status: WorkTaskStatus
): Promise<{ error?: string }> {
  if (status === 'cancelled') {
    return { error: 'Chỉ quản lý mới được hủy việc.' }
  }
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Chưa đăng nhập.' }

    const { data: link } = await supabase
      .from('work_task_assignees')
      .select('task_id')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!link) return { error: 'Bạn không được giao việc này.' }

    const { error } = await supabase
      .from('work_tasks')
      .update({ status })
      .eq('id', taskId)
      .is('deleted_at', null)

    if (error) return { error: migrationHint(error.message) }
    revalidatePath('/teacher/tasks')
    revalidatePath('/academic/tasks')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi cập nhật.' }
  }
}
