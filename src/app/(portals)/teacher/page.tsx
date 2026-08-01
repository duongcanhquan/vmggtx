import Link from 'next/link'
import {
  AlertTriangle,
  BellRing,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Clock,
  DoorOpen,
  Inbox,
  Wallet,
} from 'lucide-react'
import { getTeacherHome, type TeacherSession } from './actions'

export const dynamic = 'force-dynamic'

// ============================================================
// TRANG CHỦ GIÁO VIÊN (/teacher) — tablet-first.
// Khối "Lịch dạy hôm nay" + cảnh báo ĐỎ buổi chưa điểm danh +
// 2 card thống kê (tiết đã dạy trong tháng, số lớp đang dạy).
// ============================================================

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
})

type SessionState = 'done' | 'missing' | 'ongoing' | 'upcoming' | 'cancelled'

function sessionState(session: TeacherSession, now: number): SessionState {
  if (session.status === 'cancelled') return 'cancelled'
  if (session.status === 'completed') return 'done'
  const start = new Date(session.startTime).getTime()
  const end = new Date(session.endTime).getTime()
  if (now > end) return 'missing'
  if (now >= start) return 'ongoing'
  return 'upcoming'
}

const STATE_BADGE: Record<SessionState, { label: string; className: string }> = {
  done: { label: 'Đã điểm danh', className: 'bg-emerald-50 text-emerald-700' },
  missing: { label: 'Chưa điểm danh', className: 'bg-rose-100 text-rose-700' },
  ongoing: { label: 'Đang diễn ra', className: 'bg-indigo-100 text-indigo-700' },
  upcoming: { label: 'Sắp tới', className: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Đã hủy', className: 'bg-slate-100 text-slate-400 line-through' },
}

function StatCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint: string
  accent: string
}) {
  return (
    <div className="bento-card p-5">
      <span className={`bento-icon ${accent}`}>
        {icon}
      </span>
      <p className="mt-3 font-heading text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export default async function TeacherHomePage() {
  const result = await getTeacherHome()

  if (result.error !== undefined) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {result.error}
      </p>
    )
  }

  const { todaySessions, pendingAttendance, stats, announcements } = result
  const now = Date.now()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Lịch dạy hôm nay
        </h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {dateFormat.format(new Date())}
        </p>
      </div>

      {/* ===== Thông báo chung từ cơ sở ===== */}
      {announcements.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-indigo-800">
            <BellRing className="h-4 w-4" aria-hidden="true" />
            Thông báo từ cơ sở
          </h2>
          <ul className="mt-2.5 space-y-2">
            {announcements.map((item) => (
              <li key={item.id} className="rounded-xl border border-indigo-100 bg-surface px-3.5 py-2.5">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== CẢNH BÁO ĐỎ: đã học xong nhưng CHƯA điểm danh ===== */}
      {pendingAttendance.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-rose-800">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {pendingAttendance.length} buổi đã học xong nhưng CHƯA điểm danh
          </h2>
          <ul className="mt-3 space-y-2">
            {pendingAttendance.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-surface px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {session.className}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dateFormat.format(new Date(session.startTime))} ·{' '}
                    {timeFormat.format(new Date(session.startTime))}–
                    {timeFormat.format(new Date(session.endTime))}
                  </p>
                </div>
                <Link
                  href={`/attendance/${session.classId}/${session.id}`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Điểm danh ngay
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== Thống kê ===== */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          label="Tiết đã dạy tháng này"
          value={stats.monthCompleted}
          hint="Đã chốt điểm danh."
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
          label="Lớp đang dạy"
          value={stats.activeClasses}
          hint="Trên mọi cơ sở."
          accent="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          icon={<CalendarCheck className="h-5 w-5" aria-hidden="true" />}
          label="Buổi dạy hôm nay"
          value={todaySessions.length}
          hint="Theo lịch hôm nay."
          accent="bg-amber-50 text-amber-700"
        />
      </div>

      {/* ===== Lịch dạy hôm nay ===== */}
      <div className="bento-card p-5">
        <h2 className="font-heading text-base font-bold">Các buổi dạy hôm nay</h2>

        {todaySessions.length === 0 ? (
          <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
            <Inbox className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Không có buổi dạy hôm nay. Xem{' '}
              <Link href="/teacher/schedule" className="font-semibold text-primary hover:underline">
                Lịch dạy
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {todaySessions.map((session) => {
              const state = sessionState(session, now)
              const badge = STATE_BADGE[state]
              return (
                <li
                  key={session.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                    state === 'missing'
                      ? 'border-rose-200 bg-rose-50/60'
                      : state === 'ongoing'
                        ? 'border-indigo-200 bg-indigo-50/60'
                        : 'border-border'
                  }`}
                >
                  <div className="flex min-w-24 items-center gap-1.5 font-heading text-sm font-bold text-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {timeFormat.format(new Date(session.startTime))}–
                    {timeFormat.format(new Date(session.endTime))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {session.className}
                    </p>
                    {session.room && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        Phòng {session.room}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {state === 'missing' && (
                    <Link
                      href={`/attendance/${session.classId}/${session.id}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Điểm danh ngay
                    </Link>
                  )}
                  {(state === 'ongoing' || state === 'upcoming') && (
                    <Link
                      href={`/attendance/${session.classId}/${session.id}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-3.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Điểm danh
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
