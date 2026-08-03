'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarOff,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { ScheduleOpsTabs } from '@/components/academic/ScheduleOpsTabs'
import { ModuleAiInline } from '@/components/ai/ModuleAiInline'
import { findConflictIds } from '@/lib/schedule/conflicts'
import {
  localDateKey,
  matchSlotId,
  startOfWeekMonday,
  type ScheduleSlot,
} from '@/lib/schedule/slots'
import {
  cancelSession,
  commitAutoSchedule,
  createRecurringSchedule,
  createScheduleSession,
  deleteOrgHoliday,
  getScheduleClasses,
  getScheduleFacilities,
  getScheduleSlots,
  getScheduleTeachers,
  getUpcomingSessions,
  getWeekSessions,
  listOrgHolidays,
  listSchedulePlans,
  moveSession,
  previewAutoSchedule,
  saveSchedulePlan,
  saveScheduleSlots,
  upsertOrgHoliday,
  type OrgHolidayRow,
  type ScheduleClassOption,
  type ScheduleFacilityOption,
  type SchedulePlanRow,
  type ScheduleTeacherOption,
  type UpcomingSessionRow,
  type WeekSessionRow,
} from './actions'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
]

type MainTab = 'manual' | 'week' | 'holidays' | 'auto'

export default function AcademicSchedulePage() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const [mainTab, setMainTab] = useState<MainTab>('manual')
  const [toast, setToast] = useState<ToastData | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <CalendarRange className="h-7 w-7 text-primary" aria-hidden="true" />
            Xếp lịch / TKB
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ngày nghỉ · lưới kéo-thả · xếp tự động theo quy tắc. Gán chủ nhiệm xem{' '}
            <Link href="/teachers" className="font-medium text-primary hover:underline">
              Hồ sơ giảng viên
            </Link>
            .
          </p>
        </div>
        <ScheduleOpsTabs />
      </div>

      <ModuleAiInline moduleKey="training" />

      <div
        role="tablist"
        aria-label="Chế độ TKB"
        className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1"
      >
        {(
          [
            { id: 'manual', label: 'Xếp tay' },
            { id: 'week', label: 'Lưới tuần' },
            { id: 'holidays', label: 'Ngày nghỉ' },
            { id: 'auto', label: 'Tự động' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mainTab === t.id}
            onClick={() => setMainTab(t.id)}
            className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold ${
              mainTab === t.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'manual' && (
        <ManualTab
          orgId={currentOrgId}
          onToast={setToast}
        />
      )}
      {mainTab === 'week' && (
        <WeekTab orgId={currentOrgId} onToast={setToast} />
      )}
      {mainTab === 'holidays' && (
        <HolidaysTab orgId={currentOrgId} onToast={setToast} />
      )}
      {mainTab === 'auto' && (
        <AutoTab orgId={currentOrgId} onToast={setToast} />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function ManualTab({
  orgId,
  onToast,
}: {
  orgId: string | null
  onToast: (t: ToastData) => void
}) {
  const [classes, setClasses] = useState<ScheduleClassOption[]>([])
  const [teachers, setTeachers] = useState<ScheduleTeacherOption[]>([])
  const [facilities, setFacilities] = useState<ScheduleFacilityOption[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'single' | 'weekly'>('weekly')
  const [classSearch, setClassSearch] = useState('')
  const [classId, setClassId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [facilityId, setFacilityId] = useState('')
  const [room, setRoom] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('18:00')
  const [endTime, setEndTime] = useState('20:00')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5])

  const load = useCallback(async () => {
    if (!orgId) {
      setClasses([])
      setTeachers([])
      setFacilities([])
      setUpcoming([])
      setLoading(false)
      setLoadError('Chưa chọn đơn vị trên thanh tổ chức.')
      return
    }
    setLoading(true)
    const [c, t, f, u] = await Promise.all([
      getScheduleClasses(orgId),
      getScheduleTeachers(orgId),
      getScheduleFacilities(orgId),
      getUpcomingSessions(orgId),
    ])
    setClasses(c.data)
    setTeachers(t.data)
    setFacilities(f.data)
    setUpcoming(u.data)
    setLoadError(c.error || t.error || f.error || u.error || null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!classId) return
    const cls = classes.find((c) => c.id === classId)
    if (cls?.teacher_id) setTeacherId(cls.teacher_id)
  }, [classId, classes])

  const filteredClasses = useMemo(() => {
    const kw = classSearch.trim().toLowerCase()
    if (!kw) return classes
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        c.org_name.toLowerCase().includes(kw) ||
        c.teacher_name.toLowerCase().includes(kw)
    )
  }, [classes, classSearch])

  function toggleDay(d: number) {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    )
  }

  async function onSubmitSingle(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const fd = new FormData()
    fd.set('classId', classId)
    fd.set('teacherId', teacherId)
    fd.set('room', room)
    if (facilityId) fd.set('facilityId', facilityId)
    fd.set('date', date)
    fd.set('startTime', startTime)
    fd.set('endTime', endTime)
    const result = await createScheduleSession(orgId, fd)
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã xếp 1 buổi học.' })
    void load()
  }

  async function onSubmitWeekly(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const result = await createRecurringSchedule(orgId, {
      classId,
      teacherId,
      room,
      facilityId: facilityId || null,
      startTime,
      endTime,
      fromDate,
      toDate,
      weekdays,
    })
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    const parts = [`Đã tạo ${result.created} buổi`]
    if ((result.skipped ?? 0) > 0) parts.push(`bỏ trùng ${result.skipped}`)
    if ((result.skippedHoliday ?? 0) > 0)
      parts.push(`bỏ nghỉ ${result.skippedHoliday}`)
    onToast({ type: 'success', message: parts.join('; ') + '.' })
    void load()
  }

  if (loading) return <FunLoader label="Đang tải lớp & giáo viên…" />

  return (
    <>
      {loadError && (
        <p
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {loadError}
        </p>
      )}

      <div
        role="group"
        aria-label="Chế độ xếp tay"
        className="inline-flex rounded-xl border border-border bg-surface p-1"
      >
        <button
          type="button"
          aria-pressed={mode === 'weekly'}
          onClick={() => setMode('weekly')}
          className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
            mode === 'weekly'
              ? 'bg-violet-600 text-white'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tuần lặp
        </button>
        <button
          type="button"
          aria-pressed={mode === 'single'}
          onClick={() => setMode('single')}
          className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
            mode === 'single'
              ? 'bg-violet-600 text-white'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Một buổi
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <form
          onSubmit={mode === 'single' ? onSubmitSingle : onSubmitWeekly}
          className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:col-span-3"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-search">
              Tìm lớp
            </label>
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="sch-search"
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                placeholder="Tên lớp, đơn vị, GV…"
                className={`${inputClass} pl-10`}
              />
            </div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-class">
              Lớp học *
            </label>
            <select
              id="sch-class"
              required
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={inputClass}
            >
              <option value="">— Chọn lớp —</option>
              {filteredClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.org_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-gv">
                Giáo viên dạy buổi
              </label>
              <select
                id="sch-gv"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className={inputClass}
              >
                <option value="">— Chưa gán —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-facility">
                Phòng học
              </label>
              <select
                id="sch-facility"
                value={facilityId}
                onChange={(e) => {
                  const id = e.target.value
                  setFacilityId(id)
                  const f = facilities.find((x) => x.id === id)
                  if (f) setRoom(f.code?.trim() || f.name)
                }}
                className={inputClass}
              >
                <option value="">— Chọn phòng đã khai báo —</option>
                {facilities.map((f) => {
                  const bits = [
                    f.code || f.name,
                    f.capacity != null ? `${f.capacity} chỗ` : null,
                    f.location || null,
                    f.orgName || null,
                  ].filter(Boolean)
                  return (
                    <option key={f.id} value={f.id}>
                      {bits.join(' · ')}
                    </option>
                  )
                })}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Quản lý danh mục tại{' '}
                <a href="/academic/rooms" className="font-semibold text-primary hover:underline">
                  Phòng học
                </a>
                .
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-room">
                Nhãn phòng trên TKB
              </label>
              <input
                id="sch-room"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className={inputClass}
                placeholder="Tự điền khi chọn phòng"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-start">
                Giờ bắt đầu *
              </label>
              <input
                id="sch-start"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-end">
                Giờ kết thúc *
              </label>
              <input
                id="sch-end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {mode === 'single' ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-date">
                Ngày học *
              </label>
              <input
                id="sch-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium">Thứ trong tuần *</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = weekdays.includes(d.value)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleDay(d.value)}
                        className={`min-h-10 min-w-11 cursor-pointer rounded-xl border px-3 text-sm font-semibold ${
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-from">
                    Từ ngày *
                  </label>
                  <input
                    id="sch-from"
                    type="date"
                    required
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="sch-to">
                    Đến ngày *
                  </label>
                  <input
                    id="sch-to"
                    type="date"
                    required
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tối đa 60 buổi / lần · bỏ qua trùng lịch và ngày nghỉ.
              </p>
            </>
          )}

          <button
            type="submit"
            disabled={busy || !classId}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
            )}
            {mode === 'single' ? 'Xếp buổi này' : 'Tạo lịch tuần lặp'}
          </button>
        </form>

        <section className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="font-heading text-base font-bold">Buổi sắp tới (14 ngày)</h2>
          <ul className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto">
            {upcoming.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Chưa có buổi sắp tới.
              </li>
            ) : (
              upcoming.map((s) => (
                <li key={s.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                  <p className="font-semibold">{s.class_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.start_time).toLocaleString('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {s.room ? ` · ${s.room}` : ''}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </>
  )
}

function WeekTab({
  orgId,
  onToast,
}: {
  orgId: string | null
  onToast: (t: ToastData) => void
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()))
  const [sessions, setSessions] = useState<WeekSessionRow[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) {
      setSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [w, s] = await Promise.all([
      getWeekSessions(orgId, weekStart.toISOString()),
      getScheduleSlots(orgId),
    ])
    if (w.error) onToast({ type: 'error', message: w.error })
    setSessions(w.data)
    setSlots(s.data)
    setLoading(false)
  }, [orgId, weekStart, onToast])

  useEffect(() => {
    void load()
  }, [load])

  const conflictIds = useMemo(() => findConflictIds(sessions), [sessions])

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    })
  }, [weekStart])

  async function onDropCell(date: Date, slot: ScheduleSlot) {
    if (!orgId || !draggingId) return
    setBusy(true)
    const result = await moveSession(orgId, {
      sessionId: draggingId,
      date: localDateKey(date),
      startTime: slot.start,
      endTime: slot.end,
    })
    setBusy(false)
    setDraggingId(null)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã chuyển buổi học.' })
    void load()
  }

  async function onCancel(id: string) {
    if (!orgId) return
    if (!window.confirm('Hủy buổi học này?')) return
    const result = await cancelSession(orgId, id)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã hủy buổi.' })
    void load()
  }

  if (!orgId) {
    return (
      <p className="text-sm text-muted-foreground">Chọn đơn vị trên thanh tổ chức.</p>
    )
  }

  if (loading) return <FunLoader label="Đang tải lịch tuần…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Tuần trước"
            onClick={() => {
              const d = new Date(weekStart)
              d.setDate(d.getDate() - 7)
              setWeekStart(d)
            }}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="font-heading text-sm font-bold">
            Tuần {localDateKey(weekStart)} →{' '}
            {localDateKey(days[6] ?? weekStart)}
          </p>
          <button
            type="button"
            aria-label="Tuần sau"
            onClick={() => {
              const d = new Date(weekStart)
              d.setDate(d.getDate() + 7)
              setWeekStart(d)
            }}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Kéo thẻ buổi sang ô khác · viền đỏ = xung đột GV/phòng
          {busy ? ' · Đang lưu…' : ''}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-background/60">
              <th className="sticky left-0 z-10 bg-background/90 px-2 py-2 font-semibold">
                Ca
              </th>
              {days.map((d) => (
                <th key={localDateKey(d)} className="px-2 py-2 font-semibold">
                  {WEEKDAYS.find((w) => w.value === d.getDay())?.label}{' '}
                  {d.getDate()}/{d.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-2 py-2 font-medium">
                  {slot.label}
                  <br />
                  <span className="text-muted-foreground">
                    {slot.start}–{slot.end}
                  </span>
                </td>
                {days.map((d) => {
                  const dateKey = localDateKey(d)
                  const cellSessions = sessions.filter((s) => {
                    const sameDay = localDateKey(new Date(s.start_time)) === dateKey
                    const slotMatch = matchSlotId(s.start_time, slots) === slot.id
                    return sameDay && (slotMatch || !matchSlotId(s.start_time, slots))
                  }).filter((s) => {
                    // Only show unmatched in first slot row to avoid dup
                    const mid = matchSlotId(s.start_time, slots)
                    if (mid) return mid === slot.id
                    return slot.id === slots[0]?.id
                  })
                  return (
                    <td
                      key={`${slot.id}-${dateKey}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => void onDropCell(d, slot)}
                      className="min-h-[72px] align-top px-1 py-1"
                    >
                      <div className="flex min-h-[68px] flex-col gap-1 rounded-lg border border-dashed border-border/60 bg-background/40 p-1">
                        {cellSessions.map((s) => {
                          const conflict = conflictIds.has(s.id)
                          return (
                            <div
                              key={s.id}
                              draggable
                              onDragStart={() => setDraggingId(s.id)}
                              onDragEnd={() => setDraggingId(null)}
                              className={`cursor-grab rounded-lg border px-1.5 py-1 active:cursor-grabbing ${
                                conflict
                                  ? 'border-destructive bg-rose-50 text-destructive'
                                  : 'border-border bg-indigo-50 text-foreground'
                              }`}
                            >
                              <p className="font-semibold leading-tight">{s.class_name}</p>
                              <p className="truncate text-[10px] opacity-80">
                                {s.teacher_name}
                                {s.room ? ` · ${s.room}` : ''}
                              </p>
                              <button
                                type="button"
                                onClick={() => void onCancel(s.id)}
                                className="mt-0.5 text-[10px] font-medium underline"
                              >
                                Hủy
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HolidaysTab({
  orgId,
  onToast,
}: {
  orgId: string | null
  onToast: (t: ToastData) => void
}) {
  const [rows, setRows] = useState<OrgHolidayRow[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'holiday' | 'break'>('holiday')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [h, s] = await Promise.all([
      listOrgHolidays(orgId),
      getScheduleSlots(orgId),
    ])
    if (h.error) onToast({ type: 'error', message: h.error })
    setRows(h.data)
    setSlots(s.data)
    setLoading(false)
  }, [orgId, onToast])

  useEffect(() => {
    void load()
  }, [load])

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const result = await upsertOrgHoliday(orgId, {
      holidayDate: date,
      name,
      holidayType: type,
    })
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã thêm ngày nghỉ.' })
    setName('')
    setDate('')
    void load()
  }

  async function remove(id: string) {
    if (!orgId) return
    const result = await deleteOrgHoliday(orgId, id)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã xóa ngày nghỉ.' })
    void load()
  }

  async function saveSlots() {
    if (!orgId) return
    setBusy(true)
    const result = await saveScheduleSlots(orgId, slots)
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã lưu khung giờ.' })
  }

  if (!orgId) {
    return (
      <p className="text-sm text-muted-foreground">Chọn đơn vị trên thanh tổ chức.</p>
    )
  }
  if (loading) return <FunLoader label="Đang tải ngày nghỉ…" />

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5 text-violet-700" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold">Ngày nghỉ</h2>
        </div>
        <form onSubmit={(e) => void addHoliday(e)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="h-date">
                Ngày
              </label>
              <input
                id="h-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="h-type">
                Loại
              </label>
              <select
                id="h-type"
                value={type}
                onChange={(e) => setType(e.target.value as 'holiday' | 'break')}
                className={inputClass}
              >
                <option value="holiday">Ngày lễ</option>
                <option value="break">Nghỉ đột xuất</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="h-name">
              Tên
            </label>
            <input
              id="h-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Quốc khánh 2/9"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Thêm ngày nghỉ
          </button>
        </form>

        <ul className="space-y-2">
          {rows.length === 0 ? (
            <li className="text-sm text-muted-foreground">Chưa có ngày nghỉ.</li>
          ) : (
            rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.holiday_date} · {r.holiday_type === 'holiday' ? 'Lễ' : 'Nghỉ'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Xóa ${r.name}`}
                  onClick={() => void remove(r.id)}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-destructive hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-heading text-base font-bold">Khung giờ (ca)</h2>
        <p className="text-xs text-muted-foreground">
          Dùng cho lưới tuần và xếp tự động. Form xếp tay vẫn chọn giờ tự do.
        </p>
        <ul className="space-y-2">
          {slots.map((s, idx) => (
            <li key={s.id} className="grid grid-cols-[1fr_auto_auto] gap-2">
              <input
                value={s.label}
                onChange={(e) => {
                  const next = [...slots]
                  next[idx] = { ...s, label: e.target.value }
                  setSlots(next)
                }}
                className={inputClass}
              />
              <input
                type="time"
                value={s.start}
                onChange={(e) => {
                  const next = [...slots]
                  next[idx] = { ...s, start: e.target.value }
                  setSlots(next)
                }}
                className={inputClass}
              />
              <input
                type="time"
                value={s.end}
                onChange={(e) => {
                  const next = [...slots]
                  next[idx] = { ...s, end: e.target.value }
                  setSlots(next)
                }}
                className={inputClass}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void saveSlots()}
          disabled={busy}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          Lưu khung giờ
        </button>
      </section>
    </div>
  )
}

function AutoTab({
  orgId,
  onToast,
}: {
  orgId: string | null
  onToast: (t: ToastData) => void
}) {
  const [classes, setClasses] = useState<ScheduleClassOption[]>([])
  const [plans, setPlans] = useState<SchedulePlanRow[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [classId, setClassId] = useState('')
  const [spw, setSpw] = useState(2)
  const [prefDays, setPrefDays] = useState<number[]>([1, 3, 5])
  const [prefSlots, setPrefSlots] = useState<string[]>([])
  const [room, setRoom] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [skipCount, setSkipCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [c, p, s] = await Promise.all([
      getScheduleClasses(orgId),
      listSchedulePlans(orgId),
      getScheduleSlots(orgId),
    ])
    if (p.error) onToast({ type: 'error', message: p.error })
    setClasses(c.data)
    setPlans(p.data)
    setSlots(s.data)
    setLoading(false)
  }, [orgId, onToast])

  useEffect(() => {
    void load()
  }, [load])

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !classId) return
    setBusy(true)
    const result = await saveSchedulePlan(orgId, {
      classId,
      sessionsPerWeek: spw,
      preferredWeekdays: prefDays,
      preferredSlotIds: prefSlots,
      defaultRoom: room,
    })
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({ type: 'success', message: 'Đã lưu kế hoạch lớp.' })
    void load()
  }

  async function runPreview() {
    if (!orgId) return
    setBusy(true)
    const result = await previewAutoSchedule(orgId, { fromDate, toDate })
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    setPreviewCount(result.placeable?.length ?? 0)
    setSkipCount(result.skipped?.length ?? 0)
    onToast({
      type: 'success',
      message: `Xem trước: sẽ tạo ${result.placeable?.length ?? 0} buổi; bỏ qua ${result.skipped?.length ?? 0}.`,
    })
  }

  async function runCommit() {
    if (!orgId) return
    if (!window.confirm('Áp dụng xếp lịch tự động theo xem trước?')) return
    setBusy(true)
    const result = await commitAutoSchedule(orgId, { fromDate, toDate })
    setBusy(false)
    if (result.error) {
      onToast({ type: 'error', message: result.error })
      return
    }
    onToast({
      type: 'success',
      message: `Đã tạo ${result.created ?? 0} buổi; bỏ ${result.skipped ?? 0}.`,
    })
    setPreviewCount(null)
  }

  if (!orgId) {
    return (
      <p className="text-sm text-muted-foreground">Chọn đơn vị trên thanh tổ chức.</p>
    )
  }
  if (loading) return <FunLoader label="Đang tải kế hoạch…" />

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={(e) => void savePlan(e)}
        className="space-y-4 rounded-2xl border border-border bg-surface p-5"
      >
        <h2 className="font-heading text-base font-bold">Kế hoạch theo lớp</h2>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="auto-class">
            Lớp
          </label>
          <select
            id="auto-class"
            required
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={inputClass}
          >
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="auto-spw">
            Số buổi / tuần
          </label>
          <input
            id="auto-spw"
            type="number"
            min={1}
            max={14}
            value={spw}
            onChange={(e) => setSpw(Number(e.target.value) || 1)}
            className={inputClass}
          />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Thứ ưu tiên</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = prefDays.includes(d.value)
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() =>
                    setPrefDays((prev) =>
                      on ? prev.filter((x) => x !== d.value) : [...prev, d.value]
                    )
                  }
                  className={`min-h-9 min-w-10 rounded-lg border px-2 text-xs font-semibold ${
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border'
                  }`}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Ca ưu tiên</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => {
              const on = prefSlots.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setPrefSlots((prev) =>
                      on ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                    )
                  }
                  className={`min-h-9 rounded-lg border px-2 text-xs font-semibold ${
                    on
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-border'
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="auto-room">
            Phòng mặc định
          </label>
          <input
            id="auto-room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className={inputClass}
            placeholder="P.301"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !classId}
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          Lưu kế hoạch
        </button>

        {plans.length > 0 && (
          <ul className="space-y-1 border-t border-border pt-3 text-sm">
            {plans.map((p) => (
              <li key={p.id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{p.class_name}</span>
                {' · '}
                {p.sessions_per_week} buổi/tuần
              </li>
            ))}
          </ul>
        )}
      </form>

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold">Chạy xếp tự động</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Greedy: đủ số buổi/tuần, tránh ngày nghỉ và trùng GV/phòng. Sau đó chỉnh trên
          lưới tuần.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="auto-from">
              Từ ngày
            </label>
            <input
              id="auto-from"
              type="date"
              required
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="auto-to">
              Đến ngày
            </label>
            <input
              id="auto-to"
              type="date"
              required
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !fromDate || !toDate}
            onClick={() => void runPreview()}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            Xem trước
          </button>
          <button
            type="button"
            disabled={busy || !fromDate || !toDate || previewCount === null}
            onClick={() => void runCommit()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Áp dụng
          </button>
        </div>
        {previewCount !== null && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Dự kiến tạo <strong>{previewCount}</strong> buổi · bỏ qua{' '}
            <strong>{skipCount ?? 0}</strong>.
          </p>
        )}
      </section>
    </div>
  )
}
