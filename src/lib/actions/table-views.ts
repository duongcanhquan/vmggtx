'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Custom Views cho SmartTable (kiểu Notion/Jira) - migration 034.
// Trạng thái bảng (ẩn/hiện cột, thứ tự cột, sort) lưu vào
// user_preferences.table_views (jsonb) theo key từng trang,
// VD: { "students_page_view": { columnOrder: [...], ... } }.
// RLS: user chỉ đọc/ghi bản ghi của chính mình.
// ============================================================

export type SavedTableView = {
  columnVisibility?: Record<string, boolean>
  columnOrder?: string[]
  sorting?: { id: string; desc: boolean }[]
}

const VIEW_KEY_RE = /^[a-z0-9_-]{1,64}$/i

/** Chỉ giữ đúng cấu trúc mong đợi, chặn payload lạ/quá cỡ */
function sanitizeView(raw: unknown): SavedTableView | null {
  if (typeof raw !== 'object' || raw === null) return null
  const input = raw as Record<string, unknown>
  const view: SavedTableView = {}

  if (typeof input.columnVisibility === 'object' && input.columnVisibility !== null) {
    const visibility: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(input.columnVisibility).slice(0, 100)) {
      if (key.length <= 100 && typeof value === 'boolean') visibility[key] = value
    }
    view.columnVisibility = visibility
  }

  if (Array.isArray(input.columnOrder)) {
    view.columnOrder = input.columnOrder
      .slice(0, 100)
      .filter((id): id is string => typeof id === 'string' && id.length <= 100)
  }

  if (Array.isArray(input.sorting)) {
    view.sorting = input.sorting
      .slice(0, 10)
      .filter(
        (s): s is { id: string; desc: boolean } =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as Record<string, unknown>).id === 'string' &&
          typeof (s as Record<string, unknown>).desc === 'boolean'
      )
      .map((s) => ({ id: s.id, desc: s.desc }))
  }

  return view
}

/** Đọc view đã lưu của trang (null = user chưa lưu view nào) */
export async function getTableView(
  viewKey: string
): Promise<{ error: string } | { error?: undefined; view: SavedTableView | null }> {
  if (!VIEW_KEY_RE.test(viewKey)) return { error: 'View key không hợp lệ.' }
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('table_views')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      // Chưa chạy migration 034 -> coi như chưa có view, không vỡ trang
      return { view: null }
    }

    const views = (data?.table_views ?? {}) as Record<string, unknown>
    return { view: sanitizeView(views[viewKey]) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Lưu/ghi đè view của trang (merge vào jsonb, giữ view các trang khác) */
export async function saveTableView(
  viewKey: string,
  view: SavedTableView
): Promise<{ error: string } | { error?: undefined }> {
  if (!VIEW_KEY_RE.test(viewKey)) return { error: 'View key không hợp lệ.' }
  const clean = sanitizeView(view)
  if (!clean) return { error: 'Dữ liệu view không hợp lệ.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const [{ data: existing, error: readError }, { data: profile }] = await Promise.all([
      supabase.from('user_preferences').select('table_views').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('org_id').eq('id', user.id).maybeSingle(),
    ])
    if (readError && /user_preferences|does not exist/i.test(readError.message)) {
      return { error: 'Chưa lưu được: database thiếu migration 034_user_preferences.sql.' }
    }

    const currentViews =
      typeof existing?.table_views === 'object' && existing?.table_views !== null
        ? (existing.table_views as Record<string, unknown>)
        : {}

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: user.id,
        org_id: profile?.org_id ?? null,
        table_views: { ...currentViews, [viewKey]: clean },
      },
      { onConflict: 'user_id' }
    )
    if (error) return { error: `Không lưu được góc nhìn: ${error.message}` }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Xóa view đã lưu -> bảng quay về mặc định */
export async function deleteTableView(
  viewKey: string
): Promise<{ error: string } | { error?: undefined }> {
  if (!VIEW_KEY_RE.test(viewKey)) return { error: 'View key không hợp lệ.' }
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: existing } = await supabase
      .from('user_preferences')
      .select('table_views')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existing?.table_views) return {}

    const views = { ...(existing.table_views as Record<string, unknown>) }
    delete views[viewKey]

    const { error } = await supabase
      .from('user_preferences')
      .update({ table_views: views })
      .eq('user_id', user.id)
    if (error) return { error: `Không xóa được góc nhìn: ${error.message}` }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
