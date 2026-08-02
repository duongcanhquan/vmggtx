'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen,
  Users,
  Wallet,
  Building2,
  BarChart3,
  CalendarCheck2,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  FlaskConical,
  GripVertical,
  Loader2,
  Lock,
  PieChart,
  Send,
  SlidersHorizontal,
  UserX,
  X,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { findOrgNode, type OrgTreeNode } from '@/lib/utils/org-tree'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { DEFAULT_ORG_CONFIG, type OrgConfig } from '@/lib/validation/schemas'
import {
  getOverviewPageData,
  type AttendanceWeekPoint,
  type DashboardStats,
  type OverviewReport,
} from './actions'
import {
  applyMainLayoutTemplate,
  saveMainDashboardLayout,
  type MainTemplateRoleTarget,
  type MainWidgetItem,
} from './layout-actions'

// Lazy-load recharts: dashboard tương tác được ngay, biểu đồ tải nền
const StudentsByBranchChart = dynamic(
  () =>
    import('@/components/dashboard/StudentsByBranchChart').then(
      (mod) => mod.StudentsByBranchChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const WeeklyAttendanceChart = dynamic(
  () =>
    import('@/components/dashboard/WeeklyAttendanceChart').then(
      (mod) => mod.WeeklyAttendanceChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const EnrollmentStatusChart = dynamic(
  () =>
    import('@/components/dashboard/EnrollmentStatusChart').then(
      (mod) => mod.EnrollmentStatusChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

function formatVnd(amount: number) {
  return amount.toLocaleString('vi-VN') + ' ₫'
}

// ===== Demo fallback: sinh số liệu ỔN ĐỊNH từ cây org khi DB chưa có dữ liệu =====
function stableHash(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100_000
  }
  return hash
}

function demoStudentsOfNode(node: OrgTreeNode): number {
  return 40 + (stableHash(node.id) % 160)
}

function demoSubtreeStudents(node: OrgTreeNode): number {
  return node.children.reduce(
    (sum, child) => sum + demoSubtreeStudents(child),
    demoStudentsOfNode(node)
  )
}

function buildDemoReport(node: OrgTreeNode): OverviewReport {
  const seed = stableHash(node.id)
  const week: AttendanceWeekPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    week.push({
      day: date.toISOString().slice(0, 10),
      present: 60 + ((seed + i * 37) % 90),
      absent: 3 + ((seed + i * 13) % 9),
      excused: (seed + i * 7) % 5,
    })
  }
  const today = week[week.length - 1]
  return {
    sessionsToday: {
      scheduled: 4 + (seed % 5),
      completed: 2 + (seed % 3),
      cancelled: seed % 2,
    },
    attendanceToday: {
      present: today.present,
      absent: today.absent,
      late: seed % 4,
      excused: today.excused,
    },
    attendanceWeek: week,
    enrollmentStatus: {
      active: 120 + (seed % 200),
      paused: 4 + (seed % 10),
      dropped: 2 + (seed % 6),
      completed: 30 + (seed % 40),
    },
    absentToday: [
      { name: 'Nguyễn Văn An', className: 'Toán 12A', status: 'absent', note: null },
      {
        name: 'Trần Thị Bích',
        className: 'Văn 11B',
        status: 'excused',
        note: 'Ốm - có đơn xin phép',
      },
      { name: 'Lê Minh Châu', className: 'Anh 10C', status: 'absent', note: null },
    ],
  }
}

function buildDemoStats(node: OrgTreeNode): DashboardStats {
  const totalStudents = demoSubtreeStudents(node)
  return {
    activeClasses: Math.max(1, Math.round(totalStudents / 25)),
    totalStudents,
    projectedRevenue: totalStudents * 1_500_000,
    childrenStats: node.children
      .map((child) => ({
        orgId: child.id,
        name: child.name,
        students: demoSubtreeStudents(child),
      }))
      .sort((a, b) => b.students - a.students),
    report: buildDemoReport(node),
  }
}
// =================================================================================

// ============================================================
// HỆ WIDGET CÁ NHÂN HÓA (kéo thả trong chế độ "Tùy biến"):
// thứ tự + ẩn/hiện lưu vào user_preferences (TỪNG USER - migration
// 034). Ưu tiên: template ép buộc (is_forced) > layout riêng của
// user > template theo role > org_settings cũ (legacy) > default.
// QTV có thể áp bố cục hiện tại cho toàn bộ nhân sự 1 role.
// ============================================================

type WidgetItem = OrgConfig['dashboard_widgets'][number]
type WidgetId = WidgetItem['id']

/** Nhãn role hiển thị trên panel "Áp cho nhân sự" của QTV */
const PUSH_ROLE_LABELS: Record<MainTemplateRoleTarget, string> = {
  campus_admin: 'Quản lý cơ sở',
  academic_staff: 'Giáo vụ',
  admission_staff: 'Tuyển sinh',
  accountant: 'Kế toán',
  teacher: 'Giáo viên',
}

const WIDGET_META: Record<WidgetId, { title: string; gridClass: string }> = {
  kpi_students: { title: 'Tổng học viên', gridClass: 'sm:col-span-2 lg:col-span-6' },
  kpi_revenue: { title: 'Doanh thu đã thu', gridClass: 'lg:col-span-3' },
  kpi_classes: { title: 'Lớp đang mở', gridClass: 'lg:col-span-3' },
  ops_today: { title: 'Vận hành hôm nay', gridClass: 'sm:col-span-2 lg:col-span-12' },
  attendance_week: {
    title: 'Điểm danh 7 ngày',
    gridClass: 'sm:col-span-2 lg:col-span-8',
  },
  enrollment_status: {
    title: 'Vòng đời ghi danh',
    gridClass: 'sm:col-span-2 lg:col-span-4',
  },
  branch_chart: { title: 'Biểu đồ chi nhánh', gridClass: 'sm:col-span-2 lg:col-span-8' },
  branch_ranking: { title: 'Xếp hạng chi nhánh', gridClass: 'sm:col-span-2 lg:col-span-4' },
  absent_today: {
    title: 'Học sinh vắng hôm nay',
    gridClass: 'sm:col-span-2 lg:col-span-12',
  },
}

/** Ô thống kê nhỏ trong widget "Vận hành hôm nay" */
function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'green' | 'red' | 'amber' | 'indigo'
}) {
  const toneClass = {
    neutral: 'bg-stone-50 text-stone-700 ring-stone-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    red: 'bg-rose-50 text-rose-700 ring-rose-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  }[tone]
  return (
    <div className={`rounded-2xl p-4 ring-1 ${toneClass}`}>
      <p className="font-heading text-2xl font-bold tabular-nums sm:text-3xl">
        {value.toLocaleString('vi-VN')}
      </p>
      <p className="mt-0.5 text-xs font-semibold sm:text-sm">{label}</p>
    </div>
  )
}

/** Hộp nhắc khi DB thật chưa chạy migration 042 (report = null) */
function ReportUnavailable() {
  return (
    <p className="flex h-40 items-center justify-center rounded-xl bg-stone-50 px-6 text-center text-sm text-muted-foreground">
      Chưa có dữ liệu báo cáo vận hành — cần chạy migration
      042_overview_report.sql trên Supabase.
    </p>
  )
}

/**
 * Đảm bảo đủ widget (config cũ thiếu widget mới sẽ tự bổ sung cuối);
 * đồng thời LOẠI id lạ (dữ liệu server trả về dạng {id, visible} tự do).
 */
function normalizeLayout(layout: MainWidgetItem[] | null | undefined): WidgetItem[] {
  const base = (layout ?? [])
    .filter((item): item is WidgetItem => item.id in WIDGET_META)
    .map((item) => ({ ...item }))
  for (const item of DEFAULT_ORG_CONFIG.dashboard_widgets) {
    if (!base.some((existing) => existing.id === item.id)) base.push({ ...item })
  }
  return base
}

export default function OverviewPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const orgTree = useOrgStore((state) => state.orgTree)
  const currentOrg = currentOrgId ? findOrgNode(orgTree, currentOrgId) : null

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  // --- Cá nhân hóa widget (lưu THEO USER - user_preferences) ---
  const [layout, setLayout] = useState<WidgetItem[]>(
    DEFAULT_ORG_CONFIG.dashboard_widgets
  )
  /** Bố cục đã lưu gần nhất - dùng khi bấm Hủy */
  const [savedLayout, setSavedLayout] = useState<WidgetItem[]>(
    DEFAULT_ORG_CONFIG.dashboard_widgets
  )
  const [editMode, setEditMode] = useState(false)
  const [savingLayout, setSavingLayout] = useState(false)
  const [dragWidgetId, setDragWidgetId] = useState<WidgetId | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  /** true = QTV ép bố cục (is_forced) - user thường bị khóa Tùy biến */
  const [isForced, setIsForced] = useState(false)
  /** true = được áp bố cục cho toàn bộ nhân sự 1 role */
  const [canPushTemplate, setCanPushTemplate] = useState(false)
  // --- Panel "Áp cho nhân sự" (QTV) ---
  const [pushRole, setPushRole] = useState<MainTemplateRoleTarget>('academic_staff')
  const [pushForced, setPushForced] = useState(false)
  const [pushing, setPushing] = useState(false)

  useEffect(() => {
    if (!currentOrgId) {
      setStats(null)
      return
    }
    let cancelled = false
    setLoading(true)
    // TỐC ĐỘ: 1 server action DUY NHẤT gộp số liệu + báo cáo + settings
    // + layout (Next chạy các action từ cùng client TUẦN TỰ, nên gọi
    // 3 action riêng sẽ nối đuôi nhau chứ không song song).
    getOverviewPageData(currentOrgId).then(({ stats: result, orgConfig, layout: layoutResult }) => {
      if (cancelled) return
      if (result.data) {
        setStats(result.data)
        setIsDemo(false)
      } else {
        // DB chưa sẵn sàng -> số liệu demo nhất quán với cây org đang chọn
        const node = findOrgNode(useOrgStore.getState().orgTree, currentOrgId)
        setStats(node ? buildDemoStats(node) : null)
        setIsDemo(true)
      }

      // Ưu tiên: layout theo user/template -> org_settings cũ -> default
      const personal =
        layoutResult.error === undefined && layoutResult.layout
          ? layoutResult.layout
          : null
      const chosen = normalizeLayout(personal ?? orgConfig.dashboard_widgets)
      setLayout(chosen)
      setSavedLayout(chosen)
      if (layoutResult.error === undefined) {
        setIsForced(layoutResult.isForced)
        setCanPushTemplate(layoutResult.canPushTemplate)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  // ----- Kéo thả sắp xếp widget (chế độ Tùy biến) -----
  const handleDropOnWidget = useCallback(
    (targetId: WidgetId) => {
      if (!dragWidgetId || dragWidgetId === targetId) return
      setLayout((current) => {
        const next = [...current]
        const fromIndex = next.findIndex((w) => w.id === dragWidgetId)
        const toIndex = next.findIndex((w) => w.id === targetId)
        if (fromIndex < 0 || toIndex < 0) return current
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return next
      })
      setDragWidgetId(null)
    },
    [dragWidgetId]
  )

  function toggleWidget(id: WidgetId) {
    setLayout((current) =>
      current.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    )
  }

  async function handleSaveLayout() {
    setSavingLayout(true)
    const result = await saveMainDashboardLayout(layout)
    setSavingLayout(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setSavedLayout(layout)
    setEditMode(false)
    setToast({ type: 'success', message: 'Đã lưu bố cục dashboard của bạn.' })
  }

  function handleCancelEdit() {
    setLayout(savedLayout)
    setEditMode(false)
  }

  /** QTV: áp bố cục đang chỉnh cho toàn bộ nhân sự 1 role */
  async function handlePushTemplate() {
    setPushing(true)
    const result = await applyMainLayoutTemplate(pushRole, layout, pushForced)
    setPushing(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Đã áp bố cục cho toàn bộ nhân sự role "${PUSH_ROLE_LABELS[pushRole]}"${
        pushForced ? ' (khóa tùy biến)' : ''
      }.`,
    })
  }

  // ----- Nội dung từng widget -----
  function renderWidgetBody(id: WidgetId) {
    if (!stats) return null
    switch (id) {
      case 'kpi_students':
        return (
          <div className="bento-card-dark h-full p-6">
            <div className="flex items-start justify-between">
              <span className="bento-icon border border-[#5d68e8]/30 bg-white/5 text-[#a5b5f7]">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="rounded-full border border-[#5d68e8]/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#a5b5f7]">
                Toàn hệ thống
              </span>
            </div>
            <p className="mt-6 font-heading text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
              {stats.totalStudents.toLocaleString('vi-VN')}
            </p>
            <p className="mt-1 text-sm font-medium text-stone-300">Học viên đang theo học</p>
            <p className="mt-1 text-xs text-stone-400">Roll-up từ mọi chi nhánh con/cháu</p>
          </div>
        )
      case 'kpi_revenue':
        return (
          <div className="bento-card-gold h-full p-6">
            <span className="bento-icon bg-[#3c3ac0]/10 text-[#3c3ac0]">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-5 truncate font-heading text-2xl font-bold tabular-nums tracking-tight text-[#573412]">
              {formatVnd(stats.projectedRevenue)}
            </p>
            <p className="mt-0.5 text-sm font-medium text-[#6b3f10]">Doanh thu đã thu</p>
            <p className="mt-1 text-xs text-[#3c3ac0]/70">Ước tính 1,5 triệu ₫/học viên</p>
          </div>
        )
      case 'kpi_classes':
        return (
          <div className="bento-card h-full p-6">
            <span className="bento-icon bg-stone-100 text-stone-700">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-5 font-heading text-2xl font-bold tabular-nums tracking-tight">
              {stats.activeClasses.toLocaleString('vi-VN')}
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">Lớp học đang mở</p>
            <p className="mt-1 text-xs text-muted-foreground">Cộng dồn đơn vị trực thuộc</p>
          </div>
        )
      case 'ops_today': {
        const report = stats.report
        const att = report?.attendanceToday
        const totalMarked = att
          ? att.present + att.absent + att.late + att.excused
          : 0
        const presentRate =
          att && totalMarked > 0
            ? Math.round(((att.present + att.late) / totalMarked) * 100)
            : null
        return (
          <div className="bento-card h-full p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="bento-icon bg-stone-100 text-stone-700">
                <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-bold">Vận hành hôm nay</h2>
              {presentRate !== null && (
                <span
                  className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${
                    presentRate >= 90
                      ? 'bg-emerald-50 text-emerald-700'
                      : presentRate >= 75
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  Tỷ lệ chuyên cần {presentRate}%
                </span>
              )}
            </div>
            {report ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                <StatTile
                  label="Buổi học xếp lịch"
                  value={
                    report.sessionsToday.scheduled +
                    report.sessionsToday.completed +
                    report.sessionsToday.cancelled
                  }
                  tone="indigo"
                />
                <StatTile
                  label="Đã hoàn thành"
                  value={report.sessionsToday.completed}
                  tone="green"
                />
                <StatTile
                  label="Buổi bị hủy"
                  value={report.sessionsToday.cancelled}
                  tone="neutral"
                />
                <StatTile
                  label="Có mặt"
                  value={report.attendanceToday.present}
                  tone="green"
                />
                <StatTile label="Vắng" value={report.attendanceToday.absent} tone="red" />
                <StatTile
                  label="Đi muộn"
                  value={report.attendanceToday.late}
                  tone="amber"
                />
                <StatTile
                  label="Có phép"
                  value={report.attendanceToday.excused}
                  tone="amber"
                />
              </div>
            ) : (
              <ReportUnavailable />
            )}
          </div>
        )
      }
      case 'attendance_week':
        return (
          <div className="bento-card h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="bento-icon bg-emerald-50 text-emerald-700">
                <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-bold">
                Điểm danh 7 ngày gần nhất
              </h2>
            </div>
            {stats.report ? (
              stats.report.attendanceWeek.length > 0 ? (
                <WeeklyAttendanceChart data={stats.report.attendanceWeek} />
              ) : (
                <p className="flex h-64 items-center justify-center rounded-xl bg-stone-50 text-sm text-muted-foreground">
                  Chưa có lượt điểm danh nào trong 7 ngày qua.
                </p>
              )
            ) : (
              <ReportUnavailable />
            )}
          </div>
        )
      case 'enrollment_status':
        return (
          <div className="bento-card h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="bento-icon bg-indigo-50 text-indigo-700">
                <PieChart className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-bold">Vòng đời ghi danh</h2>
            </div>
            {stats.report ? (
              <EnrollmentStatusChart data={stats.report.enrollmentStatus} />
            ) : (
              <ReportUnavailable />
            )}
          </div>
        )
      case 'absent_today':
        return (
          <div className="bento-card h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="bento-icon bg-rose-50 text-rose-700">
                <UserX className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-bold">
                Học sinh vắng hôm nay
              </h2>
              {stats.report && stats.report.absentToday.length > 0 && (
                <span className="ml-auto rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                  {stats.report.absentToday.length} học sinh
                </span>
              )}
            </div>
            {stats.report ? (
              stats.report.absentToday.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Học sinh</th>
                        <th className="px-3 py-2">Lớp</th>
                        <th className="px-3 py-2">Trạng thái</th>
                        <th className="px-3 py-2">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.report.absentToday.map((row, index) => (
                        <tr
                          key={`${row.name}-${index}`}
                          className="border-b border-border last:border-b-0 hover:bg-stone-50/70"
                        >
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-foreground">
                            {row.name}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {row.className}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                row.status === 'excused'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {row.status === 'excused' ? 'Có phép' : 'Vắng'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {row.note ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="flex h-24 items-center justify-center rounded-xl bg-emerald-50 text-sm font-medium text-emerald-700">
                  Tuyệt vời — hôm nay không có học sinh vắng.
                </p>
              )
            ) : (
              <ReportUnavailable />
            )}
          </div>
        )
      case 'branch_chart':
        return (
          <div className="bento-card h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="bento-icon bg-stone-100 text-stone-700">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-bold">
                Học viên theo đơn vị trực thuộc
              </h2>
            </div>
            {stats.childrenStats.length > 0 ? (
              <StudentsByBranchChart data={stats.childrenStats} />
            ) : (
              <p className="rounded-xl bg-stone-50 p-6 text-center text-sm text-muted-foreground">
                Không có nhánh trực thuộc.
              </p>
            )}
          </div>
        )
      case 'branch_ranking':
        return (
          <div className="bento-card h-full p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="bento-icon bg-[#5d68e8]/10 text-[#3c3ac0]">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-bold">Xếp hạng chi nhánh</h2>
            </div>
            {stats.childrenStats.length > 0 ? (
              <ol className="space-y-4">
                {stats.childrenStats.map((child, index) => {
                  const share =
                    stats.totalStudents > 0
                      ? Math.round((child.students / stats.totalStudents) * 100)
                      : 0
                  return (
                    <li key={child.orgId}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              index === 0
                                ? 'bg-[#5d68e8]/15 text-[#3c3ac0] ring-1 ring-[#5d68e8]/40'
                                : 'bg-stone-100 text-stone-500'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="truncate font-medium text-foreground">
                            {child.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
                          {child.students.toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#33319b] to-[#5d68e8]"
                          style={{ width: `${Math.max(share, 4)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right text-[11px] text-muted-foreground">
                        {share}% toàn hệ thống
                      </p>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="rounded-xl bg-stone-50 p-6 text-center text-sm text-muted-foreground">
                Đơn vị cấp cuối — không có chi nhánh con.
              </p>
            )}
          </div>
        )
    }
  }

  const visibleWidgets = layout.filter((w) => editMode || w.visible)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Tổng quan Hệ thống
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentOrg ? (
              <span className="font-semibold text-foreground">{currentOrg.name}</span>
            ) : (
              'Chọn cấp quản lý để xem số liệu.'
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isDemo && (
            <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-secondary">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Dữ liệu demo
            </span>
          )}
          {/* Tùy biến bố cục: MỖI USER tự cá nhân hóa (lưu user_preferences).
              is_forced = QTV áp đặt -> user thường bị khóa. */}
          {currentOrgId && !loading && stats && isForced && (
            <span className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Bố cục do QTV áp đặt
            </span>
          )}
          {currentOrgId && !loading && stats && !isForced && (
            <>
              {editMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-muted-foreground hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLayout}
                    disabled={savingLayout}
                    className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingLayout ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    Lưu bố cục
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#5d68e8]/40 bg-[#5d68e8]/5 px-3.5 text-sm font-semibold text-[#3c3ac0] hover:bg-[#5d68e8]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  Tùy biến
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editMode && (
        <div className="space-y-3 rounded-2xl border border-[#5d68e8]/30 bg-[#5d68e8]/5 px-4 py-3 text-sm text-[#6b3f10]">
          <p>
            Chế độ tùy biến: <strong>kéo thả</strong> để đổi vị trí, bấm{' '}
            <strong>biểu tượng mắt</strong> để ẩn/hiện widget, rồi bấm Lưu bố cục.
            Bố cục được lưu <strong>riêng cho tài khoản của bạn</strong>.
          </p>
          {/* QTV: áp bố cục hiện tại làm mặc định cho toàn bộ nhân sự 1 role */}
          {canPushTemplate && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#5d68e8]/20 pt-3">
              <span className="font-semibold">Áp cho nhân sự:</span>
              <select
                value={pushRole}
                onChange={(e) => setPushRole(e.target.value as MainTemplateRoleTarget)}
                aria-label="Role đích"
                className="min-h-9 cursor-pointer rounded-lg border border-[#5d68e8]/40 bg-surface px-2.5 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {Object.entries(PUSH_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={pushForced}
                  onChange={(e) => setPushForced(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[#3c3ac0]"
                />
                Khóa tùy biến (bắt buộc dùng)
              </label>
              <button
                type="button"
                onClick={handlePushTemplate}
                disabled={pushing}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#3c3ac0] px-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Áp dụng
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chưa chọn org */}
      {!currentOrgId && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-heading text-lg font-bold">Chưa chọn cấp quản lý</p>
          <p className="max-w-sm text-sm text-muted-foreground">Chọn đơn vị để xem thống kê.</p>
        </div>
      )}

      {/* Skeleton */}
      {currentOrgId && loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {currentOrgId && !loading && stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          {visibleWidgets.map((widget) => {
            const meta = WIDGET_META[widget.id]
            return (
              <section
                key={widget.id}
                aria-label={meta.title}
                draggable={editMode}
                onDragStart={(e) => {
                  if (!editMode) return
                  setDragWidgetId(widget.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  if (editMode) e.preventDefault()
                }}
                onDrop={(e) => {
                  if (!editMode) return
                  e.preventDefault()
                  handleDropOnWidget(widget.id)
                }}
                className={`relative ${meta.gridClass} ${
                  editMode
                    ? 'cursor-grab rounded-3xl ring-2 ring-dashed ring-stone-300 transition-shadow active:cursor-grabbing'
                    : ''
                } ${editMode && !widget.visible ? 'opacity-40' : ''}`}
              >
                {editMode && (
                  <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleWidget(widget.id)}
                      aria-label={`${widget.visible ? 'Ẩn' : 'Hiện'} widget ${meta.title}`}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface/95 text-muted-foreground shadow-sm hover:text-primary"
                    >
                      {widget.visible ? (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface/95 text-muted-foreground shadow-sm">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                )}
                {renderWidgetBody(widget.id)}
              </section>
            )
          })}
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
