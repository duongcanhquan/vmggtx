'use client'

import { useEffect, useState } from 'react'
import { getStaffWidgetData, type StaffWidgetData, type WidgetLayoutItem } from './dashboard-actions'
import { useDashboardLayout } from '@/lib/hooks/useDashboardLayout'
import { WidgetContainer, type DashboardWidget } from '@/components/dashboard/WidgetContainer'
import {
  WidgetAttendance,
  WidgetFacilities,
  WidgetFinanceChart,
  WidgetPendingTickets,
  WidgetQuickLinks,
  WidgetTeacherRequests,
} from '@/components/dashboard/StaffWidgets'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'

// ============================================================
// Staff Dashboard ĐỘNG - kéo thả widget (react-grid-layout).
// Layout riêng lưu user_preferences; QTV có thể áp template
// cho toàn bộ nhân sự cùng role (global_layout_templates).
// ============================================================

const WIDGET_IDS = [
  'attendance_today',
  'pending_tickets',
  'finance_chart',
  'teacher_requests',
  'facilities',
  'quick_links',
]

const DEFAULT_LAYOUT: WidgetLayoutItem[] = [
  { i: 'attendance_today', x: 0, y: 0, w: 4, h: 3 },
  { i: 'teacher_requests', x: 0, y: 3, w: 4, h: 3 },
  { i: 'pending_tickets', x: 4, y: 0, w: 4, h: 6 },
  { i: 'finance_chart', x: 8, y: 0, w: 4, h: 6 },
  { i: 'facilities', x: 0, y: 6, w: 6, h: 3 },
  { i: 'quick_links', x: 6, y: 6, w: 6, h: 3 },
]

const EMPTY_DATA: StaffWidgetData = {
  attendance: { total: 0, completed: 0, cancelled: 0 },
  tickets: { pending: 0, recent: [] },
  finance: { months: [] },
  teacherRequests: { pending: 0 },
  facilities: { activeFacilities: 0, todayBookings: 0 },
}

export default function StaffPortalPage() {
  const dashboard = useDashboardLayout({ widgetIds: WIDGET_IDS, defaultLayout: DEFAULT_LAYOUT })
  const [data, setData] = useState<StaffWidgetData | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  useEffect(() => {
    let cancelled = false
    void getStaffWidgetData().then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        setData(EMPTY_DATA)
        setToast({ type: 'error', message: result.error })
      } else {
        setData(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Lỗi lưu layout -> toast
  useEffect(() => {
    if (dashboard.saveError) {
      setToast({ type: 'error', message: dashboard.saveError })
      dashboard.clearSaveError()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.saveError])

  if (dashboard.loading || data === null) {
    return <FunLoader label="Đang dựng dashboard riêng của bạn…" />
  }

  const widgets: DashboardWidget[] = [
    { id: 'attendance_today', title: 'Buổi học hôm nay', node: <WidgetAttendance data={data.attendance} /> },
    { id: 'pending_tickets', title: 'Đơn từ chờ duyệt', node: <WidgetPendingTickets data={data.tickets} /> },
    { id: 'finance_chart', title: 'Doanh thu 6 tháng', node: <WidgetFinanceChart data={data.finance} /> },
    { id: 'teacher_requests', title: 'Yêu cầu giáo viên', node: <WidgetTeacherRequests data={data.teacherRequests} /> },
    { id: 'facilities', title: 'Phòng & thiết bị', node: <WidgetFacilities data={data.facilities} /> },
    { id: 'quick_links', title: 'Lối tắt nghiệp vụ', node: <WidgetQuickLinks /> },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
          Staff Portal
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Bảng điều khiển của bạn
        </h1>
        {dashboard.migrationMissing && (
          <p className="mt-1 text-xs text-amber-700">
            Database chưa chạy migration 034 — layout sẽ không được lưu lại.
          </p>
        )}
      </div>

      <WidgetContainer
        widgets={widgets}
        layout={dashboard.layout}
        hiddenWidgetIds={dashboard.hiddenWidgetIds}
        customizing={dashboard.customizing}
        setCustomizing={dashboard.setCustomizing}
        isForced={dashboard.isForced}
        canPushTemplate={dashboard.canPushTemplate}
        onLayoutChange={dashboard.handleLayoutChange}
        onHideWidget={dashboard.hideWidget}
        onShowWidget={dashboard.showWidget}
        onResetLayout={dashboard.resetLayout}
        onPushTemplate={dashboard.pushTemplate}
      />

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
