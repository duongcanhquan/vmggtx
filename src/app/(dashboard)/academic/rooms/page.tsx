'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DoorOpen,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { AdminOpsTabs } from '@/components/admin/AdminOpsTabs'
import {
  listRooms,
  softDeleteRoom,
  toggleRoomActive,
  upsertRoom,
  type FacilityAssetType,
  type RoomKind,
  type RoomRow,
} from './actions'

const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  classroom: 'Phòng học',
  lab: 'Phòng lab',
  meeting: 'Phòng họp',
  hall: 'Hội trường',
  other: 'Khác',
}

const TYPE_LABEL: Record<FacilityAssetType, string> = {
  room: 'Phòng',
  projector: 'Máy chiếu',
  lab_equipment: 'Thiết bị lab',
  vehicle: 'Xe công vụ',
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type FormState = {
  id?: string
  name: string
  code: string
  type: FacilityAssetType
  roomKind: RoomKind
  capacity: string
  location: string
  isActive: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  code: '',
  type: 'room',
  roomKind: 'classroom',
  capacity: '',
  location: '',
  isActive: true,
})

export default function RoomsPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [filterType, setFilterType] = useState<'all' | FacilityAssetType>('all')
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      setRows([])
      return
    }
    setLoading(true)
    const res = await listRooms(orgId)
    setRows(res.data)
    setLoadError(res.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filterType !== 'all' && r.type !== filterType) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        (r.code ?? '').toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q) ||
        r.orgName.toLowerCase().includes(q)
      )
    })
  }, [rows, filterType, query])

  function openCreate() {
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEdit(row: RoomRow) {
    setForm({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      type: row.type,
      roomKind: row.roomKind ?? 'classroom',
      capacity: row.capacity != null ? String(row.capacity) : '',
      location: row.location ?? '',
      isActive: row.isActive,
    })
    setFormOpen(true)
  }

  async function handleSave() {
    if (!orgId) return
    setSaving(true)
    const res = await upsertRoom({
      id: form.id,
      orgId,
      name: form.name,
      code: form.code,
      type: form.type,
      roomKind: form.type === 'room' ? form.roomKind : null,
      capacity: form.capacity.trim() ? Number(form.capacity) : null,
      location: form.location,
      isActive: form.isActive,
    })
    setSaving(false)
    if (res.error && !res.id) {
      setToast({ type: 'error', message: res.error })
      return
    }
    setToast({
      type: 'success',
      message: form.id ? 'Đã cập nhật phòng.' : 'Đã thêm phòng.',
    })
    if (res.error && res.id) {
      setToast({ type: 'success', message: res.error })
    }
    setFormOpen(false)
    void load()
  }

  async function handleToggle(row: RoomRow) {
    if (!orgId) return
    const res = await toggleRoomActive(orgId, row.id, !row.isActive)
    if (res.error) setToast({ type: 'error', message: res.error })
    else void load()
  }

  async function handleDelete(row: RoomRow) {
    if (!orgId) return
    if (!window.confirm(`Xóa "${row.name}" khỏi danh mục phòng?`)) return
    const res = await softDeleteRoom(orgId, row.id)
    if (res.error) setToast({ type: 'error', message: res.error })
    else {
      setToast({ type: 'success', message: 'Đã xóa phòng.' })
      void load()
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
            <DoorOpen className="h-6 w-6 text-primary" aria-hidden="true" />
            Danh mục phòng &amp; CSVC
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phòng học, thiết bị, xe — dùng cho đặt lịch CSVC và xếp TKB.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AdminOpsTabs />
          <button
            type="button"
            onClick={openCreate}
            disabled={!orgId}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm mục CSVC
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên / mã / vị trí…"
          className="min-h-10 min-w-[14rem] flex-1 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="all">Tất cả CSVC</option>
          <option value="room">Phòng</option>
          <option value="projector">Máy chiếu</option>
          <option value="lab_equipment">Thiết bị lab</option>
          <option value="vehicle">Xe công vụ</option>
        </select>
      </div>

      {loading ? (
        <FunLoader label="Đang tải phòng học…" />
      ) : !orgId ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chọn cơ sở trên thanh trên để xem / thêm phòng.
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <DoorOpen className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-heading text-base font-bold">Chưa có phòng nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thêm phòng (sức chứa, loại, vị trí) để xếp TKB nhanh hơn.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm phòng đầu tiên
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Phòng</th>
                <th className="px-4 py-3 font-semibold">Loại</th>
                <th className="px-4 py-3 font-semibold">Sức chứa</th>
                <th className="px-4 py-3 font-semibold">Vị trí</th>
                <th className="px-4 py-3 font-semibold">Cơ sở</th>
                <th className="px-4 py-3 font-semibold">TT</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{row.name}</p>
                    {row.code && (
                      <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.type === 'room'
                      ? ROOM_KIND_LABEL[row.roomKind ?? 'classroom']
                      : TYPE_LABEL[row.type]}
                  </td>
                  <td className="px-4 py-3">
                    {row.capacity != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {row.capacity}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.location || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.orgName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        row.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {row.isActive ? 'Đang dùng' : 'Ngưng'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Sửa"
                        onClick={() => openEdit(row)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-indigo-50 hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title={row.isActive ? 'Ngưng dùng' : 'Bật lại'}
                        onClick={() => void handleToggle(row)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-amber-50 hover:text-amber-700"
                      >
                        <Power className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="Xóa"
                        onClick={() => void handleDelete(row)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loadError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {loadError}
        </p>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={form.id ? 'Sửa phòng' : 'Thêm phòng'}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-heading text-lg font-bold">
                {form.id ? 'Sửa phòng / CSVC' : 'Thêm phòng / CSVC'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Tên *
                <input
                  className={`${inputClass} mt-1.5`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Phòng 301"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Mã phòng
                  <input
                    className={`${inputClass} mt-1.5`}
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="P.301"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Sức chứa
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} mt-1.5`}
                    value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                    placeholder="40"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Nhóm CSVC
                  <select
                    className={`${inputClass} mt-1.5`}
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        type: e.target.value as FacilityAssetType,
                      }))
                    }
                  >
                    <option value="room">Phòng</option>
                    <option value="projector">Máy chiếu</option>
                    <option value="lab_equipment">Thiết bị lab</option>
                    <option value="vehicle">Xe công vụ</option>
                  </select>
                </label>
                {form.type === 'room' && (
                  <label className="block text-sm font-medium">
                    Loại phòng
                    <select
                      className={`${inputClass} mt-1.5`}
                      value={form.roomKind}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          roomKind: e.target.value as RoomKind,
                        }))
                      }
                    >
                      {(Object.keys(ROOM_KIND_LABEL) as RoomKind[]).map((k) => (
                        <option key={k} value={k}>
                          {ROOM_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="block text-sm font-medium">
                Vị trí (tầng / dãy)
                <input
                  className={`${inputClass} mt-1.5`}
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Tầng 3 · dãy A"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Đang dùng (hiện trong xếp lịch)
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={saving || form.name.trim().length < 2}
                onClick={() => void handleSave()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {saving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
