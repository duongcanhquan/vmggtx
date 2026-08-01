'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Projector,
  TicketCheck,
  Users,
} from 'lucide-react'
import type { StaffWidgetData } from '@/app/(portals)/staff/dashboard-actions'

// ============================================================
// Bộ Widget cho Staff Dashboard (thuần hiển thị, data từ 1 action).
// Mỗi widget tự co giãn theo khung WidgetContainer (overflow-auto).
// ============================================================

const VND = new Intl.NumberFormat('vi-VN')

function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl px-3 py-2 text-center ${tone}`}>
      <p className="font-heading text-xl font-bold leading-tight">{value}</p>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
    </div>
  )
}

/** Buổi học & điểm danh hôm nay */
export function WidgetAttendance({ data }: { data: StaffWidgetData['attendance'] }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Buổi hôm nay" value={data.total} tone="bg-indigo-50 text-indigo-800" />
        <StatPill label="Đã hoàn tất" value={data.completed} tone="bg-emerald-50 text-emerald-800" />
        <StatPill label="Đã hủy" value={data.cancelled} tone="bg-rose-50 text-rose-700" />
      </div>
      <Link
        href="/attendance"
        className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
        Vào điểm danh
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/** Đơn từ chờ duyệt (E-Ticketing) */
export function WidgetPendingTickets({ data }: { data: StaffWidgetData['tickets'] }) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <TicketCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-heading text-2xl font-bold">{data.pending}</p>
        <p className="text-xs text-muted-foreground">đơn chờ xử lý</p>
      </div>
      <ul className="space-y-1.5">
        {data.recent.map((ticket) => (
          <li
            key={ticket.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs"
          >
            <span className="truncate font-medium">{ticket.categoryName}</span>
            <span className="shrink-0 text-muted-foreground">{ticket.requesterName}</span>
          </li>
        ))}
        {data.recent.length === 0 && (
          <li className="rounded-lg bg-muted/60 px-2.5 py-2 text-center text-xs text-muted-foreground">
            Không có đơn nào chờ duyệt
          </li>
        )}
      </ul>
      <Link
        href="/admin/requests"
        className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        Mở Kanban duyệt đơn
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/** Biểu đồ doanh thu 6 tháng (thanh CSS, nhẹ - không cần recharts) */
export function WidgetFinanceChart({ data }: { data: StaffWidgetData['finance'] }) {
  const max = Math.max(1, ...data.months.map((month) => month.amount))
  const total = data.months.reduce((sum, month) => sum + month.amount, 0)
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Tổng thu 6 tháng:{' '}
        <span className="font-heading text-sm font-bold text-foreground">{VND.format(total)}đ</span>
      </p>
      <div className="flex flex-1 items-end gap-2">
        {data.months.map((month) => (
          <div key={month.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground">
              {month.amount > 0 ? VND.format(Math.round(month.amount / 1_000_000)) + 'tr' : ''}
            </span>
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400"
              style={{ height: `${Math.max(4, (month.amount / max) * 100)}%` }}
              title={`${month.label}: ${VND.format(month.amount)}đ`}
            />
            <span className="text-[11px] font-medium text-muted-foreground">{month.label}</span>
          </div>
        ))}
      </div>
      <Link
        href="/finance/invoices"
        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        Xem học phí chi tiết
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/** Yêu cầu của giáo viên (xin nghỉ / đề xuất lịch) */
export function WidgetTeacherRequests({ data }: { data: StaffWidgetData['teacherRequests'] }) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          <CalendarCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="font-heading text-2xl font-bold">{data.pending}</p>
        <p className="text-xs text-muted-foreground">yêu cầu GV chờ duyệt</p>
      </div>
      {data.pending > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Duyệt sớm để kịp điều phối dạy thay / dạy bù.
        </p>
      )}
      <Link
        href="/academic/requests"
        className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        Xử lý yêu cầu
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/** Phòng & thiết bị hôm nay */
export function WidgetFacilities({ data }: { data: StaffWidgetData['facilities'] }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <StatPill
          label="Tài sản hoạt động"
          value={data.activeFacilities}
          tone="bg-violet-50 text-violet-800"
        />
        <StatPill
          label="Lượt đặt hôm nay"
          value={data.todayBookings}
          tone="bg-emerald-50 text-emerald-800"
        />
      </div>
      <Link
        href="/staff/facilities"
        className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
      >
        <Projector className="h-3.5 w-3.5" aria-hidden="true" />
        Mở lịch đặt phòng
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

/** Lối tắt nghiệp vụ */
export function WidgetQuickLinks() {
  const LINKS = [
    { href: '/staff/classes', label: 'Vận hành lớp', icon: BookOpen },
    { href: '/students', label: 'Học sinh', icon: Users },
    { href: '/staff/schedule-management', label: 'Điều phối lịch', icon: CalendarCheck },
    { href: '/staff/exam-schedule', label: 'Khảo thí', icon: ClipboardList },
  ]
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      {LINKS.map((link) => {
        const Icon = link.icon
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <Icon className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
            <span className="truncate">{link.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
