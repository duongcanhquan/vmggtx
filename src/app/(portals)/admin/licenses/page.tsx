'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Loader2,
  PackageOpen,
  Pencil,
  PlayCircle,
  Plus,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { MENU_SECTIONS, type MenuKey } from '@/lib/auth/menuRegistry'
import {
  CUSTOM_PLAN_KEY,
  LICENSE_PLANS,
  SELLABLE_MODULE_KEYS,
  planByKey,
  planLabel,
} from '@/lib/licensing/packages'
import {
  getLicenseAdminData,
  provisionCampus,
  saveLicense,
  setLicenseStatus,
  type CampusLicenseRow,
} from './actions'

// ============================================================
// GÓI DỊCH VỤ & LICENSE (chỉ Super Admin)
// - Danh sách cơ sở + gói + sĩ số + hạn dùng + trạng thái.
// - Sửa gói: preset (Cơ bản/Nâng cao/Toàn diện) hoặc tick từng module.
// - Wizard "Khởi tạo cơ sở trọn gói": cơ sở + gói + admin trong 1 phát.
// ============================================================

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

const SELLABLE_SECTIONS = MENU_SECTIONS.filter((section) =>
  SELLABLE_MODULE_KEYS.includes(section.key)
)

/** Chọn gói + tick module (dùng chung cho modal sửa và wizard) */
function PlanPicker({
  selected,
  setSelected,
  plan,
  setPlan,
}: {
  selected: Set<MenuKey>
  setSelected: (next: Set<MenuKey>) => void
  plan: string
  setPlan: (plan: string) => void
}) {
  function applyPlan(key: string) {
    setPlan(key)
    const preset = planByKey(key)
    if (preset) setSelected(new Set(preset.moduleKeys))
  }
  function toggleModule(key: MenuKey) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
    setPlan(CUSTOM_PLAN_KEY) // sửa tay -> thành gói tùy chỉnh
  }
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {LICENSE_PLANS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPlan(preset.key)}
            className={`cursor-pointer rounded-xl border p-3 text-left transition ${
              plan === preset.key
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                : 'border-slate-200 hover:border-indigo-300'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{preset.label}</p>
            <p className="mt-1 text-xs text-slate-500">{preset.description}</p>
            <p className="mt-1 text-xs font-medium text-indigo-600">
              {preset.moduleKeys.length} module
            </p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">
        Module đã bật ({selected.size}) - tick để tùy chỉnh:
      </p>
      <div className="mt-2 grid max-h-52 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
        {SELLABLE_SECTIONS.map((section) => (
          <label
            key={section.key}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-indigo-50"
          >
            <input
              type="checkbox"
              name="moduleKeys"
              value={section.key}
              checked={selected.has(section.key)}
              onChange={() => toggleModule(section.key)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            {section.label}
          </label>
        ))}
      </div>
      <input type="hidden" name="planName" value={plan} />
    </div>
  )
}

function LimitFields({ license }: { license?: CampusLicenseRow['license'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium text-slate-700">
        Giới hạn học viên (trống = không giới hạn)
        <input
          type="number"
          name="maxStudents"
          min={1}
          defaultValue={license?.maxStudents ?? ''}
          placeholder="VD: 500"
          className={inputClass}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Hạn dùng (trống = vĩnh viễn)
        <input
          type="date"
          name="validUntil"
          defaultValue={license?.validUntil ?? ''}
          className={inputClass}
        />
      </label>
    </div>
  )
}

export default function AdminLicensesPage() {
  const [campuses, setCampuses] = useState<CampusLicenseRow[]>([])
  const [parentOptions, setParentOptions] = useState<{ id: string; name: string; type: string }[]>([])
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [saving, setSaving] = useState(false)

  // Modal sửa gói
  const [editRow, setEditRow] = useState<CampusLicenseRow | null>(null)
  const [editSelected, setEditSelected] = useState<Set<MenuKey>>(new Set())
  const [editPlan, setEditPlan] = useState<string>(CUSTOM_PLAN_KEY)

  // Wizard khởi tạo cơ sở (3 bước)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [wizSelected, setWizSelected] = useState<Set<MenuKey>>(
    new Set(LICENSE_PLANS[1].moduleKeys)
  )
  const [wizPlan, setWizPlan] = useState<string>(LICENSE_PLANS[1].key)
  const [wizCampusName, setWizCampusName] = useState('')
  const [wizAdminName, setWizAdminName] = useState('')
  const [wizAdminEmail, setWizAdminEmail] = useState('')
  const [wizAdminPassword, setWizAdminPassword] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getLicenseAdminData()
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setCampuses(result.campuses)
    setParentOptions(result.parentOptions)
    setMigrationMissing(result.migrationMissing)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const today = useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
    []
  )

  function openEdit(row: CampusLicenseRow) {
    setEditRow(row)
    const keys = (row.license?.moduleKeys ?? LICENSE_PLANS[1].moduleKeys).filter(
      (key): key is MenuKey => SELLABLE_MODULE_KEYS.includes(key as MenuKey)
    )
    setEditSelected(new Set(keys))
    setEditPlan(row.license?.planName ?? LICENSE_PLANS[1].key)
  }

  async function handleSaveLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await saveLicense(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã lưu gói dịch vụ.' })
    setEditRow(null)
    void loadData()
  }

  async function handleToggleStatus(row: CampusLicenseRow) {
    if (!row.license) return
    const next = row.license.status === 'active' ? 'suspended' : 'active'
    setSaving(true)
    const result = await setLicenseStatus(row.id, next)
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: next === 'suspended' ? 'Đã tạm ngưng cơ sở.' : 'Đã kích hoạt lại cơ sở.',
    })
    void loadData()
  }

  function validateWizardStep(step: number): string | null {
    if (step === 0 && wizCampusName.trim().length < 2) {
      return 'Nhập tên cơ sở (tối thiểu 2 ký tự).'
    }
    if (step === 1 && wizSelected.size === 0) {
      return 'Chọn ít nhất 1 module cho gói dịch vụ.'
    }
    if (step === 2) {
      if (wizAdminName.trim().length < 2) return 'Nhập họ tên admin cơ sở.'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizAdminEmail.trim())) {
        return 'Email admin không hợp lệ.'
      }
      if (wizAdminPassword.length < 8) return 'Mật khẩu tối thiểu 8 ký tự.'
    }
    return null
  }

  function goWizardStep(next: number) {
    if (next > wizardStep) {
      for (let step = wizardStep; step < next; step++) {
        const error = validateWizardStep(step)
        if (error) {
          setToast({ type: 'error', message: error })
          setWizardStep(step)
          return
        }
      }
    }
    setWizardStep(next)
  }

  async function handleProvision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    for (let step = 0; step <= 2; step++) {
      const error = validateWizardStep(step)
      if (error) {
        setToast({ type: 'error', message: error })
        setWizardStep(step)
        return
      }
    }
    setSaving(true)
    const result = await provisionCampus(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã khởi tạo cơ sở + license + tài khoản admin.' })
    setWizardOpen(false)
    setWizardStep(0)
    setWizCampusName('')
    setWizAdminName('')
    setWizAdminEmail('')
    setWizAdminPassword('')
    void loadData()
  }

  function licenseBadge(row: CampusLicenseRow) {
    if (!row.license) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" /> Chưa gán gói
        </span>
      )
    }
    if (row.license.status === 'suspended') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Tạm ngưng
        </span>
      )
    }
    const expired = row.license.validUntil !== null && row.license.validUntil < today
    if (expired) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Hết hạn
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Đang hoạt động
      </span>
    )
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold text-slate-900">
          <PackageOpen className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Gói dịch vụ &amp; License
        </h1>
        <button
          type="button"
          onClick={() => {
            setWizardOpen(true)
            setWizardStep(0)
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Khởi tạo cơ sở mới
        </button>
      </div>

      {migrationMissing && !loading && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chưa chạy migration <strong>044</strong> — mọi cơ sở đang full quyền. Chạy SQL Editor để bật.
        </p>
      )}

      {loading ? (
        <FunLoader label="Đang tải danh sách cơ sở…" />
      ) : loadError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      ) : campuses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm text-slate-500">
            Chưa có cơ sở — bấm &quot;Khởi tạo cơ sở mới&quot; để bán gói đầu tiên.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Cơ sở</th>
                <th className="px-4 py-3">Gói</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Học viên</th>
                <th className="px-4 py-3">Hạn dùng</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {campuses.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-indigo-50/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{row.name}</p>
                    {row.parentName && (
                      <p className="text-xs text-slate-400">thuộc {row.parentName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.license ? planLabel(row.license.planName) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.license ? `${row.license.moduleKeys.length} module` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      {row.studentCount}
                      {row.license?.maxStudents ? ` / ${row.license.maxStudents}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.license?.validUntil ?? 'Vĩnh viễn'}
                  </td>
                  <td className="px-4 py-3">{licenseBadge(row)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        title="Sửa gói dịch vụ"
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {row.license && (
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(row)}
                          disabled={saving}
                          title={
                            row.license.status === 'active'
                              ? 'Tạm ngưng cơ sở (chặn đăng nhập)'
                              : 'Kích hoạt lại cơ sở'
                          }
                          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                            row.license.status === 'active'
                              ? 'text-slate-400 hover:bg-rose-100 hover:text-rose-700'
                              : 'text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700'
                          }`}
                        >
                          {row.license.status === 'active' ? (
                            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <PlayCircle className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Modal SỬA GÓI ===== */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSaveLicense}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-slate-900">
                Gói dịch vụ - {editRow.name}
              </h2>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="orgId" value={editRow.id} />
            <input type="hidden" name="status" value={editRow.license?.status ?? 'active'} />
            <div className="mt-4 space-y-4">
              <PlanPicker
                selected={editSelected}
                setSelected={setEditSelected}
                plan={editPlan}
                setPlan={setEditPlan}
              />
              <LimitFields license={editRow.license} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving || editSelected.size === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Lưu gói
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== WIZARD KHỞI TẠO CƠ SỞ (3 bước) ===== */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleProvision}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-slate-900">
                Khởi tạo cơ sở trọn gói
              </h2>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Chỉ báo bước */}
            <div className="mt-3 flex items-center gap-2">
              {['Cơ sở', 'Gói dịch vụ', 'Admin cơ sở'].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => goWizardStep(index)}
                  className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    wizardStep === index
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-indigo-50'
                  }`}
                >
                  {index + 1}. {label}
                </button>
              ))}
            </div>

            {/* Bước 1: thông tin cơ sở (giữ mounted để FormData thu đủ; không dùng HTML required
                trên field ẩn — validate thủ công để tránh submit câm) */}
            <div className={wizardStep === 0 ? 'mt-4 space-y-3' : 'hidden'}>
              <label className="block text-sm font-medium text-slate-700">
                Tên cơ sở mới
                <input
                  name="campusName"
                  value={wizCampusName}
                  onChange={(event) => setWizCampusName(event.target.value)}
                  placeholder="VD: Trung tâm GDTX Quận 1"
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Trực thuộc
                <select name="parentId" className={inputClass} defaultValue="">
                  <option value="">Gốc hệ thống</option>
                  {parentOptions.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Bước 2: gói + module + giới hạn */}
            <div className={wizardStep === 1 ? 'mt-4 space-y-4' : 'hidden'}>
              <PlanPicker
                selected={wizSelected}
                setSelected={setWizSelected}
                plan={wizPlan}
                setPlan={setWizPlan}
              />
              <LimitFields />
            </div>

            {/* Bước 3: tài khoản admin cơ sở */}
            <div className={wizardStep === 2 ? 'mt-4 space-y-3' : 'hidden'}>
              <label className="block text-sm font-medium text-slate-700">
                Họ tên admin cơ sở
                <input
                  name="adminFullName"
                  value={wizAdminName}
                  onChange={(event) => setWizAdminName(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email đăng nhập
                <input
                  name="adminEmail"
                  type="email"
                  value={wizAdminEmail}
                  onChange={(event) => setWizAdminEmail(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Mật khẩu khởi tạo (tối thiểu 8 ký tự)
                <input
                  name="adminPassword"
                  type="text"
                  value={wizAdminPassword}
                  onChange={(event) => setWizAdminPassword(event.target.value)}
                  className={inputClass}
                />
              </label>
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                Tài khoản <strong>Quản lý cơ sở</strong> — toàn quyền trong các module đã mua.
              </p>
            </div>

            <div className="mt-5 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
                disabled={wizardStep === 0}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Quay lại
              </button>
              {wizardStep < 2 ? (
                <button
                  type="button"
                  onClick={() => goWizardStep(Math.min(2, wizardStep + 1))}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Tiếp tục
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving || wizSelected.size === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Khởi tạo cơ sở
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
