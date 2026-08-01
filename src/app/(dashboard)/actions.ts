'use server'

import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { getOrgSettings } from './settings/actions'
import {
  getMainDashboardLayout,
  type MainDashboardLayoutResult,
} from './layout-actions'
import { DEFAULT_ORG_CONFIG, type OrgConfig } from '@/lib/validation/schemas'

/** Học phí trung bình MOCK (chưa có bảng enrollments/invoices) */
const MOCK_TUITION_PER_STUDENT = 1_500_000

export type ChildOrgStat = {
  orgId: string
  name: string
  students: number
}

// ===== Báo cáo vận hành (RPC get_overview_report - migration 042) =====

export type AttendanceWeekPoint = {
  day: string
  present: number
  absent: number
  excused: number
}

export type AbsentStudentRow = {
  name: string
  className: string
  status: string
  note: string | null
}

export type OverviewReport = {
  sessionsToday: { scheduled: number; completed: number; cancelled: number }
  attendanceToday: { present: number; absent: number; late: number; excused: number }
  attendanceWeek: AttendanceWeekPoint[]
  enrollmentStatus: Record<string, number>
  absentToday: AbsentStudentRow[]
}

export type DashboardStats = {
  activeClasses: number
  totalStudents: number
  /** Doanh thu dự kiến tháng = totalStudents x học phí mock (chưa có bảng invoices) */
  projectedRevenue: number
  /** So sánh học viên giữa các nhánh TRỰC THUỘC (mỗi nhánh đã cộng dồn subtree của nó) */
  childrenStats: ChildOrgStat[]
  /** Báo cáo vận hành (null nếu migration 042 chưa chạy) */
  report: OverviewReport | null
}

function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Parse jsonb trả về từ RPC get_overview_report một cách phòng thủ */
function parseOverviewReport(raw: unknown): OverviewReport | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const sessions = (data.sessions_today ?? {}) as Record<string, unknown>
  const att = (data.attendance_today ?? {}) as Record<string, unknown>

  const week: AttendanceWeekPoint[] = Array.isArray(data.attendance_week)
    ? (data.attendance_week as Record<string, unknown>[]).map((row) => ({
        day: String(row.day ?? ''),
        present: toInt(row.present),
        absent: toInt(row.absent),
        excused: toInt(row.excused),
      }))
    : []

  const enrollment: Record<string, number> = {}
  if (data.enrollment_status && typeof data.enrollment_status === 'object') {
    for (const [key, value] of Object.entries(
      data.enrollment_status as Record<string, unknown>
    )) {
      enrollment[key] = toInt(value)
    }
  }

  const absent: AbsentStudentRow[] = Array.isArray(data.absent_today)
    ? (data.absent_today as Record<string, unknown>[]).map((row) => ({
        name: String(row.name ?? ''),
        className: String(row.class ?? ''),
        status: String(row.status ?? 'absent'),
        note: row.note == null ? null : String(row.note),
      }))
    : []

  return {
    sessionsToday: {
      scheduled: toInt(sessions.scheduled),
      completed: toInt(sessions.completed),
      cancelled: toInt(sessions.cancelled),
    },
    attendanceToday: {
      present: toInt(att.present),
      absent: toInt(att.absent),
      late: toInt(att.late),
      excused: toInt(att.excused),
    },
    attendanceWeek: week,
    enrollmentStatus: enrollment,
    absentToday: absent,
  }
}

type OrgRow = { id: string; name: string; parent_id: string | null }

/**
 * Thống kê ROLL-UP cho dashboard: đếm CỘNG DỒN toàn bộ org con/cháu
 * của orgId (dùng RPC get_descendant_org_ids), không chỉ riêng orgId.
 */
export async function getDashboardStats(
  orgId: string | null
): Promise<{ data: DashboardStats | null; error?: string }> {
  if (!orgId) {
    return { data: null, error: 'Chưa chọn tổ chức (org_id trống).' }
  }

  try {
    const supabase = createClient()

    // [SECURITY AUDIT] Bắt buộc đăng nhập + org đích phải trong subtree của user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }
    const { data: inScope } = await supabase.rpc('is_org_in_my_subtree', {
      p_target_org_id: orgId,
    })
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'super_admin' && inScope !== true) {
      return { data: null, error: 'TỪ CHỐI: Cơ sở này không thuộc phạm vi của bạn.' }
    }

    // 1. Toàn bộ org trong subtree (cache 5 phút - đỡ 1 round-trip)
    let ids: string[]
    try {
      ids = await getDescendantOrgIds(supabase, orgId)
    } catch (rpcError) {
      return {
        data: null,
        error: `Lỗi truy vấn cây tổ chức: ${
          rpcError instanceof Error ? rpcError.message : 'không xác định'
        }`,
      }
    }
    if (!ids.includes(orgId)) ids = [...ids, orgId]

    // 2. Chạy song song: danh sách org (để dựng cây con), số lớp đang mở,
    //    học viên theo org, VÀ báo cáo vận hành (RPC 042 - 1 round-trip)
    const today = new Date().toISOString().slice(0, 10)
    const [orgsResult, classesResult, studentsResult, reportResult] =
      await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, parent_id')
          .in('id', ids)
          .is('deleted_at', null),
        supabase
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .in('org_id', ids)
          .is('deleted_at', null)
          .or(`end_date.is.null,end_date.gte.${today}`),
        supabase
          .from('profiles')
          .select('org_id')
          .eq('role', 'student')
          .in('org_id', ids)
          .is('deleted_at', null),
        // Migration 042 chưa chạy -> error, KHÔNG làm hỏng dashboard (report=null)
        supabase.rpc('get_overview_report', { p_org_ids: ids }),
      ])

    const firstError = orgsResult.error ?? classesResult.error ?? studentsResult.error
    if (firstError) {
      return { data: null, error: `Lỗi tải thống kê: ${firstError.message}` }
    }

    const orgs = (orgsResult.data ?? []) as OrgRow[]
    const activeClasses = classesResult.count ?? 0

    // Số học viên theo từng org (chưa cộng dồn)
    const studentCountByOrg = new Map<string, number>()
    for (const row of (studentsResult.data ?? []) as { org_id: string | null }[]) {
      if (!row.org_id) continue
      studentCountByOrg.set(row.org_id, (studentCountByOrg.get(row.org_id) ?? 0) + 1)
    }
    const totalStudents = [...studentCountByOrg.values()].reduce((a, b) => a + b, 0)

    // 3. Roll-up cho từng nhánh TRỰC THUỘC: BFS trên adjacency parent_id
    const childrenByParent = new Map<string, OrgRow[]>()
    for (const org of orgs) {
      if (!org.parent_id) continue
      const list = childrenByParent.get(org.parent_id) ?? []
      list.push(org)
      childrenByParent.set(org.parent_id, list)
    }

    function sumSubtreeStudents(rootId: string): number {
      let sum = studentCountByOrg.get(rootId) ?? 0
      for (const child of childrenByParent.get(rootId) ?? []) {
        sum += sumSubtreeStudents(child.id)
      }
      return sum
    }

    const childrenStats: ChildOrgStat[] = (childrenByParent.get(orgId) ?? [])
      .map((child) => ({
        orgId: child.id,
        name: child.name,
        students: sumSubtreeStudents(child.id),
      }))
      .sort((a, b) => b.students - a.students)

    return {
      data: {
        activeClasses,
        totalStudents,
        projectedRevenue: totalStudents * MOCK_TUITION_PER_STUDENT,
        childrenStats,
        report: reportResult.error ? null : parseOverviewReport(reportResult.data),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { data: null, error: `Không thể kết nối database: ${message}` }
  }
}

// ============================================================
// GỘP 3 LỜI GỌI TRANG TỔNG QUAN THÀNH 1 SERVER ACTION.
// Lý do TỐC ĐỘ: Next.js xếp hàng các server action từ cùng 1
// client chạy TUẦN TỰ (dù client Promise.all) -> gọi 3 action
// riêng = 3 round-trip nối đuôi. Gộp lại: 1 round-trip, các
// truy vấn bên trong chạy song song thật sự trên server.
// ============================================================

export type OverviewPageData = {
  stats: { data: DashboardStats | null; error?: string }
  /** Cấu hình org (fallback legacy cho layout widget) */
  orgConfig: OrgConfig
  layout: { error: string } | ({ error?: undefined } & MainDashboardLayoutResult)
}

export async function getOverviewPageData(
  orgId: string | null
): Promise<OverviewPageData> {
  const [stats, settings, layout] = await Promise.all([
    getDashboardStats(orgId),
    orgId ? getOrgSettings(orgId) : Promise.resolve(null),
    getMainDashboardLayout(),
  ])
  return {
    stats,
    orgConfig: settings?.config ?? DEFAULT_ORG_CONFIG,
    layout,
  }
}
