'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  SearchX,
  User,
} from 'lucide-react'
import { getOrgTimetable, type TimetableSession } from './actions'

// ============================================================
// THỜI KHÓA BIỂU TUẦN TOÀN CƠ SỞ (Staff Portal)
// ============================================================

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

const STATUS_STYLE: Record<TimetableSession['status'], string> = {
  scheduled: 'border-indigo-200 bg-indigo-50/60',
  completed: 'border-emerald-200 bg-emerald-50/60',
  cancelled: 'border-slate-200 bg-slate-50 opacity-60',
}

/** Thứ 2 của tuần chứa `date` (theo giờ máy - đủ dùng cho điều hướng tuần) */
function getMonday(date: Date): Date {
  const monday = new Date(date)
  const day = monday.getDay()
  monday.setDate(monday.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday
}

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})
const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

export default function StaffTimetablePage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [sessions, setSessions] = useState<TimetableSession[]>([])
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadWeek = useCallback(async (start: Date) => {
    setLoading(true)
    const result = await getOrgTimetable(start.toISOString())
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setSessions(result.sessions)
    setOrgName(result.orgName)
  }, [])

  useEffect(() => {
    void loadWeek(weekStart)
  }, [weekStart, loadWeek])

  function shiftWeek(delta: number) {
    setWeekStart((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + delta * 7)
      return next
    })
  }

  // Gom session theo ngày trong tuần (0 = Thứ 2)
  const byDay = useMemo(() => {
    const days: TimetableSession[][] = Array.from({ length: 7 }, () => [])
    for (const session of sessions) {
      const start = new Date(session.startTime)
      const dayIndex = (start.getDay() + 6) % 7
      days[dayIndex].push(session)
    }
    return days
  }, [sessions])

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
            <CalendarDays className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            Thời khóa biểu
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {orgName ? `Toàn bộ lịch dạy của ${orgName} và các đơn vị trực thuộc.` : 'Lịch dạy toàn cơ sở theo tuần.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
            aria-label="Tuần trước"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-40 text-center text-sm font-semibold text-slate-700">
            {dateFmt.format(weekStart)} – {dateFmt.format(weekEnd)}
          </span>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
            aria-label="Tuần sau"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            Tuần này
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Đang tải thời khóa biểu…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium">Tuần này không có buổi học nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {DAY_LABELS.map((label, dayIndex) => {
            const dayDate = new Date(weekStart)
            dayDate.setDate(dayDate.getDate() + dayIndex)
            const daySessions = byDay[dayIndex]
            return (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  {label} · {dateFmt.format(dayDate)}
                </p>
                <div className="mt-2 space-y-2">
                  {daySessions.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-300">Trống</p>
                  ) : (
                    daySessions.map((session) => (
                      <div
                        key={session.id}
                        className={`rounded-xl border p-2.5 text-xs ${STATUS_STYLE[session.status]}`}
                      >
                        <p className="font-semibold text-slate-800">{session.className}</p>
                        <p className="mt-1 flex items-center gap-1 text-slate-600">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {timeFmt.format(new Date(session.startTime))} – {timeFmt.format(new Date(session.endTime))}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-slate-500">
                          <User className="h-3 w-3" aria-hidden="true" />
                          {session.teacherName}
                        </p>
                        {session.room && (
                          <p className="mt-0.5 flex items-center gap-1 text-slate-500">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {session.room}
                          </p>
                        )}
                        {session.status === 'cancelled' && (
                          <p className="mt-1 font-semibold text-rose-500">Đã hủy</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
