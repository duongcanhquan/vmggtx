'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// LAYOUT DASHBOARD CHÍNH (/) - lưu THEO TỪNG USER (migration 034)
//
// Trước đây trang / lưu thứ tự + ẩn/hiện widget vào
// org_settings.config.dashboard_widgets (chung cả cơ sở). Nay:
//   1) Ưu tiên user_preferences.dashboard_layout của CHÍNH user
//   2) Chưa có -> global_layout_templates theo role (QTV áp đặt);
//      is_forced = true -> user thường bị KHÓA tùy biến
//   3) Vẫn chưa có -> client fallback org_settings cũ rồi default
//
// LƯU Ý NAMESPACE: cột dashboard_layout dùng CHUNG với staff portal
// (grid react-grid-layout). Để 2 dashboard không ghi đè nhau, giá
// trị được lưu dạng object có khóa riêng:
//   { "staff_grid": [{i,x,y,w,h}...], "main_widgets": [{id,visible}...] }
// Dữ liệu cũ dạng MẢNG được hiểu là staff_grid (legacy).
// global_layout_templates.default_layout dùng cùng quy ước.
// ============================================================

const ADMIN_ROLES = ['super_admin', 'campus_admin']

const TEMPLATE_ROLE_TARGETS = [
  'campus_admin',
  'academic_staff',
  'admission_staff',
  'accountant',
  'teacher',
] as const

export type MainTemplateRoleTarget = (typeof TEMPLATE_ROLE_TARGETS)[number]

export type MainWidgetItem = { id: string; visible: boolean }

export type MainDashboardLayoutResult = {
  /** null = user chưa có cấu hình -> client fallback org_settings/default */
  layout: MainWidgetItem[] | null
  source: 'user' | 'template' | 'none'
  /** true = template ép buộc, user thường bị khóa nút Tùy biến */
  isForced: boolean
  /** true = được áp layout này cho toàn bộ nhân sự 1 role */
  canPushTemplate: boolean
}

type ActionResult = { error: string } | { error?: undefined }

/** Lọc dữ liệu widget hợp lệ: [{id, visible}...], tối đa 30 mục */
function sanitizeMainWidgets(raw: unknown): MainWidgetItem[] | null {
  if (!Array.isArray(raw)) return null
  const items: MainWidgetItem[] = []
  for (const item of raw.slice(0, 30)) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 50) continue
    items.push({ id: o.id, visible: o.visible !== false })
  }
  return items.length > 0 ? items : null
}

/** Đọc khóa main_widgets từ giá trị jsonb (mảng legacy = staff_grid -> null) */
function extractMainWidgets(raw: unknown): MainWidgetItem[] | null {
  if (raw === null || raw === undefined) return null
  if (Array.isArray(raw)) return null // legacy: mảng là staff_grid
  if (typeof raw !== 'object') return null
  return sanitizeMainWidgets((raw as Record<string, unknown>).main_widgets)
}

/**
 * Gộp main_widgets vào giá trị jsonb hiện có mà KHÔNG phá dữ liệu
 * của dashboard khác (staff_grid). Mảng legacy được nâng cấp thành
 * object {staff_grid: <mảng cũ>}.
 */
function mergeMainWidgets(existing: unknown, widgets: MainWidgetItem[]): Record<string, unknown> {
  if (Array.isArray(existing)) {
    return { staff_grid: existing, main_widgets: widgets }
  }
  if (typeof existing === 'object' && existing !== null) {
    return { ...(existing as Record<string, unknown>), main_widgets: widgets }
  }
  return { main_widgets: widgets }
}

async function getAuthProfile(): Promise<
  { error: string } | { error?: undefined; userId: string; orgId: string | null; role: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile) return { error: 'Không tìm thấy hồ sơ người dùng.' }
  return { userId: user.id, orgId: profile.org_id, role: profile.role }
}

/** Layout dashboard chính của user: user_preferences -> template theo role */
export async function getMainDashboardLayout(): Promise<
  { error: string } | ({ error?: undefined } & MainDashboardLayoutResult)
> {
  try {
    const auth = await getAuthProfile()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const [prefsResult, templateResult] = await Promise.all([
      supabase
        .from('user_preferences')
        .select('dashboard_layout')
        .eq('user_id', auth.userId)
        .maybeSingle(),
      supabase
        .from('global_layout_templates')
        .select('default_layout, is_forced')
        .eq('role_target', auth.role)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle(),
    ])

    const canPushTemplate = ADMIN_ROLES.includes(auth.role)
    const templateLayout = extractMainWidgets(templateResult.data?.default_layout)
    const isForced =
      templateResult.data?.is_forced === true &&
      templateLayout !== null &&
      !ADMIN_ROLES.includes(auth.role)

    // Template ép buộc -> bỏ qua layout riêng của user
    if (isForced && templateLayout) {
      return { layout: templateLayout, source: 'template', isForced: true, canPushTemplate }
    }

    const userLayout = extractMainWidgets(prefsResult.data?.dashboard_layout)
    if (userLayout) {
      return { layout: userLayout, source: 'user', isForced: false, canPushTemplate }
    }
    if (templateLayout) {
      return { layout: templateLayout, source: 'template', isForced, canPushTemplate }
    }
    return { layout: null, source: 'none', isForced: false, canPushTemplate }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Lưu layout dashboard chính của CHÍNH user (RLS own record) */
export async function saveMainDashboardLayout(widgets: MainWidgetItem[]): Promise<ActionResult> {
  const clean = sanitizeMainWidgets(widgets)
  if (!clean) return { error: 'Bố cục trống — không có gì để lưu.' }

  try {
    const auth = await getAuthProfile()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()

    // Template ép buộc -> user thường không được ghi đè
    if (!ADMIN_ROLES.includes(auth.role)) {
      const { data: template } = await supabase
        .from('global_layout_templates')
        .select('default_layout, is_forced')
        .eq('role_target', auth.role)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (
        template?.is_forced === true &&
        extractMainWidgets(template.default_layout) !== null
      ) {
        return { error: 'Bố cục này do Quản trị viên áp đặt — bạn không thể tự thay đổi.' }
      }
    }

    // Đọc giá trị hiện có để merge namespace (không phá staff_grid)
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('dashboard_layout')
      .eq('user_id', auth.userId)
      .maybeSingle()

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: auth.userId,
        org_id: auth.orgId,
        dashboard_layout: mergeMainWidgets(existing?.dashboard_layout, clean),
      },
      { onConflict: 'user_id' }
    )
    if (error) {
      if (/user_preferences|does not exist/i.test(error.message)) {
        return { error: 'Chưa lưu được: database thiếu migration 034_user_preferences.sql.' }
      }
      return { error: `Không lưu được bố cục: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * QTV: áp bố cục dashboard chính hiện tại làm MẶC ĐỊNH cho 1 role.
 * isForced = true -> nhân sự role đó bị khóa tùy biến (cả 2 dashboard
 * dùng chung cờ is_forced của template theo role).
 */
export async function applyMainLayoutTemplate(
  roleTarget: MainTemplateRoleTarget,
  widgets: MainWidgetItem[],
  isForced: boolean
): Promise<ActionResult> {
  if (!TEMPLATE_ROLE_TARGETS.includes(roleTarget)) {
    return { error: 'Role đích không hợp lệ.' }
  }
  const clean = sanitizeMainWidgets(widgets)
  if (!clean) return { error: 'Bố cục trống — sắp xếp widget trước khi áp dụng.' }

  try {
    const auth = await getAuthProfile()
    if (auth.error !== undefined) return { error: auth.error }
    if (!ADMIN_ROLES.includes(auth.role)) {
      return { error: 'Chỉ Quản trị viên được áp bố cục cho nhân sự.' }
    }
    if (!auth.orgId) return { error: 'Tài khoản chưa gắn cơ sở.' }

    const supabase = createClient()

    // Giữ nguyên khóa staff_grid nếu template đã có
    const { data: existing } = await supabase
      .from('global_layout_templates')
      .select('default_layout')
      .eq('org_id', auth.orgId)
      .eq('role_target', roleTarget)
      .maybeSingle()

    const { error } = await supabase.from('global_layout_templates').upsert(
      {
        org_id: auth.orgId,
        role_target: roleTarget,
        default_layout: mergeMainWidgets(existing?.default_layout, clean),
        is_forced: isForced,
        created_by: auth.userId,
        deleted_at: null,
      },
      { onConflict: 'org_id,role_target' }
    )
    if (error) {
      if (/global_layout_templates|does not exist/i.test(error.message)) {
        return { error: 'Database thiếu migration 034_user_preferences.sql.' }
      }
      return { error: `Không áp được bố cục: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
