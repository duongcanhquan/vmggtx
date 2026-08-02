'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BookOpenCheck,
  BrainCircuit,
  IdCard,
  ListPlus,
  Loader2,
  Lock,
  MessageSquareMore,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { STUDENT_CODE_FORMATS } from '@/lib/utils/studentCodeFormats'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { DEFAULT_ORG_CONFIG, type OrgConfig } from '@/lib/validation/schemas'
import {
  POLICY_OPTIONS,
  type OverridePolicies,
  type OverridePolicy,
} from '@/lib/settings/settingsPolicy'
import { getOrgSettings, saveOrgSettings, saveSettingsPolicies } from './actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { OrgLogoCard } from '@/components/settings/OrgLogoCard'

// ============================================================
// Cấu hình động theo Cơ sở (/settings) - Campus Admin / Super Admin
// (Middleware đã chặn route; RoleGuard che UI thêm một lớp.)
// - 3 Tab: Học vụ / Giao tiếp & SMS / Tài chính.
// - Toggle Switch bật/tắt tính năng, lưu JSONB vào org_settings.
// - Org không có record riêng sẽ KẾ THỪA config của cấp cha
//   (hàm SQL get_org_effective_config, migration 016).
// ============================================================

type TabId = 'academic' | 'communication' | 'finance' | 'identity'

const TABS: { id: TabId; label: string; icon: typeof BookOpenCheck }[] = [
  { id: 'academic', label: 'Học vụ', icon: BookOpenCheck },
  { id: 'communication', label: 'Giao tiếp / SMS', icon: MessageSquareMore },
  { id: 'finance', label: 'Tài chính', icon: Wallet },
  { id: 'identity', label: 'Mã học viên', icon: IdCard },
]

/** Toggle Switch tự dựng theo chuẩn Shadcn Switch (dự án chưa cài Shadcn) */
function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4">
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-semibold text-foreground">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          checked ? 'bg-primary' : 'bg-slate-300'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function NumberSetting({
  id,
  value,
  onChange,
  label,
  description,
  suffix,
  min,
  max,
}: {
  id: string
  value: number
  onChange: (value: number) => void
  label: string
  description: string
  suffix: string
  min: number
  max: number
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-h-10 w-20 rounded-xl border border-border bg-surface px-3 text-center text-sm font-semibold tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [activeTab, setActiveTab] = useState<TabId>('academic')
  const [config, setConfig] = useState<OrgConfig>(DEFAULT_ORG_CONFIG)
  const [hasOwnRecord, setHasOwnRecord] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  // [G5] Chính sách ghi đè theo nhóm do Đơn vị gốc đặt
  const [policies, setPolicies] = useState<OverridePolicies>({})
  const [isUnitRoot, setIsUnitRoot] = useState(false)
  const [unitName, setUnitName] = useState<string | null>(null)
  const [policySaving, setPolicySaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const result = await getOrgSettings(currentOrgId)
    setConfig(result.config)
    setHasOwnRecord(result.hasOwnRecord)
    setIsDemo(result.demo)
    setPolicies(result.policies)
    setIsUnitRoot(result.isUnitRoot)
    setUnitName(result.unitName)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function patch<K extends keyof OrgConfig>(key: K, value: OrgConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  /** [G5] Đơn vị gốc đổi chính sách nhóm — lưu ngay (optimistic) */
  async function changePolicy(policy: OverridePolicy) {
    if (!currentOrgId) return
    const previous = policies
    setPolicies((current) => ({ ...current, [activeTab]: policy }))
    setPolicySaving(true)
    const result = await saveSettingsPolicies(currentOrgId, activeTab, policy)
    setPolicySaving(false)
    if (result.error) {
      setPolicies(previous)
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã cập nhật quyền của các Cơ sở bên dưới.' })
  }

  const activePolicy: OverridePolicy = policies[activeTab] ?? 'inherit'
  // Cơ sở con + nhóm bị khóa cứng -> chỉ xem
  const tabLocked = !isUnitRoot && activePolicy === 'locked'

  async function handleSave() {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cấp quản lý ở góc trên bên phải.' })
      return
    }
    setSaving(true)
    const result = await saveOrgSettings(currentOrgId, config)
    setSaving(false)

    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: 'Đã lưu cấu hình. Các cơ sở con chưa có cấu hình riêng sẽ tự kế thừa.',
    })
    loadData()
  }

  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Campus Admin / Super Admin được truy cập trang Cài đặt.
        </p>
      }
    >
      <div className="space-y-6">
        {/* ===== Header ===== */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              <SettingsIcon className="h-7 w-7 text-primary" aria-hidden="true" />
              Cài đặt Cơ sở
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/settings/custom-fields"
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              Trường dữ liệu động
            </Link>
            <Link
              href="/settings/ai"
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrainCircuit className="h-4 w-4" aria-hidden="true" />
              Cấu hình AI
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
            </button>
          </div>
        </div>

        {currentOrgId && (
          <OrgLogoCard
            orgId={currentOrgId}
            onToast={(t) => setToast(t)}
          />
        )}

        {isDemo && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Đang hiển thị cấu hình mặc định (chưa đăng nhập hoặc database trống).
          </p>
        )}

        {!isDemo && !loading && !hasOwnRecord && !isUnitRoot && (
          <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Cơ sở này <strong>chưa có cấu hình riêng</strong> — đang kế thừa quy định chung
            {unitName ? (
              <>
                {' '}từ <strong>{unitName}</strong>.
              </>
            ) : (
              ' từ cấp trên.'
            )}
          </p>
        )}

        {/* ===== Tabs ===== */}
        <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-indigo-50 hover:text-primary'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* ===== [G5] Chính sách ghi đè của nhóm đang xem ===== */}
        {!loading && isUnitRoot && (
          <div className="rounded-2xl border border-[#5d68e8]/30 bg-[#5d68e8]/5 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <ShieldCheck className="h-4 w-4 text-[#3c3ac0]" aria-hidden="true" />
              Quyền của các Cơ sở bên dưới với mục này
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {POLICY_OPTIONS.map((option) => {
                const selected = activePolicy === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={policySaving}
                    onClick={() => void changePolicy(option.value)}
                    title={option.hint}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                      selected
                        ? 'border-[#3c3ac0] bg-[#3c3ac0] text-white'
                        : 'border-border bg-surface text-muted-foreground hover:border-[#5d68e8]/60 hover:text-foreground'
                    }`}
                  >
                    {option.value === 'locked' && (
                      <Lock className="h-3 w-3" aria-hidden="true" />
                    )}
                    {option.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {POLICY_OPTIONS.find((o) => o.value === activePolicy)?.hint}
            </p>
          </div>
        )}

        {!loading && tabLocked && (
          <p className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Mục này bị {unitName ? <strong>{unitName}</strong> : 'Đơn vị'} KHÓA CỨNG toàn
            Đơn vị — bạn chỉ xem, không tự thay đổi được.
          </p>
        )}

        {!loading && !isUnitRoot && activePolicy === 'required' && !hasOwnRecord && (
          <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
            {unitName ?? 'Đơn vị'} yêu cầu mỗi cơ sở <strong>tự cấu hình riêng</strong> mục
            này — hãy điền giá trị phù hợp địa bàn rồi bấm Lưu.
          </p>
        )}

        {/* ===== Nội dung tab ===== */}
        {loading ? (
          <FunLoader label="Đang tải cấu hình…" />
        ) : (
          <div
            className={`space-y-3 rounded-2xl border border-border bg-surface p-5 ${
              tabLocked ? 'pointer-events-none opacity-60' : ''
            }`}
            aria-disabled={tabLocked}
          >
            {activeTab === 'academic' && (
              <>
                <NumberSetting
                  id="set-max-absence"
                  label="Ngưỡng cảnh báo vắng mặt"
                  description="Vắng không phép từ ngưỡng này sẽ bị gắn cờ cảnh báo."
                  value={config.max_absence_warning}
                  onChange={(v) => patch('max_absence_warning', v)}
                  suffix="buổi"
                  min={1}
                  max={30}
                />
                <NumberSetting
                  id="set-grading-lock"
                  label="Thời hạn khóa sổ điểm"
                  description="Số ngày còn được sửa điểm sau buổi kiểm tra."
                  value={config.grading_locked_days}
                  onChange={(v) => patch('grading_locked_days', v)}
                  suffix="ngày"
                  min={0}
                  max={90}
                />
                <ToggleSwitch
                  id="set-lesson-approval"
                  label="Bài giảng LMS phải được Giáo vụ duyệt"
                  description="Bật: GV gửi duyệt → Giáo vụ duyệt tại /staff/lms-approval trước khi học viên thấy. Tắt: GV tự phát hành."
                  checked={config.require_lesson_approval ?? true}
                  onChange={(v) => patch('require_lesson_approval', v)}
                />
              </>
            )}

            {activeTab === 'communication' && (
              <ToggleSwitch
                id="set-auto-sms"
                label="Tự động gửi Zalo/SMS khi học sinh vắng mặt"
                description="Tự thông báo phụ huynh khi học sinh vắng không phép."
                checked={config.auto_attendance_sms}
                onChange={(v) => patch('auto_attendance_sms', v)}
              />
            )}

            {activeTab === 'finance' && (
              <ToggleSwitch
                id="set-refund-approval"
                label="Hoàn phí phải được Quản lý duyệt"
                description="Hoàn phí phải qua phê duyệt của Campus Admin trước khi chi tiền."
                checked={config.require_manager_approval_for_refunds}
                onChange={(v) => patch('require_manager_approval_for_refunds', v)}
              />
            )}

            {activeTab === 'identity' && (
              <>
                {/* Mã cơ sở */}
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4">
                  <div>
                    <label
                      htmlFor="set-org-code"
                      className="text-sm font-semibold text-foreground"
                    >
                      Mã cơ sở
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Chữ/số, tối đa 8 ký tự (VD: CS1, CG, HN2). Để trống sẽ tự suy từ
                      tên cơ sở.
                    </p>
                  </div>
                  <input
                    id="set-org-code"
                    type="text"
                    maxLength={8}
                    placeholder="CS1"
                    value={config.org_code}
                    onChange={(e) =>
                      patch(
                        'org_code',
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                      )
                    }
                    className="min-h-10 w-28 shrink-0 rounded-xl border border-border bg-surface px-3 text-center text-sm font-bold uppercase tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {/* 3 quy tắc sinh mã */}
                <fieldset className="space-y-2.5">
                  <legend className="text-sm font-semibold text-foreground">
                    Quy tắc sinh mã học viên
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Áp dụng khi tạo học viên mới (thêm tay, import Excel, chuyển hóa từ
                    CRM). Mã đã cấp không đổi.
                  </p>
                  {STUDENT_CODE_FORMATS.map((format) => {
                    const sampleOrg = config.org_code || 'CS1'
                    const isChecked = config.student_code_format === format.id
                    return (
                      <label
                        key={format.id}
                        className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-colors duration-150 ${
                          isChecked
                            ? 'border-[#5d68e8]/50 bg-[#5d68e8]/5 ring-1 ring-[#5d68e8]/30'
                            : 'border-border bg-background hover:border-primary/40'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="student-code-format"
                            checked={isChecked}
                            onChange={() => patch('student_code_format', format.id)}
                            className="h-4 w-4 cursor-pointer accent-[#3c3ac0]"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-foreground">
                              {format.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {format.pattern}
                            </span>
                          </span>
                        </span>
                        <code className="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1 font-mono text-xs font-bold text-stone-700">
                          {format.example(sampleOrg, new Date().getFullYear())}
                        </code>
                      </label>
                    )
                  })}
                </fieldset>
              </>
            )}
          </div>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
