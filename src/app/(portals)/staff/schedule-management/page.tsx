'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  CalendarClock,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Repeat2,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  assignSubstitute,
  cancelAndMakeup,
  getCoordSessions,
  getFreeTeachers,
  type CoordSession,
  type FreeTeacher,
} from './actions'

// ============================================================
// Điều phối Lịch học (/staff/schedule-management)
// Click buổi học -> "Báo nghỉ & Đổi lịch":
//   A) DẠY THAY: chỉ hiện GV RẢNH khung giờ đó
//   B) DẠY BÙ  : hủy buổi + xếp ngày/giờ/phòng mới (chống trùng lịch
//      bằng RPC check_schedule_conflict ở server)
// ============================================================

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

function getMondayISO(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
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

function timeRange(startISO: string, endISO: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(startISO)}–${fmt(endISO)}`
}

const STATUS_BADGE: Record<CoordSession['status'], { label: string; className: string }> = {
  scheduled: { label: 'Đã xếp', className: 'bg-indigo-50 text-indigo-700' },
  completed: { label: 'Đã dạy', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Đã hủy', className: 'bg-slate-100 text-slate-400 line-through' },
}

// ---------- Modal Báo nghỉ & Đổi lịch ----------
function RescheduleModal({
  session,
  onClose,
  onDone,
}: {
  session: CoordSession
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [mode, setMode] = useState<'substitute' | 'makeup'>('substitute')
  const [freeTeachers, setFreeTeachers] = useState<FreeTeacher[] | null>(null)
  const [substituteId, setSubstituteId] = useState('')
  const [makeupStart, setMakeupStart] = useState('')
  const [makeupEnd, setMakeupEnd] = useState('')
  const [makeupRoom, setMakeupRoom] = useState(session.room ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getFreeTeachers(session.id).then((result) => {
      setFreeTeachers(result.error !== undefined ? [] : result.teachers)
    })
  }, [session.id])

  const submit = async () => {
    setError(null)
    setSaving(true)
    const result =
      mode === 'substitute'
        ? await assignSubstitute(session.id, substituteId)
        : await cancelAndMakeup(session.id, makeupStart, makeupEnd, makeupRoom)
    setSaving(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone(
      mode === 'substitute'
        ? 'Đã gán giáo viên dạy thay — buổi học giữ nguyên.'
        : 'Đã hủy buổi gốc và xếp buổi DẠY BÙ mới.'
    )
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Báo nghỉ &amp; Đổi lịch</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {session.className} · {timeRange(session.startTime, session.endTime)}
              {session.room ? ` · ${session.room}` : ''} · GV {session.teacherName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* ===== Chọn phương án ===== */}
        <div className="mt-4 grid grid-cols-2 gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'substitute'}
            onClick={() => setMode('substitute')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
              mode === 'substitute'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
            GV dạy thay
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'makeup'}
            onClick={() => setMode('makeup')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
              mode === 'makeup'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Repeat2 className="h-4 w-4" aria-hidden="true" />
            Hủy &amp; xếp lịch bù
          </button>
        </div>

        {mode === 'substitute' ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium">
              Giáo viên RẢNH khung giờ này
              {freeTeachers === null ? (
                <div className="mt-2">
                  <FunLoader label="Đang lọc giáo viên rảnh…" variant="inline" />
                </div>
              ) : (
                <select
                  value={substituteId}
                  onChange={(e) => setSubstituteId(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Chọn giáo viên dạy thay —</option>
                  {freeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            {freeTeachers !== null && freeTeachers.length === 0 && (
              <p className="text-xs text-amber-700">
                Không có giáo viên nào rảnh khung giờ này — hãy dùng phương án xếp lịch bù.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Buổi học giữ nguyên giờ/phòng, chỉ đổi người dạy. Server kiểm tra trùng lịch lần
              cuối bằng check_schedule_conflict.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Bắt đầu (buổi bù)
                <input
                  type="datetime-local"
                  value={makeupStart}
                  onChange={(e) => setMakeupStart(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block text-sm font-medium">
                Kết thúc
                <input
                  type="datetime-local"
                  value={makeupEnd}
                  onChange={(e) => setMakeupEnd(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Phòng học
              <input
                type="text"
                value={makeupRoom}
                onChange={(e) => setMakeupRoom(e.target.value)}
                placeholder="VD: P.201"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Buổi gốc chuyển HỦY, buổi bù được đánh dấu DẠY BÙ và liên kết về buổi gốc. Hệ
              thống chặn trùng lịch giáo viên + phòng (check_schedule_conflict).
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || (mode === 'substitute' && !substituteId)}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Đang xử lý…' : mode === 'substitute' ? 'Gán GV dạy thay' : 'Hủy buổi & tạo buổi bù'}
        </button>
      </div>
    </div>
  )
}

// ---------- Trang chính ----------
export default function ScheduleManagementPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayISO(new Date()))
  const [sessions, setSessions] = useState<CoordSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CoordSession | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getCoordSessions(weekStart)
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setSessions(result.sessions)
    }
    setLoading(false)
  }, [weekStart])

  useEffect(() => {
    void load()
  }, [load])

  const byDay = useMemo(() => {
    const groups: CoordSession[][] = Array.from({ length: 7 }, () => [])
    for (const session of sessions) {
      const day = new Date(session.startTime).getDay()
      groups[day === 0 ? 6 : day - 1].push(session)
    }
    return groups
  }, [sessions])

  const shiftWeek = (delta: number) => {
    setWeekStart(getMondayISO(addDays(weekStart, delta * 7)))
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
            <CalendarClock className="h-6 w-6 text-primary" aria-hidden="true" />
            Điều phối Lịch học
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click buổi học để báo nghỉ: gán GV dạy thay (chỉ hiện GV rảnh) hoặc hủy &amp; xếp
            lịch bù — chống trùng lịch tự động.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Tuần trước"
            onClick={() => shiftWeek(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold">
            Tuần {addDays(weekStart, 0).toLocaleDateString('vi-VN')} –{' '}
            {addDays(weekStart, 6).toLocaleDateString('vi-VN')}
          </span>
          <button
            type="button"
            aria-label="Tuần sau"
            onClick={() => shiftWeek(1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {byDay.map((daySessions, index) => (
            <section
              key={DAY_LABELS[index]}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <h2 className="text-sm font-bold">
                {DAY_LABELS[index]}{' '}
                <span className="font-normal text-muted-foreground">
                  {addDays(weekStart, index).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              </h2>
              {daySessions.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Không có buổi học.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {daySessions.map((session) => {
                    const badge = STATUS_BADGE[session.status]
                    const clickable = session.status === 'scheduled'
                    return (
                      <li key={session.id}>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => setSelected(session)}
                          className={`w-full rounded-xl border border-border bg-background p-3 text-left transition-colors ${
                            clickable ? 'hover:border-indigo-300 hover:bg-indigo-50/50' : 'opacity-70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">
                              {session.className}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span>{timeRange(session.startTime, session.endTime)}</span>
                            {session.room && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {session.room}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            GV: {session.teacherName}
                            {session.substituteTeacherName && (
                              <span className="ml-1 font-semibold text-indigo-700">
                                → dạy thay: {session.substituteTeacherName}
                              </span>
                            )}
                          </p>
                          <div className="mt-1 flex gap-1.5">
                            {session.isMakeup && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                <Repeat2 className="h-3 w-3" aria-hidden="true" />
                                Dạy bù
                              </span>
                            )}
                            {clickable && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <CalendarX2 className="h-3 w-3" aria-hidden="true" />
                                Báo nghỉ &amp; Đổi lịch
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {selected && (
        <RescheduleModal
          session={selected}
          onClose={() => setSelected(null)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            void load()
          }}
        />
      )}
    </div>
  )
}
