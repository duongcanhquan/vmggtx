'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// THÔNG BÁO CHUNG (/announcements) - migration 030 + 076 targeting
// Gửi tới PH / HV / GV — phạm vi: toàn bộ | theo lớp | cá nhân.
// ============================================================

export type Audience = 'all' | 'parents' | 'students' | 'teachers'
export type TargetScope = 'all' | 'class' | 'individual'

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  audience: Audience
  targetScope: TargetScope
  targetClassIds: string[]
  targetUserIds: string[]
  pinned: boolean
  orgName: string
  authorName: string
  createdAt: string
}

export type AnnouncementTargetOption = { id: string; label: string; hint?: string }

type ActionResult = { error: string } | { error?: undefined }

const MANAGER_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

async function requireManager(): Promise<
  { error: string } | { error?: undefined; userId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || !MANAGER_ROLES.includes(profile.role)) {
    return { error: 'Chỉ Quản lý cơ sở / Giáo vụ được quản lý thông báo chung.' }
  }
  return { userId: user.id }
}

function parseScope(raw: unknown): TargetScope {
  return raw === 'class' || raw === 'individual' ? raw : 'all'
}

export async function getAnnouncements(
  orgId: string
): Promise<{ error: string } | { error?: undefined; announcements: AnnouncementRow[] }> {
  try {
    const auth = await requireManager()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, orgId)

    let query = supabase
      .from('announcements')
      .select(
        'id, title, body, audience, pinned, created_at, target_scope, target_class_ids, target_user_ids, organizations(name), profiles(full_name)'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    let { data, error } = await query

    if (error && /target_scope|target_class|42703|schema cache/i.test(error.message)) {
      const fallback = await supabase
        .from('announcements')
        .select(
          'id, title, body, audience, pinned, created_at, organizations(name), profiles(full_name)'
        )
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)
      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error) {
      if (/announcements/i.test(error.message)) {
        return {
          error: 'Tính năng chưa sẵn sàng: database chưa chạy migration 030_operations.sql.',
        }
      }
      return { error: error.message }
    }

    const pick = (value: unknown, key: 'name' | 'full_name'): string => {
      const obj = Array.isArray(value) ? value[0] : value
      return ((obj as Record<string, string> | null)?.[key] as string) ?? '—'
    }

    return {
      announcements: (data ?? []).map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: row.id,
          title: row.title,
          body: row.body,
          audience: row.audience as Audience,
          targetScope: parseScope(r.target_scope),
          targetClassIds: Array.isArray(r.target_class_ids)
            ? (r.target_class_ids as string[])
            : [],
          targetUserIds: Array.isArray(r.target_user_ids)
            ? (r.target_user_ids as string[])
            : [],
          pinned: row.pinned,
          orgName: pick(row.organizations, 'name'),
          authorName: pick(row.profiles, 'full_name'),
          createdAt: row.created_at,
        }
      }),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Lớp / người nhận để chọn phạm vi gửi */
export async function getAnnouncementTargetOptions(
  orgId: string,
  audience: Audience
): Promise<{
  error?: string
  classes: AnnouncementTargetOption[]
  people: AnnouncementTargetOption[]
}> {
  try {
    const auth = await requireManager()
    if (auth.error !== undefined) {
      return { error: auth.error, classes: [], people: [] }
    }
    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, orgId)

    const { data: classes } = await supabase
      .from('classes')
      .select('id, name')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('name')
      .limit(300)

    const classOpts = (classes ?? []).map((c) => ({ id: c.id, label: c.name }))

    if (audience === 'teachers') {
      const { data: teachers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'teacher')
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('full_name')
        .limit(300)
      return {
        classes: classOpts,
        people: (teachers ?? []).map((t) => ({
          id: t.id,
          label: t.full_name,
          hint: 'Giáo viên',
        })),
      }
    }

    // PH + HV: chọn theo học viên (PH nhận theo mã HV)
    const { data: students } = await supabase
      .from('profiles')
      .select('id, full_name, "MaSV", student_code')
      .eq('role', 'student')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('full_name')
      .limit(400)

    return {
      classes: classOpts,
      people: (students ?? []).map((s) => {
        const code =
          (s as { MaSV?: string }).MaSV || s.student_code || ''
        return {
          id: s.id,
          label: s.full_name,
          hint: code || (audience === 'parents' ? 'Phụ huynh của HV' : 'Học viên'),
        }
      }),
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Không tải danh sách đối tượng.',
      classes: [],
      people: [],
    }
  }
}

export async function createAnnouncement(input: {
  orgId: string
  title: string
  body: string
  audience: Audience
  pinned: boolean
  targetScope?: TargetScope
  targetClassIds?: string[]
  targetUserIds?: string[]
}): Promise<ActionResult> {
  const trimmedTitle = input.title.trim()
  const trimmedBody = input.body.trim()
  if (trimmedTitle.length < 3) return { error: 'Tiêu đề tối thiểu 3 ký tự.' }
  if (trimmedTitle.length > 150) return { error: 'Tiêu đề tối đa 150 ký tự.' }
  if (trimmedBody.length < 5) return { error: 'Nội dung tối thiểu 5 ký tự.' }
  if (trimmedBody.length > 2000) return { error: 'Nội dung tối đa 2000 ký tự.' }
  if (!['all', 'parents', 'students', 'teachers'].includes(input.audience)) {
    return { error: 'Đối tượng nhận không hợp lệ.' }
  }

  const scope: TargetScope =
    input.audience === 'all' ? 'all' : parseScope(input.targetScope)
  const classIds = [...new Set((input.targetClassIds ?? []).filter(Boolean))]
  const userIds = [...new Set((input.targetUserIds ?? []).filter(Boolean))]

  if (scope === 'class' && classIds.length === 0) {
    return { error: 'Chọn ít nhất một lớp khi gửi theo lớp.' }
  }
  if (scope === 'individual' && userIds.length === 0) {
    return { error: 'Chọn ít nhất một người nhận khi gửi cá nhân.' }
  }

  try {
    const auth = await requireManager()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: authorized, error: authzError } = await isAuthorizedRpc(supabase, {
      p_user_id: auth.userId,
      p_target_org_id: input.orgId,
      p_required_role: 'academic_staff',
      p_menu_key: 'announcements',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Cơ sở này nằm ngoài phạm vi quản lý của bạn.' }
    }

    const payload: Record<string, unknown> = {
      org_id: input.orgId,
      title: trimmedTitle,
      body: trimmedBody,
      audience: input.audience,
      pinned: input.pinned,
      created_by: auth.userId,
      target_scope: scope,
      target_class_ids: scope === 'class' ? classIds : [],
      target_user_ids: scope === 'individual' ? userIds : [],
    }

    let { error } = await supabase.from('announcements').insert(payload)
    if (error && /target_scope|target_class|42703|schema cache/i.test(error.message)) {
      delete payload.target_scope
      delete payload.target_class_ids
      delete payload.target_user_ids
      const retry = await supabase.from('announcements').insert(payload)
      error = retry.error
      if (!error && scope !== 'all') {
        return {
          error:
            'Đã lưu thông báo toàn nhóm, nhưng DB chưa có cột phạm vi (chạy migration 076).',
        }
      }
    }

    if (error) {
      if (/announcements/i.test(error.message) && /does not exist|relation/i.test(error.message)) {
        return {
          error: 'Tính năng chưa sẵn sàng: database chưa chạy migration 030_operations.sql.',
        }
      }
      return { error: `Không đăng được thông báo: ${error.message}` }
    }

    revalidatePath('/announcements')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  if (!id) return { error: 'Thiếu mã thông báo.' }
  try {
    const auth = await requireManager()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error, count } = await supabase
      .from('announcements')
      .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', id)
      .is('deleted_at', null)
    if (error) return { error: `Không gỡ được thông báo: ${error.message}` }
    if (count === 0) return { error: 'Thông báo không tồn tại hoặc ngoài phạm vi của bạn.' }

    revalidatePath('/announcements')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
