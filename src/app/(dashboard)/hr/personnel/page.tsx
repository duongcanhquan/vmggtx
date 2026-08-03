'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Cake,
  CalendarClock,
  FileText,
  IdCard,
  Loader2,
  Lock,
  LockOpen,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { OrgStaffTabs } from '@/components/campus-admin/OrgStaffTabs'
import { uploadFilesToR2 } from '@/components/lms/uploadFiles'
import {
  getHrReminders,
  getHrSensitiveLock,
  getStaffDocumentDownloadUrl,
  listStaffDocuments,
  listStaffProfiles,
  presignStaffDocumentUpload,
  registerStaffDocument,
  setHrSensitiveLock,
  softDeleteStaffDocument,
  updateStaffProfile,
  type HrReminderItem,
  type StaffDocumentRow,
  type StaffDocType,
  type StaffProfileRow,
} from './actions'

const ROLE_LABELS: Record<string, string> = {
  campus_admin: 'Quản lý cơ sở',
  academic_staff: 'Giáo vụ',
  admission_staff: 'Tuyển sinh',
  accountant: 'Kế toán',
  teacher: 'Giảng viên',
}

const DOC_LABELS: Record<StaffDocType, string> = {
  cccd_front: 'CCCD mặt trước',
  cccd_back: 'CCCD mặt sau',
  contract_scan: 'Bản scan hợp đồng',
  degree: 'Bằng cấp',
  certificate: 'Chứng chỉ',
  other: 'Khác',
}

function formatVnDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function HrPersonnelPage() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<StaffProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StaffProfileRow | null>(null)
  const [docs, setDocs] = useState<StaffDocumentRow[]>([])
  const [r2Ready, setR2Ready] = useState(false)
  const [reminders, setReminders] = useState<HrReminderItem[]>([])
  const [locked, setLocked] = useState(false)
  const [canToggleLock, setCanToggleLock] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState<StaffDocType>('cccd_front')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [dob, setDob] = useState('')
  const [cccd, setCccd] = useState('')
  const [gender, setGender] = useState('')

  const load = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [list, rem, lock] = await Promise.all([
      listStaffProfiles(currentOrgId),
      getHrReminders(currentOrgId),
      getHrSensitiveLock(currentOrgId),
    ])
    if (list.error) setToast({ type: 'error', message: list.error })
    setRows(list.data)
    setReminders(rem.items)
    setLocked(lock.locked)
    setCanToggleLock(lock.canToggle)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) {
      setDocs([])
      return
    }
    setFullName(selected.full_name)
    setEmail(selected.email ?? '')
    setPhone(selected.phone ?? '')
    setAddress(selected.address ?? '')
    setDob(selected.date_of_birth ?? '')
    setCccd(selected.cccd ?? '')
    setGender(selected.gender ?? '')
    void listStaffDocuments(selected.id).then((res) => {
      if (res.error) setToast({ type: 'error', message: res.error })
      setDocs(res.data)
      setR2Ready(res.r2Ready)
    })
  }, [selected])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.cccd ?? '').includes(q) ||
        (r.phone ?? '').includes(q)
    )
  }, [rows, search])

  async function saveProfile() {
    if (!selected) return
    setSaving(true)
    const result = await updateStaffProfile({
      profileId: selected.id,
      fullName,
      email,
      phone,
      address,
      dateOfBirth: dob,
      cccd,
      gender,
    })
    setSaving(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã lưu hồ sơ nhân sự.' })
    void load()
  }

  async function handleUpload(files: FileList | null) {
    if (!selected || !files?.length) return
    setUploading(true)
    const uploaded = await uploadFilesToR2([...files], async (file) =>
      presignStaffDocumentUpload({
        profileId: selected.id,
        docType,
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
      })
    )
    if ('error' in uploaded) {
      setUploading(false)
      setToast({ type: 'error', message: uploaded.error })
      return
    }
    for (const att of uploaded.attachments) {
      const reg = await registerStaffDocument({
        profileId: selected.id,
        docType,
        fileKey: att.key,
        fileName: att.name,
        fileSize: att.size,
        mimeType: att.type,
      })
      if (reg.error) {
        setUploading(false)
        setToast({ type: 'error', message: reg.error })
        return
      }
    }
    setUploading(false)
    setToast({ type: 'success', message: 'Đã tải lên giấy tờ.' })
    const refreshed = await listStaffDocuments(selected.id)
    setDocs(refreshed.data)
  }

  async function toggleLock() {
    if (!currentOrgId) return
    const result = await setHrSensitiveLock(currentOrgId, !locked)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setLocked(!locked)
    setToast({
      type: 'success',
      message: !locked
        ? 'Đã khóa quyền Nhân sự nhạy cảm — chỉ Quản lý cơ sở.'
        : 'Đã mở khóa — Trưởng phòng NS (có quyền) vào được.',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Hồ sơ & giấy tờ nhân sự
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Dữ liệu bảo mật: họ tên, CCCD, địa chỉ, ngày sinh, email + giấy tờ đính kèm. Giao
            Trưởng phòng nhân sự (chức danh/mẫu menu) hoặc Quản lý cơ sở; admin có thể khóa quyền.
          </p>
        </div>
        <OrgStaffTabs />
      </div>

      {canToggleLock && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-muted-foreground">
            {locked
              ? 'Đang khóa: chỉ Quản lý cơ sở xem/sửa hồ sơ nhạy cảm.'
              : 'Đang mở: người có quyền «Hồ sơ & giấy tờ NS» (VD Trưởng phòng NS) được vào.'}
          </p>
          <button
            type="button"
            onClick={() => void toggleLock()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-slate-50"
          >
            {locked ? (
              <LockOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4" aria-hidden="true" />
            )}
            {locked ? 'Mở khóa quyền NS' : 'Khóa quyền NS nhạy cảm'}
          </button>
        </div>
      )}

      {reminders.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-amber-900">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Nhắc việc tuần này / 14 ngày tới
          </h2>
          <ul className="mt-3 space-y-2">
            {reminders.slice(0, 12).map((item, idx) => (
              <li
                key={`${item.kind}-${item.personId}-${item.date}-${idx}`}
                className="flex flex-wrap items-center gap-2 text-sm text-amber-950"
              >
                {item.kind === 'birthday' ? (
                  <Cake className="h-4 w-4 text-amber-600" aria-hidden="true" />
                ) : (
                  <FileText className="h-4 w-4 text-amber-600" aria-hidden="true" />
                )}
                <span className="font-semibold">{item.personName}</span>
                <span className="text-amber-800/80">
                  {item.detail} · {formatVnDate(item.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <FunLoader label="Đang tải hồ sơ nhân sự…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, email, CCCD, SĐT…"
                className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Họ tên</th>
                    <th className="px-4 py-3 font-semibold">Vai trò</th>
                    <th className="px-4 py-3 font-semibold">CCCD</th>
                    <th className="px-4 py-3 font-semibold">Ngày sinh</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        <Users className="mx-auto mb-2 h-7 w-7 opacity-40" aria-hidden="true" />
                        Chưa có nhân sự hoặc không có quyền xem.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelected(row)}
                        className={`cursor-pointer border-b border-border last:border-0 hover:bg-indigo-50/60 ${
                          selected?.id === row.id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-medium">{row.full_name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {ROLE_LABELS[row.role] ?? row.role}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{row.cccd ?? '—'}</td>
                        <td className="px-4 py-3">{formatVnDate(row.date_of_birth)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.email ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            {!selected ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Chọn nhân sự để xem / cập nhật hồ sơ và giấy tờ.
              </p>
            ) : (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                  <IdCard className="h-4 w-4 text-primary" aria-hidden="true" />
                  {selected.full_name}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selected.org_name}
                  {selected.job_title_name ? ` · ${selected.job_title_name}` : ''}
                </p>

                <div className="grid gap-3">
                  <label className="text-sm font-medium">
                    Họ tên
                    <input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Email
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    SĐT
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    CCCD / CMND
                    <input
                      value={cccd}
                      onChange={(e) => setCccd(e.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Ngày sinh
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Giới tính
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm"
                    >
                      <option value="">—</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Địa chỉ
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                      className="mt-1.5 w-full rounded-xl border border-border px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void saveProfile()}
                  disabled={saving}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  Lưu hồ sơ
                </button>

                <div className="border-t border-border pt-4">
                  <h3 className="font-heading text-sm font-bold">Giấy tờ đính kèm</h3>
                  {!r2Ready && (
                    <p className="mt-1 text-xs text-amber-700">
                      Chưa cấu hình R2 — chỉ xem được metadata nếu đã có file.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as StaffDocType)}
                      className="min-h-10 rounded-xl border border-border px-3 text-sm"
                    >
                      {Object.entries(DOC_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary">
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="h-4 w-4" aria-hidden="true" />
                      )}
                      Tải lên
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf"
                        disabled={uploading || !r2Ready}
                        onChange={(e) => {
                          void handleUpload(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium">
                            {DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {doc.file_name}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                            onClick={async () => {
                              const res = await getStaffDocumentDownloadUrl(doc.id)
                              if ('error' in res) {
                                setToast({ type: 'error', message: res.error })
                                return
                              }
                              window.open(res.url, '_blank', 'noopener,noreferrer')
                            }}
                          >
                            Xem
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            aria-label="Xóa giấy tờ"
                            onClick={async () => {
                              if (!window.confirm('Xóa mềm giấy tờ này?')) return
                              const res = await softDeleteStaffDocument(doc.id)
                              if (res.error) {
                                setToast({ type: 'error', message: res.error })
                                return
                              }
                              setDocs((prev) => prev.filter((d) => d.id !== doc.id))
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    ))}
                    {docs.length === 0 && (
                      <li className="text-xs text-muted-foreground">Chưa có giấy tờ.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
