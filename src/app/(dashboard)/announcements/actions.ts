'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// THÔNG BÁO CHUNG (/announcements) - migration 030
// Quản lý cơ sở / giáo vụ soạn thông báo phát tới:
//   - Phụ huynh (Sổ liên lạc), Học viên (cổng HS), Giáo viên
// Trước đây KHÔNG có kênh nào để báo nghỉ lễ, nhắc học phí,
// mời họp phụ huynh... cho toàn cơ sở.
// ============================================================

export type Audience = 'all' | 'parents' | 'students' | 'teachers'

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  audience: Audience
  pinned: boolean
  orgName: string
  authorName: string
  createdAt: string
}

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

export async function getAnnouncements(
  orgId: string
): Promise<{ error: string } | { error?: undefined; announcements: AnnouncementRow[] }> {
  try {
    const auth = await requireManager()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, orgId)

    const { data, error } = await supabase
      .from('announcements')
      .select(
        'id, title, body, audience, pinned, created_at, organizations(name), profiles(full_name)'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

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
      announcements: (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        audience: row.audience as Audience,
        pinned: row.pinned,
        orgName: pick(row.organizations, 'name'),
        authorName: pick(row.profiles, 'full_name'),
        createdAt: row.created_at,
      })),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

export async function createAnnouncement(
  orgId: string,
  title: string,
  body: string,
  audience: Audience,
  pinned: boolean
): Promise<ActionResult> {
  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  if (trimmedTitle.length < 3) return { error: 'Tiêu đề tối thiểu 3 ký tự.' }
  if (trimmedTitle.length > 150) return { error: 'Tiêu đề tối đa 150 ký tự.' }
  if (trimmedBody.length < 5) return { error: 'Nội dung tối thiểu 5 ký tự.' }
  if (trimmedBody.length > 2000) return { error: 'Nội dung tối đa 2000 ký tự.' }
  if (!['all', 'parents', 'students', 'teachers'].includes(audience)) {
    return { error: 'Đối tượng nhận không hợp lệ.' }
  }

  try {
    const auth = await requireManager()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    // RLS with check: chỉ cho phép org trong subtree của người soạn
    const { error } = await supabase.from('announcements').insert({
      org_id: orgId,
      title: trimmedTitle,
      body: trimmedBody,
      audience,
      pinned,
      created_by: auth.userId,
    })
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
