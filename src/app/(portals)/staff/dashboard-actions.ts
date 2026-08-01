'use server'

import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// DASHBOARD ĐỘNG (react-grid-layout) - migration 034
// - getDashboardLayout: ưu tiên user_preferences.dashboard_layout;
//   chưa có -> fallback global_layout_templates theo ROLE;
//   template is_forced = true -> user thường bị KHÓA tự sửa.
// - saveDashboardLayout: upsert layout của CHÍNH user (RLS own).
// - applyLayoutTemplate: QTV áp layout cho toàn bộ nhân sự 1 role.
// - getStaffWidgetData: dữ liệu các widget (song song, chịu lỗi êm
//   khi thiếu migration - widget hiện 0 thay vì vỡ trang).
// ============================================================

const ADMIN_ROLES = ['super_admin', 'campus_admin']
const TEMPLATE_ROLE_TARGETS = [
  'campus_admin',
  'academic_staff',
  'admission_staff',
  'accountant',
  'teacher',
] as const

export type TemplateRoleTarget = (typeof TEMPLATE_ROLE_TARGETS)[number]

export type WidgetLayoutItem = { i: string; x: number; y: number; w: number; h: number }

export type DashboardLayoutResult = {
  /** null = chưa có cấu hình nào -> client dùng layout mặc định */
  layout: WidgetLayoutItem[] | null
  source: 'user' | 'template' | 'none'
  /** true = template ép buộc, user thường không được tự sửa */
  isForced: boolean
  /** true = được phép áp layout cho toàn bộ nhân sự cùng role */
  canPushTemplate: boolean
  /** true = database chưa chạy migration 034 */
  migrationMissing: boolean
}

type ActionResult = { error: string } | { error?: undefined }

function sanitizeLayout(raw: unknown): WidgetLayoutItem[] | null {
  if (!Array.isArray(raw)) return null
  const items: WidgetLayoutItem[] = []
  for (const item of raw.slice(0, 30)) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    if (typeof o.i !== 'string' || o.i.length > 50) continue
    const nums = [o.x, o.y, o.w, o.h].map(Number)
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 48)) continue
    items.push({ i: o.i, x: nums[0], y: nums[1], w: Math.max(1, nums[2]), h: Math.max(1, nums[3]) })
  }
  return items.length > 0 ? items : null
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

/** Layout của user: user_preferences -> fallback template theo role */
export async function getDashboardLayout(): Promise<
  { error: string } | ({ error?: undefined } & DashboardLayoutResult)
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
        .maybeSingle(),
    ])

    const migrationMissing =
      prefsResult.error !== null && /user_preferences|does not exist/i.test(prefsResult.error.message)
    const canPushTemplate = ADMIN_ROLES.includes(auth.role)

    const templateLayout = sanitizeLayout(templateResult.data?.default_layout)
    const isForced = templateResult.data?.is_forced === true && !ADMIN_ROLES.includes(auth.role)

    // Template ép buộc -> bỏ qua layout riêng của user
    if (isForced && templateLayout) {
      return {
        layout: templateLayout,
        source: 'template',
        isForced: true,
        canPushTemplate,
        migrationMissing: false,
      }
    }

    const userLayout = sanitizeLayout(prefsResult.data?.dashboard_layout)
    if (userLayout) {
      return {
        layout: userLayout,
        source: 'user',
        isForced: false,
        canPushTemplate,
        migrationMissing: false,
      }
    }
    if (templateLayout) {
      return {
        layout: templateLayout,
        source: 'template',
        isForced,
        canPushTemplate,
        migrationMissing: false,
      }
    }
    return { layout: null, source: 'none', isForced: false, canPushTemplate, migrationMissing }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Lưu layout sau khi kéo thả (upsert theo user_id - RLS chỉ cho bản ghi của mình) */
export async function saveDashboardLayout(layout: WidgetLayoutItem[]): Promise<ActionResult> {
  const clean = sanitizeLayout(layout) ?? []
  try {
    const auth = await getAuthProfile()
    if (auth.error !== undefined) return { error: auth.error }

    // Template ép buộc -> user thường không được ghi đè
    const supabase = createClient()
    if (!ADMIN_ROLES.includes(auth.role)) {
      const { data: template } = await supabase
        .from('global_layout_templates')
        .select('is_forced')
        .eq('role_target', auth.role)
        .is('deleted_at', null)
        .maybeSingle()
      if (template?.is_forced === true) {
        return { error: 'Layout này do Quản trị viên áp đặt — bạn không thể tự thay đổi.' }
      }
    }

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: auth.userId,
        org_id: auth.orgId,
        dashboard_layout: clean,
      },
      { onConflict: 'user_id' }
    )
    if (error) {
      if (/user_preferences|does not exist/i.test(error.message)) {
        return { error: 'Chưa lưu được: database thiếu migration 034_user_preferences.sql.' }
      }
      return { error: `Không lưu được layout: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * QTV: "Áp dụng layout này cho toàn bộ nhân sự cùng cấp" - upsert
 * global_layout_templates cho role đích. isForced = khóa user tự sửa.
 */
export async function applyLayoutTemplate(
  roleTarget: TemplateRoleTarget,
  layout: WidgetLayoutItem[],
  isForced: boolean
): Promise<ActionResult> {
  if (!TEMPLATE_ROLE_TARGETS.includes(roleTarget)) {
    return { error: 'Role đích không hợp lệ.' }
  }
  const clean = sanitizeLayout(layout)
  if (!clean) return { error: 'Layout trống — sắp xếp widget trước khi áp dụng.' }

  try {
    const auth = await getAuthProfile()
    if (auth.error !== undefined) return { error: auth.error }
    if (!ADMIN_ROLES.includes(auth.role)) {
      return { error: 'Chỉ Quản trị viên được áp layout cho nhân sự.' }
    }
    if (!auth.orgId) return { error: 'Tài khoản chưa gắn cơ sở.' }

    const supabase = createClient()
    const { error } = await supabase.from('global_layout_templates').upsert(
      {
        org_id: auth.orgId,
        role_target: roleTarget,
        default_layout: clean,
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
      return { error: `Không áp được template: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

// ============================================================
// DỮ LIỆU WIDGET cho Staff Dashboard - 1 action gom song song
// ============================================================

export type StaffWidgetData = {
  attendance: { total: number; completed: number; cancelled: number }
  tickets: { pending: number; recent: { id: string; categoryName: string; requesterName: string }[] }
  finance: { months: { label: string; amount: number }[] }
  teacherRequests: { pending: number }
  facilities: { activeFacilities: number; todayBookings: number }
}

export async function getStaffWidgetData(): Promise<
  { error: string } | { error?: undefined; data: StaffWidgetData }
> {
  try {
    const auth = await getAuthProfile()
    if (auth.error !== undefined) return { error: auth.error }
    if (!auth.orgId) return { error: 'Tài khoản chưa gắn cơ sở.' }

    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, auth.orgId)

    // Ranh giới hôm nay theo giờ VN
    const vnOffsetMs = 7 * 3600_000
    const nowVn = new Date(Date.now() + vnOffsetMs)
    const dayStart = new Date(
      Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()) - vnOffsetMs
    )
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000)

    // 6 tháng gần nhất cho biểu đồ tài chính
    const sixMonthsAgo = new Date(nowVn.getUTCFullYear(), nowVn.getUTCMonth() - 5, 1)

    const [sessionsResult, ticketsResult, paymentsResult, requestsResult, facilitiesResult, bookingsResult] =
      await Promise.all([
        supabase
          .from('class_sessions')
          .select('id, status')
          .in('org_id', orgIds)
          .gte('start_time', dayStart.toISOString())
          .lt('start_time', dayEnd.toISOString())
          .is('deleted_at', null),
        supabase
          .from('tickets')
          .select('id, ticket_categories(name), profiles!tickets_requester_id_fkey(full_name)')
          .eq('status', 'pending')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('payments')
          .select('amount_paid, created_at')
          .in('org_id', orgIds)
          .gte('created_at', sixMonthsAgo.toISOString())
          .is('deleted_at', null),
        supabase
          .from('teacher_requests')
          .select('id', { count: 'exact', head: true })
          .in('org_id', orgIds)
          .eq('status', 'pending')
          .is('deleted_at', null),
        supabase
          .from('facilities')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .is('deleted_at', null),
        supabase
          .from('facility_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'confirmed')
          .is('deleted_at', null)
          .gte('start_time', dayStart.toISOString())
          .lt('start_time', dayEnd.toISOString()),
      ])

    const sessions = sessionsResult.data ?? []
    const pick = (value: unknown) => (Array.isArray(value) ? value[0] : value)

    // Doanh thu theo tháng (6 tháng)
    const monthKeys: string[] = []
    for (let index = 5; index >= 0; index -= 1) {
      const d = new Date(nowVn.getUTCFullYear(), nowVn.getUTCMonth() - index, 1)
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const amountByMonth = new Map<string, number>(monthKeys.map((key) => [key, 0]))
    for (const payment of paymentsResult.data ?? []) {
      const key = String(payment.created_at).slice(0, 7)
      if (amountByMonth.has(key)) {
        amountByMonth.set(key, (amountByMonth.get(key) ?? 0) + Number(payment.amount_paid))
      }
    }

    return {
      data: {
        attendance: {
          total: sessions.length,
          completed: sessions.filter((s) => s.status === 'completed').length,
          cancelled: sessions.filter((s) => s.status === 'cancelled').length,
        },
        tickets: {
          pending: (ticketsResult.data ?? []).length,
          recent: (ticketsResult.data ?? []).slice(0, 4).map((row) => ({
            id: row.id,
            categoryName:
              (pick(row.ticket_categories) as { name?: string } | null)?.name ?? 'Đơn khác',
            requesterName:
              (pick(row.profiles) as { full_name?: string } | null)?.full_name ?? 'Người dùng',
          })),
        },
        finance: {
          months: monthKeys.map((key) => ({
            label: `T${Number(key.slice(5))}`,
            amount: amountByMonth.get(key) ?? 0,
          })),
        },
        teacherRequests: { pending: requestsResult.count ?? 0 },
        facilities: {
          activeFacilities: facilitiesResult.count ?? 0,
          todayBookings: bookingsResult.count ?? 0,
        },
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
