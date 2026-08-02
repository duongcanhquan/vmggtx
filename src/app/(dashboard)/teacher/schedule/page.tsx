'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  MapPin,
  Save,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  submitAttendance,
  type AttendanceStatus,
} from '@/app/(dashboard)/attendance/actions'
import {
  getMyWeekSessions,
  getSessionStudents,
  type SessionStudent,
  type TeachingSession,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Lịch dạy Giáo viên (/teacher/schedule) - Weekly View
// Gom TOÀN BỘ buổi dạy của giáo viên trên MỌI chi nhánh (không lọc
// org_id). Mỗi buổi có nút "Điểm danh" mở popup nối vào Server Action
// submitAttendance đã có.
// ============================================================

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

const ORG_BADGE_PALETTE = [
  'bg-indigo-50 text-indigo-700',
  'bg-violet-50 text-violet-700',
  'bg-sky-50 text-sky-700',
  'bg-emerald-50 text-emerald-700',
  'bg-amber-50 text-amber-700',
]

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present', label: 'Có mặt' },
  { value: 'excused', label: 'Vắng phép' },
  { value: 'absent', label: 'Vắng KP' },
]

function orgBadgeClass(orgName: string) {
  let hash = 0
  for (let i = 0; i < orgName.length; i++) {
    hash = (hash * 31 + orgName.charCodeAt(i)) | 0
  }
  return ORG_BADGE_PALETTE[Math.abs(hash) % ORG_BADGE_PALETTE.length]
}

/** Thứ 2 của tuần chứa `date` (theo giờ địa phương), dạng YYYY-MM-DD. */
function getMondayISO(date: Date): string {
  const d = new Date(date)
  const day = d.getDay() // 0 = CN
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(iso: string, days: number): Date {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

type AttendanceTarget = {
  session: TeachingSession
  students: SessionStudent[]
  records: Record<string, AttendanceStatus>
}

export default function TeacherSchedulePage() {
  const [weekStart, setWeekStart] = useState(() => getMondayISO(new Date()))
  const [sessions, setSessions] = useState<TeachingSession[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  const [target, setTarget] = useState<AttendanceTarget | null>(null)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadWeek = useCallback(async () => {
    setLoading(true)
    const result = await getMyWeekSessions(weekStart)
    setSessions(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [weekStart])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  // Gom buổi học theo từng ngày trong tuần (index 0 = Thứ 2)
  const sessionsByDay = useMemo(() => {
    const byDay: TeachingSession[][] = Array.from({ length: 7 }, () => [])
    for (const session of sessions) {
      const d = new Date(session.start_time)
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      byDay[dayIndex].push(session)
    }
    return byDay
  }, [sessions])

  const weekLabel = useMemo(() => {
    const monday = addDays(weekStart, 0)
    const sunday = addDays(weekStart, 6)
    return `${formatShortDate(monday)} – ${formatShortDate(sunday)}/${sunday.getFullYear()}`
  }, [weekStart])

  async function openAttendance(session: TeachingSession) {
    setLoadingStudents(true)
    setTarget({ session, students: [], records: {} })

    const result = await getSessionStudents(session.id)
    if (result.loadError) {
      setToast({ type: 'error', message: result.loadError })
    }
    const records: Record<string, AttendanceStatus> = {}
    for (const student of result.data) {
      records[student.id] = student.status ?? 'present'
    }
    setTarget({ session, students: result.data, records })
    setLoadingStudents(false)
  }

  async function handleSaveAttendance() {
    if (!target) return
    setSaving(true)

    const result = await submitAttendance(
      target.session.id,
      Object.entries(target.records).map(([studentId, status]) => ({
        studentId,
        status,
      }))
    )
    setSaving(false)

    if ('error' in result && result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    const absentCount = 'absentCount' in result ? result.absentCount : 0
    setToast({
      type: 'success',
      message:
        absentCount > 0
          ? `Đã lưu điểm danh. ${absentCount} học viên vắng không phép (đã gửi thông báo).`
          : 'Đã lưu điểm danh. Cả lớp đầy đủ.',
    })
    setTarget(null)
  }

  return (
    <div className="space-y-6">
      {/* ===== Header + điều hướng tuần ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Lịch dạy của tôi
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Tuần trước"
            onClick={() => setWeekStart(getMondayISO(addDays(weekStart, -7)))}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(getMondayISO(new Date()))}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Tuần {weekLabel}
          </button>
          <button
            type="button"
            aria-label="Tuần sau"
            onClick={() => setWeekStart(getMondayISO(addDays(weekStart, 7)))}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị lịch demo (chưa đăng nhập).
        </p>
      )}

      {/* ===== Lưới tuần: 7 cột desktop, xếp dọc mobile ===== */}
      {loading ? (
        <FunLoader label="Đang tải lịch dạy…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {DAY_LABELS.map((label, dayIndex) => {
            const dayDate = addDays(weekStart, dayIndex)
            const daySessions = sessionsByDay[dayIndex]
            const isToday =
              new Date().toDateString() === dayDate.toDateString()

            return (
              <section
                key={label}
                aria-label={`${label} ${formatShortDate(dayDate)}`}
                className={`flex min-h-32 flex-col rounded-2xl border p-3 ${
                  isToday
                    ? 'border-indigo-300 bg-indigo-50/40'
                    : 'border-border bg-surface'
                }`}
              >
                <header className="mb-2 flex items-baseline justify-between">
                  <span
                    className={`text-xs font-bold uppercase tracking-wide ${
                      isToday ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatShortDate(dayDate)}
                  </span>
                </header>

                <div className="flex flex-1 flex-col gap-2">
                  {daySessions.length === 0 ? (
                    <p className="my-auto text-center text-xs text-muted-foreground/60">
                      Trống
                    </p>
                  ) : (
                    daySessions.map((session) => (
                      <article
                        key={session.id}
                        className="rounded-xl border border-border bg-background p-2.5 shadow-sm"
                      >
                        <p className="text-xs font-semibold text-foreground">
                          {formatTime(session.start_time)} – {formatTime(session.end_time)}
                        </p>
                        <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                          {session.class_name}
                        </p>
                        <span
                          className={`mt-1.5 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${orgBadgeClass(session.org_name)}`}
                        >
                          {session.org_name}
                        </span>
                        {session.room && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {session.room}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => openAttendance(session)}
                          className="mt-2 inline-flex w-full min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Điểm danh
                        </button>
                        <Link
                          href={`/teacher/grades/${session.class_id}`}
                          className="mt-1.5 inline-flex w-full min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-xs font-semibold text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <BookOpenCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Sổ điểm
                        </Link>
                      </article>
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* ===== Popup Điểm danh ===== */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attendance-title"
        >
          <button
            type="button"
            aria-label="Đóng popup"
            onClick={() => setTarget(null)}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="attendance-title" className="font-heading text-xl font-bold">
                  Điểm danh: {target.session.class_name}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTime(target.session.start_time)} –{' '}
                  {formatTime(target.session.end_time)} · {target.session.org_name}
                  {target.session.room ? ` · ${target.session.room}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng popup"
                onClick={() => setTarget(null)}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {loadingStudents ? (
              <FunLoader label="Đang tải danh sách học viên…" />
            ) : target.students.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Lớp chưa có học viên đang ghi danh. Giáo vụ cần ghép lớp trước khi điểm danh.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {target.students.map((student) => (
                    <li
                      key={student.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {student.full_name}
                      </span>
                      <fieldset
                        className="flex gap-1"
                        aria-label={`Trạng thái của ${student.full_name}`}
                      >
                        {STATUS_OPTIONS.map((option) => {
                          const checked =
                            target.records[student.id] === option.value
                          return (
                            <label
                              key={option.value}
                              className={`inline-flex min-h-9 cursor-pointer items-center rounded-lg border px-2.5 text-xs font-semibold transition-colors duration-150 ${
                                checked
                                  ? option.value === 'present'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : option.value === 'excused'
                                      ? 'border-amber-300 bg-amber-50 text-amber-700'
                                      : 'border-rose-300 bg-rose-50 text-rose-700'
                                  : 'border-border bg-background text-muted-foreground hover:bg-indigo-50/60'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`status-${student.id}`}
                                value={option.value}
                                checked={checked}
                                onChange={() =>
                                  setTarget((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          records: {
                                            ...prev.records,
                                            [student.id]: option.value,
                                          },
                                        }
                                      : prev
                                  )
                                }
                                className="sr-only"
                              />
                              {option.label}
                            </label>
                          )
                        })}
                      </fieldset>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setTarget(null)}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={saving || target.students.length === 0}
                    onClick={handleSaveAttendance}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    {saving ? 'Đang lưu…' : 'Lưu điểm danh'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
