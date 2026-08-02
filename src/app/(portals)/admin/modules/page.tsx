'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Blocks,
  Building2,
  CalendarClock,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  PackageMinus,
  PackageOpen,
  PackagePlus,
  Pencil,
  PlayCircle,
  Plus,
  ShieldAlert,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  MODULE_CATALOG,
  MODULE_GROUPS,
  type ModuleFeature,
  type ModuleGroupKey,
} from '@/lib/licensing/moduleCatalog'
import { MENU_SECTIONS, type MenuKey } from '@/lib/auth/menuRegistry'
import {
  CUSTOM_PLAN_KEY,
  LICENSE_PLANS,
  SELLABLE_MODULE_KEYS,
  planByKey,
  planLabel,
} from '@/lib/licensing/packages'
import {
  getModuleCenterData,
  setLicenseModule,
  setModuleFlag,
  type ModuleCenterData,
  type ModuleFlagRow,
} from './actions'
import {
  getLicenseAdminData,
  provisionCampus,
  saveLicense,
  setLicenseStatus,
  type CampusLicenseRow,
} from '../licenses/actions'

// ============================================================
// MODULE & GÓI DỊCH VỤ (chỉ Super Admin) — GỘP License + Module.
// Luồng: CHỌN ĐƠN VỊ trước (cột trái) -> bên phải hiện gói dịch vụ
// + toàn bộ module của Đơn vị đó để ghép/gỡ/bật/tắt.
// Mục "Toàn hệ thống" điều khiển công tắc chung cho mọi Đơn vị.
// ============================================================

type ModData = Exclude<ModuleCenterData, { error: string }>

const inputClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

const SELLABLE_SECTIONS = MENU_SECTIONS.filter((section) =>
  SELLABLE_MODULE_KEYS.includes(section.key)
)

function flagMatch(
  flag: ModuleFlagRow,
  orgId: string | null,
  moduleKey: string,
  featureKey: string | null
) {
  return (
    flag.orgId === orgId && flag.moduleKey === moduleKey && flag.featureKey === featureKey
  )
}

/** Công tắc bật/tắt dạng pill */
function Switch({
  on,
  busy,
  onToggle,
  label,
}: {
  on: boolean
  busy?: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${
        on ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-[22px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

/**
 * TAB NHÓM MODULE — chia catalog thành các tab (Học viên & Tuyển sinh,
 * Đào tạo & Khảo thí...) để theo dõi/xử lý từng mảng thay vì 1 danh sách dài.
 * Badge đỏ = số module trong nhóm đang TẮT ở ngữ cảnh hiện tại.
 */
function GroupTabs({
  active,
  onChange,
  offCountOf,
}: {
  active: ModuleGroupKey | 'all'
  onChange: (key: ModuleGroupKey | 'all') => void
  offCountOf: (moduleKeys: string[]) => number
}) {
  const tabs: { key: ModuleGroupKey | 'all'; label: string; moduleKeys: string[] }[] = [
    { key: 'all', label: 'Tất cả', moduleKeys: MODULE_CATALOG.map((m) => m.key) },
    ...MODULE_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      moduleKeys: MODULE_CATALOG.filter((m) => m.group === group.key).map((m) => m.key),
    })),
  ]
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Nhóm module">
      {tabs.map((tab) => {
        const isActive = active === tab.key
        const offCount = offCountOf(tab.moduleKeys)
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {tab.moduleKeys.length}
            </span>
            {offCount > 0 && (
              <span
                title={`${offCount} module đang tắt trong nhóm này`}
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  isActive ? 'bg-rose-400 text-white' : 'bg-rose-100 text-rose-600'
                }`}
              >
                {offCount} tắt
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * NHÓM TÍNH NĂNG CON của 1 module — mỗi tính năng 1 dòng riêng
 * (tên + mô tả + công tắc) thay vì dàn phẳng, để dễ theo dõi và xử lý.
 */
function FeatureGroup({
  features,
  isOff,
  busyOf,
  onToggle,
}: {
  features: ModuleFeature[]
  isOff: (featureKey: string) => boolean
  busyOf: (featureKey: string) => boolean
  onToggle: (featureKey: string) => void
}) {
  if (features.length === 0) return null
  return (
    <div className="mt-3 rounded-xl border border-dashed border-border bg-slate-50/60 px-3.5 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Nhóm tính năng con · {features.length}
      </p>
      <div className="mt-1 divide-y divide-slate-100">
        {features.map((feature) => {
          const off = isOff(feature.key)
          return (
            <div key={feature.key} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {feature.label}
                  {off && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-600">
                      Tắt
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Switch
                on={!off}
                busy={busyOf(feature.key)}
                onToggle={() => onToggle(feature.key)}
                label={`Bật/tắt tính năng ${feature.label}`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Chọn gói + tick module (dùng chung cho modal sửa gói và wizard) */
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
    setPlan(CUSTOM_PLAN_KEY)
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

export default function ModuleCenterPage() {
  const [modData, setModData] = useState<ModData | null>(null)
  const [campuses, setCampuses] = useState<CampusLicenseRow[]>([])
  const [parentOptions, setParentOptions] = useState<
    { id: string; name: string; type: string }[]
  >([])
  const [licMigrationMissing, setLicMigrationMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyFlag, setBusyFlag] = useState<string | null>(null)

  /** 'global' = công tắc toàn hệ thống; còn lại = id Đơn vị đang chọn */
  const [selectedOrg, setSelectedOrg] = useState<string>('global')
  /** Tab nhóm module đang xem ('all' = tất cả) */
  const [activeGroup, setActiveGroup] = useState<ModuleGroupKey | 'all'>('all')

  // Modal sửa gói
  const [editRow, setEditRow] = useState<CampusLicenseRow | null>(null)
  const [editSelected, setEditSelected] = useState<Set<MenuKey>>(new Set())
  const [editPlan, setEditPlan] = useState<string>(CUSTOM_PLAN_KEY)

  // Wizard khởi tạo Đơn vị (3 bước)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [createdPortal, setCreatedPortal] = useState<{
    portalPath: string
    campusName: string
    adminEmail: string
  } | null>(null)
  const [wizSelected, setWizSelected] = useState<Set<MenuKey>>(
    new Set(LICENSE_PLANS[1].moduleKeys)
  )
  const [wizPlan, setWizPlan] = useState<string>(LICENSE_PLANS[1].key)
  const [wizCampusName, setWizCampusName] = useState('')
  const [wizAdminName, setWizAdminName] = useState('')
  const [wizAdminEmail, setWizAdminEmail] = useState('')
  const [wizAdminPassword, setWizAdminPassword] = useState('')

  const load = useCallback(async () => {
    const [modResult, licResult] = await Promise.all([
      getModuleCenterData(),
      getLicenseAdminData(),
    ])
    setLoading(false)
    if (modResult.error !== undefined) {
      setLoadError(modResult.error)
      return
    }
    if (licResult.error !== undefined) {
      setLoadError(licResult.error)
      return
    }
    setLoadError(null)
    setModData(modResult)
    setCampuses(licResult.campuses)
    setParentOptions(licResult.parentOptions)
    setLicMigrationMissing(licResult.migrationMissing)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const today = useMemo(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
    []
  )

  const selectedCampus =
    selectedOrg === 'global' ? null : campuses.find((c) => c.id === selectedOrg) ?? null

  const isDisabled = useCallback(
    (orgId: string | null, moduleKey: string, featureKey: string | null) =>
      modData?.disabledFlags.some((f) => flagMatch(f, orgId, moduleKey, featureKey)) ??
      false,
    [modData]
  )

  /** Module có trong GÓI của Đơn vị đang chọn không (chưa có license = gói đầy đủ) */
  function inPackage(campus: CampusLicenseRow, moduleKey: string): boolean {
    if (!campus.license) return true
    return campus.license.moduleKeys.includes(moduleKey)
  }

  async function toggleFlag(
    orgId: string | null,
    moduleKey: string,
    featureKey: string | null
  ) {
    if (!modData) return
    const busyKey = `${orgId ?? 'global'}:${moduleKey}:${featureKey ?? ''}`
    const currentlyDisabled = isDisabled(orgId, moduleKey, featureKey)
    const nextEnabled = currentlyDisabled

    // Optimistic: công tắc phản hồi tức thì
    setBusyFlag(busyKey)
    setModData({
      ...modData,
      disabledFlags: nextEnabled
        ? modData.disabledFlags.filter((f) => !flagMatch(f, orgId, moduleKey, featureKey))
        : [...modData.disabledFlags, { orgId, moduleKey, featureKey }],
    })

    const result = await setModuleFlag({ orgId, moduleKey, featureKey, enabled: nextEnabled })
    setBusyFlag(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      void load()
      return
    }
    setToast({
      type: 'success',
      message: nextEnabled ? 'Đã bật lại.' : 'Đã tắt — menu và URL tương ứng sẽ bị chặn.',
    })
  }

  /** Ghép / gỡ module khỏi GÓI license của Đơn vị đang chọn */
  async function toggleLicenseModule(
    campus: CampusLicenseRow,
    moduleKey: string,
    granted: boolean
  ) {
    const busyKey = `lic:${campus.id}:${moduleKey}`
    setBusyFlag(busyKey)
    const result = await setLicenseModule({ orgId: campus.id, moduleKey, granted })
    setBusyFlag(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    const moduleLabel = MODULE_CATALOG.find((m) => m.key === moduleKey)?.label ?? moduleKey
    setToast({
      type: 'success',
      message: granted
        ? `Đã ghép "${moduleLabel}" vào gói — menu sẽ hiện ngay với Đơn vị.`
        : `Đã gỡ "${moduleLabel}" khỏi gói của Đơn vị.`,
    })
    void load()
  }

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
    void load()
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
      message: next === 'suspended' ? 'Đã tạm ngưng Đơn vị.' : 'Đã kích hoạt lại Đơn vị.',
    })
    void load()
  }

  function validateWizardStep(step: number): string | null {
    if (step === 0 && wizCampusName.trim().length < 2) {
      return 'Nhập tên Đơn vị (tối thiểu 2 ký tự).'
    }
    if (step === 1 && wizSelected.size === 0) {
      return 'Chọn ít nhất 1 module cho gói dịch vụ.'
    }
    if (step === 2) {
      if (wizAdminName.trim().length < 2) return 'Nhập họ tên Admin Đơn vị.'
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
    setWizardOpen(false)
    setWizardStep(0)
    setWizCampusName('')
    setWizAdminName('')
    setWizAdminEmail('')
    setWizAdminPassword('')
    setCreatedPortal({
      portalPath: result.portalPath,
      campusName: result.campusName,
      adminEmail: result.adminEmail,
    })
    setToast({ type: 'success', message: `Đã tạo Đơn vị. Cổng đăng nhập: ${result.portalPath}` })
    void load()
  }

  function licenseBadge(row: CampusLicenseRow) {
    if (!row.license) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" /> Gói đầy đủ
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
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Hoạt động
      </span>
    )
  }

  if (loading) return <FunLoader label="Đang tải Module & Gói dịch vụ…" />
  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
        {loadError}
      </div>
    )
  }
  if (!modData) return null

  const offGlobalCount = modData.disabledFlags.filter((f) => !f.orgId && !f.featureKey).length

  // Danh sách module theo tab nhóm đang chọn + mô tả nhóm
  const visibleModules = MODULE_CATALOG.filter(
    (mod) => activeGroup === 'all' || mod.group === activeGroup
  )
  const activeGroupInfo =
    activeGroup === 'all' ? null : MODULE_GROUPS.find((g) => g.key === activeGroup) ?? null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground">
            <Blocks className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            Module &amp; Gói dịch vụ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn một Đơn vị để xem gói dịch vụ và ghép/gỡ/bật/tắt module cho Đơn vị đó —
            hoặc chọn &quot;Toàn hệ thống&quot; để điều khiển chung.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setWizardOpen(true)
            setWizardStep(0)
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Khởi tạo Đơn vị mới
        </button>
      </div>

      {(modData.migrationMissing || licMigrationMissing) && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Chưa chạy migration{' '}
            {licMigrationMissing && (
              <span className="font-mono font-semibold">044_tenant_licenses.sql</span>
            )}
            {licMigrationMissing && modData.migrationMissing && ' và '}
            {modData.migrationMissing && (
              <span className="font-mono font-semibold">046_module_flags.sql</span>
            )}{' '}
            trên database — một số thao tác sẽ báo lỗi khi lưu. Hãy chạy trong Supabase SQL Editor.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px,1fr]">
        {/* ===== CỘT TRÁI: chọn Đơn vị ===== */}
        <div className="space-y-1.5 self-start rounded-2xl border border-border bg-surface p-3">
          <button
            type="button"
            onClick={() => setSelectedOrg('global')}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
              selectedOrg === 'global'
                ? 'border border-indigo-200 bg-indigo-50'
                : 'border border-transparent hover:bg-slate-50'
            }`}
          >
            <Globe className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Toàn hệ thống</p>
              <p className="text-xs text-muted-foreground">
                {offGlobalCount > 0
                  ? `${offGlobalCount} module đang tắt chung`
                  : 'Mọi module đang bật chung'}
              </p>
            </div>
            <ChevronRight
              className={`h-4 w-4 shrink-0 ${selectedOrg === 'global' ? 'text-indigo-500' : 'text-slate-300'}`}
              aria-hidden="true"
            />
          </button>

          <div className="my-2 border-t border-dashed border-border" aria-hidden="true" />
          <p className="px-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Đơn vị (Trường) — {campuses.length}
          </p>

          {campuses.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Chưa có Đơn vị nào — bấm &quot;Khởi tạo Đơn vị mới&quot;.
            </p>
          ) : (
            campuses.map((campus) => {
              const active = selectedOrg === campus.id
              return (
                <button
                  key={campus.id}
                  type="button"
                  onClick={() => setSelectedOrg(campus.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border border-indigo-200 bg-indigo-50'
                      : 'border border-transparent hover:bg-slate-50'
                  }`}
                >
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {campus.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {campus.license
                        ? `${planLabel(campus.license.planName)} · ${campus.license.moduleKeys.length} module`
                        : `Gói đầy đủ · ${MODULE_CATALOG.length} module`}
                    </p>
                  </div>
                  {campus.license?.status === 'suspended' && (
                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                      Ngưng
                    </span>
                  )}
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-500' : 'text-slate-300'}`}
                    aria-hidden="true"
                  />
                </button>
              )
            })
          )}
        </div>

        {/* ===== CỘT PHẢI ===== */}
        <div className="space-y-4">
          {selectedOrg === 'global' ? (
            /* ---- TOÀN HỆ THỐNG: công tắc chung từng module ---- */
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-foreground">
                <Globe className="h-5 w-5 text-indigo-500" aria-hidden="true" />
                Công tắc toàn hệ thống
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tắt = MỌI Đơn vị mất menu và bị chặn URL của module đó (Super Admin không bị
                ảnh hưởng).
              </p>
              <div className="mt-4">
                <GroupTabs
                  active={activeGroup}
                  onChange={setActiveGroup}
                  offCountOf={(keys) => keys.filter((key) => isDisabled(null, key, null)).length}
                />
                {activeGroupInfo && (
                  <p className="mt-2 text-xs text-muted-foreground">{activeGroupInfo.description}</p>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {visibleModules.map((mod) => {
                  const off = isDisabled(null, mod.key, null)
                  const usage = modData.usage[mod.key]
                  return (
                    <div key={mod.key} className="rounded-xl border border-border px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {mod.summary}
                            {usage
                              ? ` · ${usage.count.toLocaleString('vi-VN')} ${usage.label}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {off && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                              Đang tắt
                            </span>
                          )}
                          <Switch
                            on={!off}
                            busy={busyFlag === `global:${mod.key}:`}
                            onToggle={() => void toggleFlag(null, mod.key, null)}
                            label={`Bật/tắt ${mod.label} toàn hệ thống`}
                          />
                        </div>
                      </div>
                      {!off && (
                        <FeatureGroup
                          features={mod.features}
                          isOff={(featureKey) => isDisabled(null, mod.key, featureKey)}
                          busyOf={(featureKey) =>
                            busyFlag === `global:${mod.key}:${featureKey}`
                          }
                          onToggle={(featureKey) =>
                            void toggleFlag(null, mod.key, featureKey)
                          }
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : selectedCampus ? (
            <>
              {/* ---- THẺ GÓI DỊCH VỤ của Đơn vị ---- */}
              <div className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-lg font-bold text-foreground">
                      {selectedCampus.name}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {licenseBadge(selectedCampus)}
                      {selectedCampus.slug && (
                        <a
                          href={`/coso/${selectedCampus.slug}/login`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-violet-700 hover:underline"
                        >
                          /coso/{selectedCampus.slug}/login
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(selectedCampus)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Sửa gói &amp; hạn dùng
                    </button>
                    {selectedCampus.license && (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(selectedCampus)}
                        disabled={saving}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                          selectedCampus.license.status === 'active'
                            ? 'border-slate-200 text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {selectedCampus.license.status === 'active' ? (
                          <>
                            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                            Tạm ngưng
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4" aria-hidden="true" />
                            Kích hoạt lại
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    {
                      label: 'Gói dịch vụ',
                      value: selectedCampus.license
                        ? planLabel(selectedCampus.license.planName)
                        : 'Gói đầy đủ',
                    },
                    {
                      label: 'Module trong gói',
                      value: selectedCampus.license
                        ? `${selectedCampus.license.moduleKeys.length}/${MODULE_CATALOG.length}`
                        : `${MODULE_CATALOG.length}/${MODULE_CATALOG.length}`,
                    },
                    {
                      label: 'Học viên',
                      value: `${selectedCampus.studentCount.toLocaleString('vi-VN')}${
                        selectedCampus.license?.maxStudents
                          ? ` / ${selectedCampus.license.maxStudents.toLocaleString('vi-VN')}`
                          : ''
                      }`,
                    },
                    {
                      label: 'Hạn dùng',
                      value: selectedCampus.license?.validUntil ?? 'Vĩnh viễn',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                      <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                      <p className="mt-0.5 truncate text-sm font-bold text-foreground">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ---- MODULE của Đơn vị: ghép/gỡ + bật/tắt + tính năng con ---- */}
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <Blocks className="h-4 w-4" aria-hidden="true" />
                  Module của Đơn vị này
                </h3>
                <div className="mt-3">
                  <GroupTabs
                    active={activeGroup}
                    onChange={setActiveGroup}
                    offCountOf={(keys) =>
                      keys.filter(
                        (key) =>
                          isDisabled(null, key, null) ||
                          isDisabled(selectedCampus.id, key, null) ||
                          !inPackage(selectedCampus, key)
                      ).length
                    }
                  />
                  {activeGroupInfo && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {activeGroupInfo.description}
                    </p>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {visibleModules.map((mod) => {
                    const granted = inPackage(selectedCampus, mod.key)
                    const offGlobal = isDisabled(null, mod.key, null)
                    const offOrg = isDisabled(selectedCampus.id, mod.key, null)
                    const licBusy = busyFlag === `lic:${selectedCampus.id}:${mod.key}`
                    const usage = modData.usage[mod.key]
                    return (
                      <div
                        key={mod.key}
                        className={`rounded-xl border px-4 py-3 ${
                          granted && !offGlobal ? 'border-border' : 'border-border bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {mod.summary}
                              {usage
                                ? ` · ${usage.count.toLocaleString('vi-VN')} ${usage.label}`
                                : ''}
                            </p>
                            {offGlobal && (
                              <p className="mt-0.5 text-xs font-medium text-rose-600">
                                Đang TẮT toàn hệ thống — bật lại ở mục &quot;Toàn hệ thống&quot;.
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {granted ? (
                              <button
                                type="button"
                                disabled={licBusy}
                                onClick={() =>
                                  void toggleLicenseModule(selectedCampus, mod.key, false)
                                }
                                title={`Gỡ "${mod.label}" khỏi gói của ${selectedCampus.name}`}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-60"
                              >
                                {licBusy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : (
                                  <PackageMinus className="h-3 w-3" aria-hidden="true" />
                                )}
                                Gỡ khỏi gói
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={licBusy}
                                onClick={() =>
                                  void toggleLicenseModule(selectedCampus, mod.key, true)
                                }
                                title={`Ghép "${mod.label}" vào gói của ${selectedCampus.name}`}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
                              >
                                {licBusy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : (
                                  <PackagePlus className="h-3 w-3" aria-hidden="true" />
                                )}
                                Ghép vào gói
                              </button>
                            )}
                            {granted && (
                              <Switch
                                on={!offOrg}
                                busy={busyFlag === `${selectedCampus.id}:${mod.key}:`}
                                onToggle={() =>
                                  void toggleFlag(selectedCampus.id, mod.key, null)
                                }
                                label={`Bật/tắt ${mod.label} cho ${selectedCampus.name}`}
                              />
                            )}
                          </div>
                        </div>

                        {granted && !offOrg && !offGlobal && (
                          <FeatureGroup
                            features={mod.features}
                            isOff={(featureKey) =>
                              isDisabled(selectedCampus.id, mod.key, featureKey)
                            }
                            busyOf={(featureKey) =>
                              busyFlag === `${selectedCampus.id}:${mod.key}:${featureKey}`
                            }
                            onToggle={(featureKey) =>
                              void toggleFlag(selectedCampus.id, mod.key, featureKey)
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
              Chọn một Đơn vị ở cột trái để quản lý gói dịch vụ và module.
            </div>
          )}
        </div>
      </div>

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

      {/* ===== WIZARD KHỞI TẠO ĐƠN VỊ (3 bước) ===== */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleProvision}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-slate-900">
                Khởi tạo Đơn vị trọn gói
              </h2>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              {['Đơn vị', 'Gói dịch vụ', 'Admin Đơn vị'].map((label, index) => (
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

            {/* Bước 1: thông tin Đơn vị (giữ mounted để FormData thu đủ) */}
            <div className={wizardStep === 0 ? 'mt-4 space-y-3' : 'hidden'}>
              <label className="block text-sm font-medium text-slate-700">
                Tên Đơn vị mới
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

              {/* Người liên hệ của Đơn vị (khách hàng) — trống thì lấy theo Admin */}
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Người liên hệ của Đơn vị (tùy chọn)
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Để trống sẽ tự lấy theo thông tin Admin ở bước 3.
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Họ tên
                    <input name="contactName" placeholder="VD: Nguyễn Văn A" className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Email
                    <input name="contactEmail" type="email" placeholder="lienhe@donvi.vn" className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Điện thoại
                    <input name="contactPhone" placeholder="0912345678" className={inputClass} />
                  </label>
                </div>
              </div>
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

            {/* Bước 3: tài khoản Admin Đơn vị */}
            <div className={wizardStep === 2 ? 'mt-4 space-y-3' : 'hidden'}>
              <label className="block text-sm font-medium text-slate-700">
                Họ tên Admin Đơn vị
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
                Số điện thoại Admin (tùy chọn)
                <input name="adminPhone" placeholder="VD: 0912345678" className={inputClass} />
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
                Tài khoản <strong>Admin Đơn vị</strong> — toàn quyền tổ chức Cơ sở/Trung tâm
                bên trong và dùng các module đã mua.
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
                  Khởi tạo Đơn vị
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Sau khi tạo Đơn vị: hiện link cổng /coso/{slug} để gửi admin */}
      {createdPortal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-slate-900">
                  Đơn vị đã sẵn sàng
                </h2>
                <p className="mt-1 text-sm text-slate-500">{createdPortal.campusName}</p>
              </div>
              <button
                type="button"
                onClick={() => setCreatedPortal(null)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-700">
              Gửi cho Admin Đơn vị (<span className="font-medium">{createdPortal.adminEmail}</span>)
              đường dẫn đăng nhập:
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-violet-800">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}${createdPortal.portalPath}`
                  : createdPortal.portalPath}
              </code>
              <button
                type="button"
                title="Sao chép"
                onClick={() => {
                  const full =
                    typeof window !== 'undefined'
                      ? `${window.location.origin}${createdPortal.portalPath}`
                      : createdPortal.portalPath
                  void navigator.clipboard?.writeText(full)
                  setToast({ type: 'success', message: 'Đã sao chép link cổng Đơn vị.' })
                }}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-violet-700 hover:bg-violet-100"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Super Admin đăng nhập tại <span className="font-mono">/login/admin</span>.
              Đơn vị nhận link <span className="font-mono">/coso/…/login</span> (tab Nhà
              trường | Gia đình).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <a
                href={createdPortal.portalPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Mở cổng
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => setCreatedPortal(null)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
