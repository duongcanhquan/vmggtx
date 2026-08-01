'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  FlaskConical,
  Plus,
  Projector,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  bookFacility,
  cancelFacilityBooking,
  createFacility,
  getFacilityBoard,
  toggleFacility,
  type Facility,
  type FacilityBoard as FacilityBoardData,
  type FacilityType,
} from '@/app/(portals)/staff/facilities/actions'

// ============================================================
// LỊCH ĐẶT PHÒNG & THIẾT BỊ - dùng chung Staff/Teacher Portal.
// Calendar view theo tuần: mỗi ngày liệt kê các lượt đặt.
// "Đặt trước" -> server validate chống trùng giờ (RPC + constraint).
// Staff có thêm phần quản lý danh mục tài sản.
// ============================================================

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

const TYPE_META: Record<FacilityType, { label: string; icon: typeof DoorOpen; chip: string }> = {
  room: { label: 'Phòng', icon: DoorOpen, chip: 'bg-indigo-50 text-indigo-700' },
  projector: { label: 'Máy chiếu', icon: Projector, chip: 'bg-amber-50 text-amber-700' },
  lab_equipment: { label: 'Thiết bị lab', icon: FlaskConical, chip: 'bg-emerald-50 text-emerald-700' },
}

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

// ---------- Modal đặt trước ----------
function BookingModal({
  facilities,
  onClose,
  onDone,
}: {
  facilities: Facility[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const bookable = facilities.filter((f) => f.isActive)
  const [facilityId, setFacilityId] = useState(bookable[0]?.id ?? '')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    const result = await bookFacility(facilityId, start, end, purpose)
    setSaving(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone('Đã đặt thành công — lượt đặt hiển thị trên lịch tuần.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-bold">Đặt phòng / thiết bị</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Tài sản
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {bookable.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  [{TYPE_META[facility.type].label}] {facility.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Bắt đầu
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Kết thúc
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Mục đích sử dụng
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              maxLength={500}
              placeholder="VD: Dạy bù lớp Toán 12A / Họp phụ huynh…"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Hệ thống tự kiểm tra trùng giờ: nếu tài sản đã có người đặt trong khung giờ này,
            lượt đặt sẽ bị chặn.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !facilityId || !start || !end}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Đang kiểm tra trùng giờ…' : 'Đặt trước'}
        </button>
      </div>
    </div>
  )
}

// ---------- Bảng chính ----------
export function FacilityBoard() {
  const [weekStart, setWeekStart] = useState(() => getMondayISO(new Date()))
  const [board, setBoard] = useState<FacilityBoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<FacilityType | 'all'>('all')
  const [showBooking, setShowBooking] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Quản lý tài sản (staff)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<FacilityType>('room')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getFacilityBoard(weekStart)
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setBoard(result.board)
    }
    setLoading(false)
  }, [weekStart])

  useEffect(() => {
    void load()
  }, [load])

  const byDay = useMemo(() => {
    const groups: FacilityBoardData['bookings'][] = Array.from({ length: 7 }, () => [])
    for (const booking of board?.bookings ?? []) {
      if (typeFilter !== 'all' && booking.facilityType !== typeFilter) continue
      const day = new Date(booking.startTime).getDay()
      groups[day === 0 ? 6 : day - 1].push(booking)
    }
    return groups
  }, [board, typeFilter])

  const handleCancel = async (bookingId: string) => {
    const result = await cancelFacilityBooking(bookingId)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã hủy lượt đặt — khung giờ được giải phóng.' })
    void load()
  }

  const handleCreateFacility = async () => {
    setCreating(true)
    const result = await createFacility(newName, newType)
    setCreating(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã thêm tài sản mới.' })
    setNewName('')
    void load()
  }

  const handleToggleFacility = async (facilityId: string, isActive: boolean) => {
    const result = await toggleFacility(facilityId, isActive)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
            <Projector className="h-6 w-6 text-primary" aria-hidden="true" />
            Đặt phòng &amp; Thiết bị
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lịch tuần trạng thái phòng máy / thiết bị. Đặt trước — hệ thống chống trùng giờ tự động.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowBooking(true)}
          disabled={!board || board.facilities.filter((f) => f.isActive).length === 0}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Đặt trước
        </button>
      </div>

      {/* Điều hướng tuần + lọc loại */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Tuần trước"
            onClick={() => setWeekStart(getMondayISO(addDays(weekStart, -7)))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold">
            {addDays(weekStart, 0).toLocaleDateString('vi-VN')} –{' '}
            {addDays(weekStart, 6).toLocaleDateString('vi-VN')}
          </span>
          <button
            type="button"
            aria-label="Tuần sau"
            onClick={() => setWeekStart(getMondayISO(addDays(weekStart, 7)))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: 'all', label: 'Tất cả' },
              { value: 'room', label: 'Phòng' },
              { value: 'projector', label: 'Máy chiếu' },
              { value: 'lab_equipment', label: 'Thiết bị lab' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTypeFilter(option.value)}
              className={`min-h-9 rounded-xl px-3 text-xs font-semibold transition-colors ${
                typeFilter === option.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : board ? (
        <>
          {/* ===== Calendar view theo tuần ===== */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {byDay.map((dayBookings, index) => (
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
                {dayBookings.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">Trống — chưa ai đặt.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {dayBookings.map((booking) => {
                      const meta = TYPE_META[booking.facilityType]
                      const Icon = meta.icon
                      return (
                        <li
                          key={booking.id}
                          className="rounded-xl border border-border bg-background p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                              <Icon className="h-3 w-3" aria-hidden="true" />
                              {booking.facilityName}
                            </span>
                            {(booking.isMine || board.canManage) && (
                              <button
                                type="button"
                                title="Hủy lượt đặt"
                                onClick={() => void handleCancel(booking.id)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <p className="mt-1 text-xs font-semibold text-foreground">
                            {timeRange(booking.startTime, booking.endTime)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {booking.reservedByName}
                            {booking.isMine && ' (bạn)'}
                          </p>
                          {booking.purpose && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{booking.purpose}</p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* ===== Quản lý tài sản (staff) ===== */}
          {board.canManage && (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="font-heading text-base font-bold">
                Danh mục tài sản ({board.facilities.length})
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {board.facilities.map((facility) => {
                  const meta = TYPE_META[facility.type]
                  const Icon = meta.icon
                  return (
                    <button
                      key={facility.id}
                      type="button"
                      title={facility.isActive ? 'Bấm để tắt (ngừng cho đặt)' : 'Bấm để bật lại'}
                      onClick={() => void handleToggleFacility(facility.id, !facility.isActive)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                        facility.isActive
                          ? 'border-border bg-background text-foreground hover:border-indigo-300'
                          : 'border-dashed border-border bg-muted text-muted-foreground line-through'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {facility.name}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Tên tài sản mới (VD: Phòng Lab 2)"
                  className="min-h-10 min-w-56 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as FacilityType)}
                  className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="room">Phòng</option>
                  <option value="projector">Máy chiếu</option>
                  <option value="lab_equipment">Thiết bị lab</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleCreateFacility()}
                  disabled={creating || newName.trim().length < 2}
                  className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {creating ? 'Đang thêm…' : 'Thêm'}
                </button>
              </div>
            </section>
          )}
        </>
      ) : null}

      {showBooking && board && (
        <BookingModal
          facilities={board.facilities}
          onClose={() => setShowBooking(false)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            void load()
          }}
        />
      )}
    </div>
  )
}
