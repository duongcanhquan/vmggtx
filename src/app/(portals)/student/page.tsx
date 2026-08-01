import Link from 'next/link'
import {
  AlertTriangle,
  BellRing,
  Bot,
  CalendarDays,
  ChevronRight,
  Medal,
  PartyPopper,
  Wallet,
} from 'lucide-react'
import { getStudentHome, type StudentAlert } from './actions'
import { NextLessonCountdown } from './NextLessonCountdown'

export const dynamic = 'force-dynamic'

// ============================================================
// TRANG CHỦ HỌC SINH (/student) — mobile-first như app điện thoại.
// Thứ tự: Cảnh báo/Thông báo LÊN ĐẦU → Countdown bài học kế tiếp
// → lối tắt. FAB "Hỏi Gia sư AI" nổi trên Bottom Nav.
// ============================================================

const ALERT_ICON: Record<StudentAlert['kind'], typeof Wallet> = {
  tuition: Wallet,
  attendance: AlertTriangle,
  grade: Medal,
}

function AlertCard({ alert }: { alert: StudentAlert }) {
  const Icon = ALERT_ICON[alert.kind]
  return (
    <Link
      href={alert.href}
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        alert.severe ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          alert.severe ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-bold ${
            alert.severe ? 'text-rose-800' : 'text-amber-900'
          }`}
        >
          {alert.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {alert.description}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}

export default async function StudentHomePage() {
  const result = await getStudentHome()

  if (result.error !== undefined) {
    return (
      <div className="px-4 py-6">
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {result.error}
        </p>
      </div>
    )
  }

  const { studentName, nextLesson, alerts } = result

  return (
    <div className="space-y-5 px-4 py-5">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Chào {studentName}! 👋
      </h1>

      {/* ===== 1. CẢNH BÁO / THÔNG BÁO (luôn lên đầu) ===== */}
      {alerts.length > 0 ? (
        <section aria-label="Cảnh báo và thông báo" className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
            Cần chú ý ({alerts.length})
          </h2>
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </section>
      ) : (
        <section
          aria-label="Không có cảnh báo"
          className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3"
        >
          <PartyPopper className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-emerald-800">Không có cảnh báo nào.</p>
        </section>
      )}

      {/* ===== 2. BÀI HỌC KẾ TIẾP (countdown) ===== */}
      {nextLesson ? (
        <NextLessonCountdown lesson={nextLesson} />
      ) : (
        <section className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-surface p-8 text-center">
          <CalendarDays className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Chưa có buổi học sắp tới. Xem{' '}
            <Link href="/schedule" className="font-semibold text-primary hover:underline">
              Lịch học
            </Link>
            .
          </p>
        </section>
      )}

      {/* ===== 3. Lối tắt ===== */}
      <section aria-label="Lối tắt" className="grid grid-cols-2 gap-3">
        <Link
          href="/grades"
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Medal className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold">Sổ điểm</span>
        </Link>
        <Link
          href="/tuition"
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Wallet className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold">Học phí</span>
        </Link>
      </section>

      {/* ===== FAB: Hỏi Gia sư AI (nổi trên Bottom Nav) ===== */}
      <Link
        href="/assistant"
        aria-label="Hỏi Gia sư AI"
        style={{ right: 'max(1rem, calc(50vw - 240px + 1rem))' }}
        className="fixed bottom-24 z-40 flex min-h-14 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 font-heading text-sm font-bold text-white shadow-xl shadow-indigo-500/30 transition-transform duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
        Hỏi Gia sư AI
      </Link>
    </div>
  )
}
