'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  isMenuKey,
  type MenuKey,
} from '@/lib/auth/menuRegistry'

// ============================================================
// Chức danh + mẫu quyền menu (056)
// - CRUD theo org trong subtree campus_admin
// - Gán profiles.job_title_id (từ trang users)
// ============================================================

const BLOCKED_KEYS: MenuKey[] = ['settings_global']

export type JobTitleRow = {
  id: string
  org_id: string
  org_name: string
  name: string
  description: string | null
  suggested_role: string | null
  menu_keys: MenuKey[]
  staff_count: number
  updated_at: string
}

export type ManagedOrgOption = {
  id: string
  name: string
  type: string
}

export type JobTitleActionResult = { error: string } | { error?: undefined; id?: string }

async function requireCampusAdmin(): Promise<
  | { error: string }
  | {
      error?: undefined
      userId: string
      role: string
      orgId: string | null
      supabase: ReturnType<typeof createClient>
    }
> {
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

  if (!me || (me.role !== 'campus_admin' && me.role !== 'super_admin')) {
    return { error: 'Chỉ Quản lý cơ sở mới được quản lý chức danh.' }
  }

  return {
    userId: user.id,
    role: me.role,
    orgId: me.org_id,
    supabase,
  }
}

function cleanMenuKeys(keys: unknown[]): MenuKey[] {
  return keys
    .filter(isMenuKey)
    .filter((k) => !BLOCKED_KEYS.includes(k))
}

function migrationHint(message: string): string {
  if (/job_titles|job_title_id|does not exist|schema cache/i.test(message)) {
    return 'Database chưa có bảng chức danh. Vào Supabase SQL Editor chạy file supabase/migrations/056_job_titles.sql rồi thử lại.'
  }
  return message
}

/** Org trong phạm vi quản lý (để gắn chức danh) */
export async function listJobTitleOrgs(): Promise<{
  data: ManagedOrgOption[]
  error?: string
}> {
  const gate = await requireCampusAdmin()
  if (gate.error !== undefined) return { data: [], error: gate.error }

  const { data, error } = await gate.supabase
    .from('organizations')
    .select('id, name, type')
    .is('deleted_at', null)
    .order('name')

  if (error) return { data: [], error: migrationHint(error.message) }
  return { data: (data ?? []) as ManagedOrgOption[] }
}

/** Danh sách chức danh trong subtree */
export async function listJobTitles(orgId?: string): Promise<{
  data: JobTitleRow[]
  error?: string
}> {
  const gate = await requireCampusAdmin()
  if (gate.error !== undefined) return { data: [], error: gate.error }

  let query = gate.supabase
    .from('job_titles')
    .select('id, org_id, name, description, suggested_role, menu_keys, updated_at, organizations(name)')
    .is('deleted_at', null)
    .order('name')

  if (orgId) query = query.eq('org_id', orgId)

  const { data, error } = await query
  if (error) return { data: [], error: migrationHint(error.message) }

  const rows = data ?? []
  const ids = rows.map((r) => r.id as string)

  // Đếm nhân sự đang gắn từng chức danh
  const countMap = new Map<string, number>()
  if (ids.length > 0) {
    const { data: profiles } = await gate.supabase
      .from('profiles')
      .select('job_title_id')
      .in('job_title_id', ids)
      .is('deleted_at', null)
    for (const p of profiles ?? []) {
      const tid = p.job_title_id as string | null
      if (!tid) continue
      countMap.set(tid, (countMap.get(tid) ?? 0) + 1)
    }
  }

  const result: JobTitleRow[] = rows.map((row) => {
    const org = row.organizations as { name: string } | { name: string }[] | null
    return {
      id: row.id as string,
      org_id: row.org_id as string,
      org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      suggested_role: (row.suggested_role as string | null) ?? null,
      menu_keys: Array.isArray(row.menu_keys)
        ? (row.menu_keys as unknown[]).filter(isMenuKey)
        : [],
      staff_count: countMap.get(row.id as string) ?? 0,
      updated_at: row.updated_at as string,
    }
  })

  return { data: result }
}

export async function createJobTitle(input: {
  orgId: string
  name: string
  description?: string
  suggestedRole?: string | null
  menuKeys: string[]
}): Promise<JobTitleActionResult> {
  const gate = await requireCampusAdmin()
  if (gate.error !== undefined) return { error: gate.error }

  const name = input.name.trim()
  if (!name) return { error: 'Vui lòng nhập tên chức danh.' }
  if (name.length > 80) return { error: 'Tên chức danh tối đa 80 ký tự.' }

  const { data: authorized } = await gate.supabase.rpc('is_authorized', {
    p_user_id: gate.userId,
    p_target_org_id: input.orgId,
    p_required_role: 'campus_admin',
  })
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Chi nhánh này không thuộc quyền quản lý của bạn.' }
  }

  const menuKeys = cleanMenuKeys(input.menuKeys)
  const suggested =
    input.suggestedRole &&
    ['campus_admin', 'academic_staff', 'admission_staff', 'accountant', 'teacher'].includes(
      input.suggestedRole
    )
      ? input.suggestedRole
      : null

  const { data, error } = await gate.supabase
    .from('job_titles')
    .insert({
      org_id: input.orgId,
      name,
      description: input.description?.trim() || null,
      suggested_role: suggested,
      menu_keys: menuKeys,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (/uq_job_titles|duplicate/i.test(error.message)) {
      return { error: 'Đã có chức danh cùng tên trong chi nhánh này.' }
    }
    return { error: migrationHint(error.message) }
  }

  revalidatePath('/campus-admin/job-titles')
  revalidatePath('/campus-admin/users')
  return { id: data?.id }
}

export async function updateJobTitle(input: {
  id: string
  name: string
  description?: string
  suggestedRole?: string | null
  menuKeys: string[]
}): Promise<JobTitleActionResult> {
  const gate = await requireCampusAdmin()
  if (gate.error !== undefined) return { error: gate.error }

  const name = input.name.trim()
  if (!name) return { error: 'Vui lòng nhập tên chức danh.' }

  const { data: existing } = await gate.supabase
    .from('job_titles')
    .select('id, org_id')
    .eq('id', input.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!existing) return { error: 'Không tìm thấy chức danh.' }

  const { data: authorized } = await gate.supabase.rpc('is_authorized', {
    p_user_id: gate.userId,
    p_target_org_id: existing.org_id,
    p_required_role: 'campus_admin',
  })
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Chức danh ngoài phạm vi quản lý của bạn.' }
  }

  const menuKeys = cleanMenuKeys(input.menuKeys)
  const suggested =
    input.suggestedRole &&
    ['campus_admin', 'academic_staff', 'admission_staff', 'accountant', 'teacher'].includes(
      input.suggestedRole
    )
      ? input.suggestedRole
      : null

  const { error } = await gate.supabase
    .from('job_titles')
    .update({
      name,
      description: input.description?.trim() || null,
      suggested_role: suggested,
      menu_keys: menuKeys,
    })
    .eq('id', input.id)
    .is('deleted_at', null)

  if (error) {
    if (/uq_job_titles|duplicate/i.test(error.message)) {
      return { error: 'Đã có chức danh cùng tên trong chi nhánh này.' }
    }
    return { error: migrationHint(error.message) }
  }

  revalidatePath('/campus-admin/job-titles')
  revalidatePath('/campus-admin/users')
  return {}
}

/** Soft-delete; gỡ job_title_id khỏi profiles đang gắn */
export async function deleteJobTitle(id: string): Promise<JobTitleActionResult> {
  const gate = await requireCampusAdmin()
  if (gate.error !== undefined) return { error: gate.error }

  const { data: existing } = await gate.supabase
    .from('job_titles')
    .select('id, org_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!existing) return { error: 'Không tìm thấy chức danh.' }

  const { data: authorized } = await gate.supabase.rpc('is_authorized', {
    p_user_id: gate.userId,
    p_target_org_id: existing.org_id,
    p_required_role: 'campus_admin',
  })
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Chức danh ngoài phạm vi quản lý của bạn.' }
  }

  const now = new Date().toISOString()
  const admin = createAdminClient()

  // Gỡ gắn trước (admin — tránh RLS profiles chặn)
  await admin
    .from('profiles')
    .update({ job_title_id: null })
    .eq('job_title_id', id)
    .is('deleted_at', null)

  const { error } = await gate.supabase
    .from('job_titles')
    .update({ deleted_at: now })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { error: migrationHint(error.message) }

  revalidatePath('/campus-admin/job-titles')
  revalidatePath('/campus-admin/users')
  return {}
}

/** Options gán nhân sự: chức danh tại org user + tổ tiên (mẫu cấp cơ sở áp nhánh) */
export async function listJobTitlesForOrg(orgId: string): Promise<{
  data: { id: string; name: string; suggested_role: string | null; menu_keys: MenuKey[] }[]
  error?: string
}> {
  const gate = await requireCampusAdmin()
  if (gate.error !== undefined) return { data: [], error: gate.error }
  if (!orgId) return { data: [] }

  const { data: authorized } = await gate.supabase.rpc('is_authorized', {
    p_user_id: gate.userId,
    p_target_org_id: orgId,
    p_required_role: 'campus_admin',
  })
  if (authorized !== true) return { data: [], error: 'Ngoài phạm vi quản lý.' }

  const orgIds: string[] = [orgId]
  let cursor = orgId
  for (let step = 0; step < 8; step++) {
    const { data: node } = await gate.supabase
      .from('organizations')
      .select('parent_id')
      .eq('id', cursor)
      .is('deleted_at', null)
      .maybeSingle()
    if (!node?.parent_id) break
    orgIds.push(node.parent_id as string)
    cursor = node.parent_id as string
  }

  const { data, error } = await gate.supabase
    .from('job_titles')
    .select('id, name, suggested_role, menu_keys, org_id')
    .in('org_id', orgIds)
    .is('deleted_at', null)
    .order('name')

  if (error) return { data: [], error: migrationHint(error.message) }

  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      suggested_role: (r.suggested_role as string | null) ?? null,
      menu_keys: Array.isArray(r.menu_keys)
        ? (r.menu_keys as unknown[]).filter(isMenuKey)
        : [],
    })),
  }
}
