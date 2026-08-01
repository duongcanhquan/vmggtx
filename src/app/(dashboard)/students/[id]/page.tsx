'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CalendarClock,
  CircleDollarSign,
  FileWarning,
  GraduationCap,
  Inbox,
  Loader2,
  Printer,
  Receipt,
  ShieldAlert,
  Sparkles,
  UserRound,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { getStudent360, type Student360 } from './actions'

// Lazy-load recharts: chỉ tải khi mở tab có biểu đồ -> trang mở tức thì
const SubjectRadarChart = dynamic(
  () => import('@/components/charts/Student360Charts').then((mod) => mod.SubjectRadarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const AttendancePieChart = dynamic(
  () => import('@/components/charts/Student360Charts').then((mod) => mod.AttendancePieChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const DebtBarChart = dynamic(
  () => import('@/components/charts/Student360Charts').then((mod) => mod.DebtBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

// ============================================================
// HỒ SƠ HỌC SINH 360° (/students/[id])
// Header (avatar + tags động) + 4 tabs: Tổng quan / Học tập /
// Tài chính / Lịch sử tương tác (timeline + lịch sử hỏi AI).
// Server action đã chốt 403 nếu học sinh ngoài cây org của viewer.
// ============================================================

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: UserRound },
  { id: 'academic', label: 'Học tập', icon: GraduationCap },
  { id: 'finance', label: 'Tài chính', icon: CircleDollarSign },
  { id: 'history', label: 'Lịch sử tương tác', icon: CalendarClock },
] as const

type TabId = (typeof TABS)[number]['id']

const INVOICE_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Chờ thu', className: 'bg-amber-50 text-amber-700' },
  partial: { label: 'Thu một phần', className: 'bg-sky-50 text-sky-700' },
  paid: { label: 'Đã thu đủ', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Đã hủy', className: 'bg-slate-100 text-slate-500' },
}

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} đ`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
}

export default function Student360Page({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Student360 | null>(null)
  const [errorState, setErrorState] = useState<{ message: string; status?: number } | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getStudent360(params.id).then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        setErrorState({ message: result.error, status: result.status })
      } else {
        setData(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [params.id])

  const stats = useMemo(() => {
    if (!data) return null
    const totalSessions =
      data.attendance.present + data.attendance.excused + data.attendance.absent
    const attendanceRate =
      totalSessions > 0 ? Math.round((data.attendance.present / totalSessions) * 100) : null
    const gpa =
      data.radar.length > 0
        ? Math.round(
            (data.radar.reduce((sum, r) => sum + r.score, 0) / data.radar.length) * 10
          ) / 10
        : null
    const outstanding = data.invoices
      .filter((invoice) => invoice.status === 'pending' || invoice.status === 'partial')
      .reduce((sum, invoice) => sum + (invoice.amount - invoice.paidAmount), 0)
    return { totalSessions, attendanceRate, gpa, outstanding }
  }, [data])

  // ---------- In biên lai ----------
  function printReceipt(invoice: Student360['invoices'][number]) {
    if (!data) return
    const win = window.open('', '_blank', 'width=420,height=640')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Biên lai ${invoice.code}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#1c1917}
  h1{font-size:18px;margin:0 0 4px}
  .muted{color:#78716c;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
  td{padding:6px 0;border-bottom:1px dashed #e7e2da}
  td:last-child{text-align:right;font-weight:600}
  .total{font-size:16px;color:#a16207}
</style></head><body>
  <h1>BIÊN LAI THU HỌC PHÍ</h1>
  <p class="muted">${data.profile.orgName} · In lúc ${new Date().toLocaleString('vi-VN')}</p>
  <table>
    <tr><td>Học sinh</td><td>${data.profile.fullName} (${data.profile.code})</td></tr>
    <tr><td>Số hóa đơn</td><td>${invoice.code}</td></tr>
    <tr><td>Ngày phát hành</td><td>${formatDate(invoice.createdAt)}</td></tr>
    <tr><td>Tổng tiền</td><td>${formatVnd(invoice.amount)}</td></tr>
    <tr><td>Đã thanh toán</td><td class="total">${formatVnd(invoice.paidAmount)}</td></tr>
    <tr><td>Còn lại</td><td>${formatVnd(invoice.amount - invoice.paidAmount)}</td></tr>
  </table>
  <p class="muted" style="margin-top:20px">Biên lai in từ hệ thống GDTX ERP — không cần đóng dấu.</p>
</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  // ---------- Trạng thái tải / lỗi ----------
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải hồ sơ 360°…
      </div>
    )
  }

  if (errorState || !data) {
    const is403 = errorState?.status === 403
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" aria-hidden="true" />
        <h1 className="font-heading text-xl font-bold text-rose-700">
          {is403 ? '403 — Không có quyền truy cập' : 'Không tải được hồ sơ'}
        </h1>
        <p className="text-sm text-rose-600">
          {errorState?.message ?? 'Lỗi không xác định.'}
        </p>
        <Link
          href="/students"
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Về danh sách học sinh
        </Link>
      </div>
    )
  }

  const { profile } = data
  const pieData = [
    { name: 'Có mặt', key: 'present', value: data.attendance.present },
    { name: 'Vắng phép', key: 'excused', value: data.attendance.excused },
    { name: 'Vắng KP', key: 'absent', value: data.attendance.absent },
  ].filter((slice) => slice.value > 0)

  const debtChartData = data.invoices
    .slice(0, 8)
    .map((invoice) => ({
      name: invoice.code,
      'Đã thu': invoice.paidAmount,
      'Còn nợ': Math.max(0, invoice.amount - invoice.paidAmount),
    }))
    .reverse()

  return (
    <div className="space-y-6">
      <Link
        href="/students"
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Quay lại Quản lý Học sinh
      </Link>

      {/* ===== Header 360° ===== */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 font-heading text-xl font-bold text-white"
        >
          {initials(profile.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {profile.fullName}
            </h1>
            <span
              className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                profile.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {profile.status === 'active' ? 'Đang học' : 'Bảo lưu'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-mono text-xs font-semibold text-indigo-700">
              {profile.code}
            </span>{' '}
            · {profile.orgName} · Nhập học {formatDate(profile.enrolledAt)}
          </p>
          {/* Tags từ trường động custom_metadata */}
          {profile.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.tags.map((tag) => (
                <span
                  key={tag.label}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {tag.label}: {tag.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <div
        role="tablist"
        aria-label="Hồ sơ học sinh 360 độ"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-indigo-50 hover:text-primary'
              }`}
            >
              <tab.icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ===== TAB: Tổng quan ===== */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Lớp đang học', value: String(data.classes.length) },
              { label: 'Điểm TB chung', value: stats?.gpa !== null ? `${stats?.gpa}` : '—' },
              {
                label: 'Tỷ lệ đi học',
                value: stats?.attendanceRate !== null ? `${stats?.attendanceRate}%` : '—',
              },
              { label: 'Công nợ còn lại', value: formatVnd(stats?.outstanding ?? 0) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-heading text-base font-bold">Thông tin liên hệ</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium text-foreground">{profile.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Số điện thoại</dt>
                <dd className="font-mono font-medium text-foreground">
                  {profile.phone ?? '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Địa chỉ</dt>
                <dd className="font-medium text-foreground">{profile.address ?? '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* ===== TAB: Học tập ===== */}
      {activeTab === 'academic' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              Lớp đang học ({data.classes.length})
            </h2>
            {data.classes.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Inbox className="h-4 w-4" aria-hidden="true" />
                Chưa ghi danh lớp nào.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {data.classes.map((cls) => (
                  <li
                    key={cls.id}
                    className="rounded-xl border border-border bg-background p-3.5"
                  >
                    <p className="font-semibold text-foreground">{cls.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Môn {cls.subjectName} · GV {cls.teacherName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Radar điểm mạnh/yếu */}
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-heading text-base font-bold">
                Phân tích điểm mạnh / yếu theo môn
              </h2>
              {data.radar.length < 3 ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" aria-hidden="true" />
                  Cần điểm của ít nhất 3 môn để vẽ biểu đồ Radar
                  {data.radar.length > 0 &&
                    ` (hiện có: ${data.radar
                      .map((r) => `${r.subject} ${r.score}`)
                      .join(', ')})`}
                  .
                </p>
              ) : (
                <div className="mt-2 h-72">
                  <SubjectRadarChart data={data.radar} />
                </div>
              )}
            </div>

            {/* Pie chuyên cần */}
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-heading text-base font-bold">
                Tỷ lệ đi học ({stats?.totalSessions ?? 0} buổi)
              </h2>
              {pieData.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" aria-hidden="true" />
                  Chưa có dữ liệu điểm danh.
                </p>
              ) : (
                <div className="mt-2 h-72">
                  <AttendancePieChart data={pieData} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB: Tài chính ===== */}
      {activeTab === 'finance' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Hóa đơn</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Tổng tiền</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Đã thu</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Hạn nộp</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Trạng thái</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center">
                      <Inbox
                        className="mx-auto h-7 w-7 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Học sinh chưa có hóa đơn nào.
                      </p>
                    </td>
                  </tr>
                ) : (
                  data.invoices.map((invoice) => {
                    const badge =
                      INVOICE_STATUS_BADGE[invoice.status] ?? INVOICE_STATUS_BADGE.pending
                    return (
                      <tr key={invoice.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-indigo-700">
                          {invoice.code}
                        </td>
                        <td className="px-5 py-3.5 font-medium">
                          {formatVnd(invoice.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-emerald-700">
                          {formatVnd(invoice.paidAmount)}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {formatDate(invoice.dueDate)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => printReceipt(invoice)}
                            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            In biên lai
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {debtChartData.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
                Biểu đồ công nợ theo hóa đơn
              </h2>
              <div className="mt-2 h-64">
                <DebtBarChart data={debtChartData} formatValue={formatVnd} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: Lịch sử tương tác ===== */}
      {activeTab === 'history' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Timeline */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
              Dòng thời gian
            </h2>
            {data.timeline.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Inbox className="h-4 w-4" aria-hidden="true" />
                Chưa có sự kiện nào.
              </p>
            ) : (
              <ol className="mt-4 space-y-0">
                {data.timeline.map((event, index) => (
                  <li key={`${event.date}-${index}`} className="relative flex gap-3 pb-5">
                    {index < data.timeline.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[13px] top-7 h-full w-px bg-border"
                      />
                    )}
                    <span
                      className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        event.type === 'warning'
                          ? 'bg-rose-50 text-rose-500'
                          : event.type === 'invoice'
                            ? 'bg-amber-50 text-amber-600'
                            : event.type === 'class'
                              ? 'bg-indigo-50 text-primary'
                              : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {event.type === 'warning' ? (
                        <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : event.type === 'invoice' ? (
                        <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : event.type === 'class' ? (
                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{event.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(event.date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* AI Chat history */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
              Lịch sử hỏi Trợ lý AI
            </h2>

            {data.aiTopTopics.length > 0 && (
              <div className="mt-3 rounded-xl bg-indigo-50 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  Hay hỏi nhất về
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.aiTopTopics.map((topic) => (
                    <span
                      key={topic.topic}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700"
                    >
                      {topic.topic}
                      <span className="rounded-full bg-indigo-100 px-1.5 tabular-nums">
                        {topic.count}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-indigo-700/80">
                  Gợi ý cho cố vấn học tập: học sinh có thể đang gặp khó ở các chủ đề trên.
                </p>
              </div>
            )}

            {data.aiChats.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Inbox className="h-4 w-4" aria-hidden="true" />
                Học sinh chưa hỏi Trợ lý AI lần nào (hoặc migration 021 chưa chạy).
              </p>
            ) : (
              <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                {data.aiChats.map((chat) => (
                  <li
                    key={chat.id}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <p className="text-sm text-foreground">“{chat.question}”</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {chat.className} · {formatDate(chat.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
