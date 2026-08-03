'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Boxes,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  TrendingDown,
  Wrench,
  X,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { RowActions, SmartTable, sortableHeader } from '@/components/shared/SmartTable'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { AdminOpsTabs } from '@/components/admin/AdminOpsTabs'
import {
  changeAssetStatus,
  createAsset,
  deleteAsset,
  getAssetLogs,
  getAssetOrgs,
  getAssets,
  transferAsset,
  updateAsset,
  type AssetLogRow,
  type AssetRow,
  type AssetStatus,
} from './actions'

// ============================================================
// Quản lý Tài sản & Khấu hao (/assets)
// - Sổ tài sản của org đang chọn + toàn bộ chi nhánh con.
// - Khấu hao đường thẳng tính đến hôm nay (server tính).
// - Thao tác: thêm/sửa, đổi tình trạng, điều chuyển giữa đơn vị,
//   xem nhật ký, xóa mềm (campus_admin).
// ============================================================

const CURRENCY = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const CATEGORY_LABELS: Record<string, string> = {
  furniture: 'Bàn ghế / Nội thất',
  it_equipment: 'Thiết bị CNTT',
  teaching_device: 'Thiết bị dạy học',
  vehicle: 'Phương tiện',
  building: 'Nhà cửa / Cải tạo',
  software: 'Phần mềm / Bản quyền',
  other: 'Khác',
}

const CATEGORY_BADGES: Record<string, string> = {
  furniture: 'bg-amber-50 text-amber-700',
  it_equipment: 'bg-sky-50 text-sky-700',
  teaching_device: 'bg-indigo-50 text-indigo-700',
  vehicle: 'bg-violet-50 text-violet-700',
  building: 'bg-stone-100 text-stone-700',
  software: 'bg-fuchsia-50 text-fuchsia-700',
  other: 'bg-slate-100 text-slate-700',
}

const STATUS_META: Record<AssetStatus, { label: string; className: string }> = {
  in_use: { label: 'Đang sử dụng', className: 'bg-emerald-50 text-emerald-700' },
  in_storage: { label: 'Lưu kho', className: 'bg-slate-100 text-slate-700' },
  under_repair: { label: 'Đang sửa chữa', className: 'bg-amber-50 text-amber-700' },
  broken: { label: 'Hỏng', className: 'bg-rose-50 text-rose-700' },
  liquidated: { label: 'Đã thanh lý', className: 'bg-stone-200 text-stone-600' },
  lost: { label: 'Thất lạc', className: 'bg-rose-100 text-rose-800' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ---------- Modal Thêm/Sửa tài sản ----------
function AssetFormModal({
  editing,
  orgs,
  defaultOrgId,
  onClose,
  onSaved,
  onError,
}: {
  editing: AssetRow | null
  orgs: { id: string; name: string }[]
  defaultOrgId: string
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const formData = new FormData(event.currentTarget)
    if (editing) {
      formData.set('assetId', editing.id)
      formData.set('orgId', editing.org_id) // server xét quyền trên org hiện tại
    }
    const result = editing ? await updateAsset(formData) : await createAsset(formData)
    setSaving(false)
    if (result.error !== undefined) {
      onError(result.error)
      return
    }
    onSaved(editing ? 'Đã cập nhật tài sản.' : 'Đã nhập sổ tài sản mới.')
  }

  const inputClass =
    'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-form-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <div className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="asset-form-title" className="font-heading text-xl font-bold">
            {editing ? `Sửa tài sản: ${editing.name}` : 'Nhập sổ tài sản mới'}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="as-org" className="mb-1.5 block text-sm font-medium">
                Đơn vị sở hữu <span className="text-destructive">*</span>
              </label>
              {editing ? (
                <input
                  id="as-org"
                  type="text"
                  value={editing.org_name}
                  disabled
                  className={`${inputClass} cursor-not-allowed bg-indigo-50/60 text-muted-foreground`}
                />
              ) : (
                <select
                  id="as-org"
                  name="orgId"
                  required
                  defaultValue={defaultOrgId}
                  className={`${inputClass} cursor-pointer`}
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}
              {editing && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Đổi đơn vị bằng chức năng &quot;Điều chuyển&quot;.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="as-code" className="mb-1.5 block text-sm font-medium">
                Mã tài sản
              </label>
              <input
                id="as-code"
                name="code"
                type="text"
                maxLength={30}
                defaultValue={editing?.code ?? ''}
                placeholder="Để trống = tự sinh TS-YYYY-xxxx"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="as-name" className="mb-1.5 block text-sm font-medium">
              Tên tài sản <span className="text-destructive">*</span>
            </label>
            <input
              id="as-name"
              name="name"
              type="text"
              required
              defaultValue={editing?.name ?? ''}
              placeholder="VD: Máy chiếu Epson EB-X51"
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="as-category" className="mb-1.5 block text-sm font-medium">
                Nhóm tài sản <span className="text-destructive">*</span>
              </label>
              <select
                id="as-category"
                name="category"
                required
                defaultValue={editing?.category ?? 'teaching_device'}
                className={`${inputClass} cursor-pointer`}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="as-location" className="mb-1.5 block text-sm font-medium">
                Vị trí (phòng / lớp / kho)
              </label>
              <input
                id="as-location"
                name="location"
                type="text"
                maxLength={150}
                defaultValue={editing?.location ?? ''}
                placeholder="VD: Phòng P.201"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="as-serial" className="mb-1.5 block text-sm font-medium">
                Số serial
              </label>
              <input
                id="as-serial"
                name="serialNumber"
                type="text"
                maxLength={100}
                defaultValue={editing?.serial_number ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="as-vendor" className="mb-1.5 block text-sm font-medium">
                Nhà cung cấp
              </label>
              <input
                id="as-vendor"
                name="vendor"
                type="text"
                maxLength={150}
                defaultValue={editing?.vendor ?? ''}
                className={inputClass}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              Thông số khấu hao (đường thẳng)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="as-date" className="mb-1.5 block text-sm font-medium">
                  Ngày mua / đưa vào SD <span className="text-destructive">*</span>
                </label>
                <input
                  id="as-date"
                  name="purchaseDate"
                  type="date"
                  required
                  defaultValue={editing?.purchase_date ?? ''}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="as-price" className="mb-1.5 block text-sm font-medium">
                  Nguyên giá (VND) <span className="text-destructive">*</span>
                </label>
                <input
                  id="as-price"
                  name="purchasePrice"
                  type="number"
                  required
                  min={0}
                  step={1000}
                  defaultValue={editing?.purchase_price ?? ''}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="as-salvage" className="mb-1.5 block text-sm font-medium">
                  Giá trị thu hồi ước tính (VND)
                </label>
                <input
                  id="as-salvage"
                  name="salvageValue"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={editing?.salvage_value ?? 0}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="as-life" className="mb-1.5 block text-sm font-medium">
                  Thời gian khấu hao (tháng) <span className="text-destructive">*</span>
                </label>
                <input
                  id="as-life"
                  name="usefulLifeMonths"
                  type="number"
                  required
                  min={1}
                  max={600}
                  defaultValue={editing?.useful_life_months ?? 36}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="as-warranty" className="mb-1.5 block text-sm font-medium">
                Bảo hành đến
              </label>
              <input
                id="as-warranty"
                name="warrantyUntil"
                type="date"
                defaultValue={editing?.warranty_until ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="as-note" className="mb-1.5 block text-sm font-medium">
                Ghi chú
              </label>
              <input
                id="as-note"
                name="note"
                type="text"
                maxLength={500}
                defaultValue={editing?.note ?? ''}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Nhập sổ tài sản'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------- Modal Đổi tình trạng ----------
function StatusModal({
  asset,
  onClose,
  onSaved,
  onError,
}: {
  asset: AssetRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [status, setStatus] = useState<AssetStatus>(asset.status)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await changeAssetStatus(asset.id, status, note)
    setSaving(false)
    if (result.error !== undefined) {
      onError(result.error)
      return
    }
    onSaved(`Đã đổi tình trạng "${asset.name}" → ${STATUS_META[status].label}.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 cursor-pointer bg-black/50" />
      <div className="relative w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold">Đổi tình trạng tài sản</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-900">
          <span className="font-semibold">{asset.name}</span> ({asset.code}) — hiện:{' '}
          {STATUS_META[asset.status].label}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="st-status" className="mb-1.5 block text-sm font-medium">
              Tình trạng mới <span className="text-destructive">*</span>
            </label>
            <select
              id="st-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AssetStatus)}
              className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(STATUS_META) as AssetStatus[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </select>
            {status === 'liquidated' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-600">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Thanh lý yêu cầu quyền Quản lý cơ sở và không thể điều chuyển sau đó.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="st-note" className="mb-1.5 block text-sm font-medium">
              Lý do / ghi chú
            </label>
            <input
              id="st-note"
              type="text"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Hỏng nguồn, gửi bảo hành"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || status === asset.status}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu…' : 'Xác nhận'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------- Modal Điều chuyển ----------
function TransferModal({
  asset,
  orgs,
  onClose,
  onSaved,
  onError,
}: {
  asset: AssetRow
  orgs: { id: string; name: string }[]
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const targets = orgs.filter((org) => org.id !== asset.org_id)
  const [toOrgId, setToOrgId] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await transferAsset(asset.id, toOrgId, location, note)
    setSaving(false)
    if (result.error !== undefined) {
      onError(result.error)
      return
    }
    const toName = targets.find((org) => org.id === toOrgId)?.name ?? 'đơn vị mới'
    onSaved(`Đã điều chuyển "${asset.name}" sang ${toName}.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 cursor-pointer bg-black/50" />
      <div className="relative w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold">Điều chuyển tài sản</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-900">
          <span className="font-semibold">{asset.name}</span> ({asset.code}) — đang thuộc:{' '}
          <span className="font-semibold">{asset.org_name}</span>
          {asset.location ? ` · ${asset.location}` : ''}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="tf-org" className="mb-1.5 block text-sm font-medium">
              Đơn vị nhận <span className="text-destructive">*</span>
            </label>
            <select
              id="tf-org"
              required
              value={toOrgId}
              onChange={(e) => setToOrgId(e.target.value)}
              className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                — Chọn đơn vị trong phạm vi quản lý —
              </option>
              {targets.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tf-location" className="mb-1.5 block text-sm font-medium">
              Vị trí mới (phòng / lớp / kho)
            </label>
            <input
              id="tf-location"
              type="text"
              maxLength={150}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="VD: Phòng P.302"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="tf-note" className="mb-1.5 block text-sm font-medium">
              Lý do điều chuyển
            </label>
            <input
              id="tf-note"
              type="text"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !toOrgId}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang chuyển…' : 'Điều chuyển'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------- Modal Nhật ký ----------
const LOG_ACTION_LABELS: Record<string, string> = {
  created: 'Nhập sổ',
  updated: 'Cập nhật',
  status_change: 'Đổi tình trạng',
  transfer: 'Điều chuyển',
  maintenance: 'Bảo trì',
  deleted: 'Xóa sổ',
}

function LogsModal({ asset, onClose }: { asset: AssetRow; onClose: () => void }) {
  const [logs, setLogs] = useState<AssetLogRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getAssetLogs(asset.id).then((data) => {
      if (!cancelled) setLogs(data)
    })
    return () => {
      cancelled = true
    }
  }, [asset.id])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 cursor-pointer bg-black/50" />
      <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold">
            Nhật ký: {asset.name}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {logs === null ? (
          <FunLoader label="Đang tải nhật ký…" />
        ) : logs.length === 0 ? (
          <p className="rounded-xl bg-indigo-50 px-3.5 py-3 text-sm text-indigo-900">
            Chưa có nhật ký cho tài sản này.
          </p>
        ) : (
          <ol className="space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="rounded-xl border border-border bg-background p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-indigo-700">
                    {LOG_ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{log.detail}</p>
                {log.from_value && log.to_value && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {log.from_value} → <span className="font-semibold">{log.to_value}</span>
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Bởi: {log.actor_name}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ---------- Trang chính ----------
export default function AssetsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)

  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssetRow | null>(null)
  const [statusTarget, setStatusTarget] = useState<AssetRow | null>(null)
  const [transferTarget, setTransferTarget] = useState<AssetRow | null>(null)
  const [logsTarget, setLogsTarget] = useState<AssetRow | null>(null)

  const loadAssets = useCallback(async () => {
    setLoading(true)
    const result = await getAssets(currentOrgId)
    setAssets(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  useEffect(() => {
    if (!currentOrgId) return
    getAssetOrgs(currentOrgId).then(setOrgs)
  }, [currentOrgId])

  // ===== Tổng hợp sổ tài sản (bỏ tài sản đã thanh lý/thất lạc khỏi giá trị) =====
  const summary = useMemo(() => {
    const active = assets.filter((a) => a.status !== 'liquidated' && a.status !== 'lost')
    return {
      count: assets.length,
      activeCount: active.length,
      totalCost: active.reduce((sum, a) => sum + a.purchase_price, 0),
      totalAccumulated: active.reduce((sum, a) => sum + a.accumulated_depreciation, 0),
      totalBookValue: active.reduce((sum, a) => sum + a.book_value, 0),
      fullyDepreciated: active.filter((a) => a.fully_depreciated).length,
      needAttention: assets.filter(
        (a) => a.status === 'broken' || a.status === 'under_repair'
      ).length,
      warrantyExpiring: active.filter((a) => a.warranty_expiring && a.warranty_until).length,
    }
  }, [assets])

  const visibleAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          (!categoryFilter || a.category === categoryFilter) &&
          (!statusFilter || a.status === statusFilter)
      ),
    [assets, categoryFilter, statusFilter]
  )

  const handleDelete = useCallback(
    async (asset: AssetRow) => {
      const confirmed = window.confirm(
        `Xóa "${asset.name}" khỏi sổ tài sản? (xóa mềm - yêu cầu quyền Quản lý cơ sở)`
      )
      if (!confirmed) return
      const result = await deleteAsset(asset.id)
      if (result.error !== undefined) {
        setToast({ type: 'error', message: result.error })
        return
      }
      setToast({ type: 'success', message: `Đã xóa "${asset.name}" khỏi sổ.` })
      void loadAssets()
    },
    [loadAssets]
  )

  const columns = useMemo<ColumnDef<AssetRow>[]>(
    () => [
      {
        accessorKey: 'code',
        meta: { label: 'Mã TS' },
        header: sortableHeader<AssetRow>('Mã TS'),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-indigo-700">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        meta: { label: 'Tài sản' },
        header: sortableHeader<AssetRow>('Tài sản'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[row.original.category] ?? row.original.category}
              {row.original.serial_number ? ` · SN: ${row.original.serial_number}` : ''}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'org_name',
        meta: { label: 'Đơn vị' },
        header: sortableHeader<AssetRow>('Đơn vị'),
        cell: ({ row }) => (
          <div>
            <p className="text-sm text-foreground">{row.original.org_name}</p>
            {row.original.location && (
              <p className="text-xs text-muted-foreground">{row.original.location}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'purchase_price',
        meta: { label: 'Nguyên giá' },
        header: sortableHeader<AssetRow>('Nguyên giá'),
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-foreground">
              {CURRENCY.format(row.original.purchase_price)}
            </p>
            <p className="text-xs text-muted-foreground">
              Mua {formatDate(row.original.purchase_date)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'book_value',
        meta: { label: 'Khấu hao / Còn lại' },
        header: sortableHeader<AssetRow>('Khấu hao / Còn lại'),
        cell: ({ row }) => {
          const asset = row.original
          return (
            <div className="min-w-[150px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-emerald-700">
                  {CURRENCY.format(asset.book_value)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {asset.depreciation_percent}%
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={asset.depreciation_percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Đã khấu hao ${asset.depreciation_percent}%`}
              >
                <div
                  className={`h-full rounded-full ${
                    asset.fully_depreciated
                      ? 'bg-rose-400'
                      : asset.depreciation_percent >= 75
                        ? 'bg-amber-400'
                        : 'bg-indigo-400'
                  }`}
                  style={{ width: `${asset.depreciation_percent}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {asset.fully_depreciated
                  ? 'Đã khấu hao hết'
                  : `${asset.months_used}/${asset.useful_life_months} tháng · ${CURRENCY.format(asset.monthly_depreciation)}/th`}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        meta: { label: 'Tình trạng' },
        header: 'Tình trạng',
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status]
          return (
            <div className="space-y-1">
              <span
                className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${meta.className}`}
              >
                {meta.label}
              </span>
              {row.original.warranty_expiring && row.original.warranty_until && (
                <p className="text-[11px] font-medium text-amber-700">
                  BH đến {formatDate(row.original.warranty_until)}
                </p>
              )}
            </div>
          )
        },
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: 'Sửa thông tin',
                icon: Pencil,
                onClick: () => {
                  setEditing(row.original)
                  setFormOpen(true)
                },
              },
              {
                label: 'Đổi tình trạng',
                icon: Wrench,
                onClick: () => setStatusTarget(row.original),
              },
              {
                label: 'Điều chuyển đơn vị',
                icon: ArrowLeftRight,
                onClick: () => setTransferTarget(row.original),
              },
              {
                label: 'Nhật ký tài sản',
                icon: History,
                onClick: () => setLogsTarget(row.original),
              },
              {
                label: 'Xóa khỏi sổ (xóa mềm)',
                icon: Trash2,
                variant: 'destructive',
                onClick: () => void handleDelete(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [handleDelete]
  )

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Tài sản &amp; Khấu hao
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sổ tài sản của đơn vị đang chọn + toàn bộ chi nhánh con. Khấu hao đường thẳng
            tính đến hôm nay.
          </p>
          <div className="mt-2">
            <AdminOpsTabs />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nhập sổ tài sản
        </button>
      </div>

      {/* ===== Thẻ tổng hợp giá trị ===== */}
      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: `Tài sản đang theo dõi (${summary.activeCount}/${summary.count})`,
              value: CURRENCY.format(summary.totalCost),
              sub: 'Tổng nguyên giá',
              tone: 'text-foreground',
            },
            {
              label: 'Hao mòn lũy kế',
              value: CURRENCY.format(summary.totalAccumulated),
              sub: `${summary.fullyDepreciated} tài sản đã khấu hao hết`,
              tone: 'text-amber-700',
            },
            {
              label: 'Giá trị còn lại',
              value: CURRENCY.format(summary.totalBookValue),
              sub: 'Trên sổ đến hôm nay',
              tone: 'text-emerald-700',
            },
            {
              label: 'Cần chú ý',
              value: `${summary.needAttention} hỏng/sửa chữa`,
              sub: `${summary.warrantyExpiring} sắp hết bảo hành (30 ngày)`,
              tone: summary.needAttention > 0 ? 'text-rose-600' : 'text-foreground',
            },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <p className={`mt-1 font-heading text-lg font-bold ${card.tone}`}>{card.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập, database trống hoặc chưa chạy migration
          041_assets.sql).
        </p>
      )}

      {/* ===== Bộ lọc ===== */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="filter-category"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Nhóm tài sản
          </label>
          <select
            id="filter-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Tất cả nhóm</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label
            htmlFor="filter-status"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Tình trạng
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Tất cả tình trạng</option>
            {(Object.keys(STATUS_META) as AssetStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_META[value].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Bảng tài sản ===== */}
      {loading ? (
        <FunLoader label="Đang tải sổ tài sản…" />
      ) : visibleAssets.length === 0 && assets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Chưa có tài sản nào trong sổ. Bấm &quot;Nhập sổ tài sản&quot; để bắt đầu.
          </p>
        </div>
      ) : (
        <SmartTable
          columns={columns}
          data={visibleAssets}
          searchKey="name"
          searchPlaceholder="Tìm theo tên tài sản…"
          emptyMessage="Không có tài sản nào khớp bộ lọc."
          viewKey="assets_page_view"
        />
      )}

      {/* ===== Modals ===== */}
      {formOpen && currentOrgId && (
        <AssetFormModal
          editing={editing}
          orgs={orgs.length > 0 ? orgs : [{ id: currentOrgId, name: 'Đơn vị hiện tại' }]}
          defaultOrgId={currentOrgId}
          onClose={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setFormOpen(false)
            setEditing(null)
            void loadAssets()
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {statusTarget && (
        <StatusModal
          asset={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setStatusTarget(null)
            void loadAssets()
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {transferTarget && (
        <TransferModal
          asset={transferTarget}
          orgs={orgs}
          onClose={() => setTransferTarget(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setTransferTarget(null)
            void loadAssets()
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {logsTarget && <LogsModal asset={logsTarget} onClose={() => setLogsTarget(null)} />}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
