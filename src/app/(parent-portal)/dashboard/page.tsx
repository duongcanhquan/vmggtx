'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  CalendarDays,
  ChevronRight,
  LogOut,
  Medal,
  UserRound,
} from 'lucide-react'
import { OrgBrandMark } from '@/components/shared/OrgBrandMark'
import {
  getAttendanceSummary,
  getParentStudent,
  getRecentGrades,
  getWeekSessions,
  parentLogout,
  type AttendanceSummary,
  type ParentStudent,
  type RecentGrade,
  type WeekSession,
} from '../actions'
import { readLoginPortal } from '@/lib/auth/loginPortal'
import { FunLoader } from '@/components/shared/FunLoader'

// Lazy-load recharts: dashboard phụ huynh mở tức thì trên mobile
const AttendanceRadialChart = dynamic(
  () => import('@/components/charts/AttendanceRadialChart'),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-full bg-slate-100" />,
  }
)

// ============================================================
// Dashboard Phụ huynh (mobile-first, max 480px):
//  1. Tình hình chuyên cần  - Circular Progress (recharts)
//  2. Kết quả học tập gần nhất - 3 cột điểm mới nhất
//  3. Lịch học tuần này     - các buổi sắp tới
// ============================================================

function formatSessionTime(iso: string, endIso: string) {
  const start = new Date(iso)
  const end = new Date(endIso)
  const day = start.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const time = `${start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
  return { day, time }
}

function scoreColor(score: number) {
  if (score >= 8) return 'bg-emerald-50 text-emerald-700'
  if (score >= 5) return 'bg-sky-50 text-sky-700'
  return 'bg-rose-50 text-rose-700'
}

export default function ParentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<ParentStudent | null>(null)
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null)
  const [grades, setGrades] = useState<RecentGrade[]>([])
  const [sessions, setSessions] = useState<WeekSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const currentStudent = await getParentStudent()
      if (cancelled) return
      if (!currentStudent) {
        router.replace(readLoginPortal() ?? '/parent/login')
        return
      }
      setStudent(currentStudent)

      const [attendanceData, gradesData, sessionsData] = await Promise.all([
        getAttendanceSummary(),
        getRecentGrades(),
        getWeekSessions(),
      ])
      if (cancelled) return
      setAttendance(attendanceData)
      setGrades(gradesData)
      setSessions(sessionsData)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleLogout() {
    await parentLogout()
    // Quay về đúng cổng đã đăng nhập (/{slug}/login tab Gia đình)
    router.replace(readLoginPortal() ?? '/parent/login')
  }

  if (loading || !student || !attendance) {
    return (
      <FunLoader label="Đang tải sổ liên lạc…" />
    )
  }

  const chartData = [{ name: 'presence', value: attendance.presentRate }]
  const totalAbsent = attendance.excused + attendance.unexcused

  return (
    <div className="space-y-4 p-4">
      {/* ===== Header học sinh ===== */}
      <header className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          {student.logo_url ? (
            <OrgBrandMark
              logoUrl={student.logo_url}
              size="md"
              tone="glass"
              alt={student.org_name}
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div>
            <p className="text-xs text-indigo-100">Phụ huynh em</p>
            <p className="font-heading text-base font-bold">{student.full_name}</p>
            <p className="text-xs text-indigo-100">{student.org_name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Đăng xuất"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/15 transition-colors duration-150 hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* ===== Widget 1: Chuyên cần ===== */}
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Tình hình chuyên cần
        </h2>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative h-28 w-28 shrink-0">
            <AttendanceRadialChart data={chartData} presentRate={attendance.presentRate} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-2xl font-bold text-foreground">
                {attendance.presentRate}%
              </span>
              <span className="text-[10px] text-muted-foreground">có mặt</span>
            </div>
          </div>
          <dl className="flex-1 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tổng buổi học</dt>
              <dd className="font-semibold">{attendance.total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Có mặt</dt>
              <dd className="font-semibold text-emerald-600">{attendance.present}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Vắng phép</dt>
              <dd className="font-semibold text-amber-600">{attendance.excused}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Vắng không phép</dt>
              <dd className="font-semibold text-rose-600">{attendance.unexcused}</dd>
            </div>
            {totalAbsent === 0 && (
              <p className="text-xs text-emerald-600">Chuyên cần tuyệt vời!</p>
            )}
          </dl>
        </div>
      </section>

      {/* ===== Widget 2: Kết quả học tập gần nhất ===== */}
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Kết quả học tập gần nhất
          </h2>
          <Link
            href="/parent/grades"
            className="flex items-center gap-0.5 text-xs font-medium text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Xem tất cả
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {grades.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Chưa có điểm nào được nhập.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {grades.map((grade) => (
              <li
                key={grade.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {grade.assessment_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{grade.class_name}</p>
                </div>
                <span
                  className={`flex h-9 w-12 shrink-0 items-center justify-center rounded-lg font-heading text-base font-bold ${scoreColor(grade.score)}`}
                >
                  {grade.score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== Widget 3: Lịch học tuần này ===== */}
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Lịch học tuần này
          </h2>
          <Link
            href="/parent/schedule"
            className="flex items-center gap-0.5 text-xs font-medium text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Đầy đủ
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Tuần này không có buổi học nào sắp tới.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.slice(0, 4).map((session) => {
              const { day, time } = formatSessionTime(session.start_time, session.end_time)
              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-primary">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.class_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {day} · {time}
                      {session.room ? ` · ${session.room}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Nút nhanh tới sổ điểm */}
      <Link
        href="/parent/grades"
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-3.5 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Medal className="h-4 w-4" aria-hidden="true" />
        Xem sổ điểm đầy đủ của con
      </Link>
    </div>
  )
}
