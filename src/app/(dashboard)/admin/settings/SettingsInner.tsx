'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Building2,
  Clock,
  Globe,
  KeyRound,
  Loader2,
  Percent,
  Save,
  ShieldCheck,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  globalSettingsSchema,
  type GlobalSettingsInput,
  type GlobalSettingsValues,
} from '@/lib/validation/schemas'
import {
  clearGlobalApiKey,
  getGlobalSettings,
  saveGlobalSettings,
  type GlobalSettingsResult,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'
import OrgAIAllocationPanel from '@/components/admin/OrgAIAllocationPanel'

type TabKey = 'general' | 'api-hq' | 'api-units'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
      {message}
    </p>
  )
}

const INPUT_CLASS =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const TABS: { key: TabKey; label: string; icon: typeof Globe }[] = [
  { key: 'general', label: 'Chung', icon: Globe },
  { key: 'api-hq', label: 'API dùng chung', icon: KeyRound },
  { key: 'api-units', label: 'API theo Đơn vị', icon: Sparkles },
]

export default function AdminSettingsInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const tab: TabKey =
    tabParam === 'api' || tabParam === 'api-units'
      ? 'api-units'
      : tabParam === 'api-hq'
        ? 'api-hq'
        : 'general'

  const [data, setData] = useState<GlobalSettingsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearingKey, setClearingKey] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GlobalSettingsInput, unknown, GlobalSettingsValues>({
    resolver: zodResolver(globalSettingsSchema),
    defaultValues: {
      openai_api_key: '',
      allow_late_checkin_minutes: 15,
      tax_rate_default: 10,
    },
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getGlobalSettings()
    setData(result)
    reset({
      openai_api_key: '',
      allow_late_checkin_minutes: result.values.allow_late_checkin_minutes,
      tax_rate_default: result.values.tax_rate_default,
    })
    setLoading(false)
  }, [reset])

  useEffect(() => {
    void loadData()
  }, [loadData])

  function setTab(next: TabKey) {
    const q =
      next === 'general' ? '' : next === 'api-hq' ? '?tab=api-hq' : '?tab=api-units'
    router.replace(`/admin/settings${q}`)
  }

  async function onSubmit(values: GlobalSettingsValues) {
    setSaving(true)
    const result = await saveGlobalSettings(values)
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: 'Đã lưu cài đặt chung — đơn vị chưa ghi đè nhận giá trị mới ngay.',
    })
    void loadData()
  }

  async function handleClearApiKey() {
    setClearingKey(true)
    const result = await clearGlobalApiKey()
    setClearingKey(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: 'Đã xóa API key dùng chung — hệ thống dùng biến môi trường.',
    })
    void loadData()
  }

  return (
    <RoleGuard
      allowedRoles={['super_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Super Admin được truy cập Cài đặt chung.
        </p>
      }
    >
      <div className="space-y-5">
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Globe className="h-7 w-7 text-primary" aria-hidden="true" />
            Cài đặt chung
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cấu hình HQ cho{' '}
            <strong>{data?.rootOrgName ?? 'Tổng công ty'}</strong> và phân bổ API theo từng
            Đơn vị.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-surface p-1.5">
          {TABS.map((item) => {
            const Icon = item.icon
            const active = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </div>

        {tab === 'api-units' ? (
          <OrgAIAllocationPanel />
        ) : loading ? (
          <FunLoader label="Đang tải cài đặt…" />
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {data?.demo && (
              <div
                role="alert"
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                Đang dùng giá trị tạm (chưa đọc được HQ)
                {data.loadError ? `: ${data.loadError}` : '.'} Không lưu ghi đè lên DB
                khi trạng thái này còn hiện.
              </div>
            )}
            {tab === 'general' && (
              <>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Thứ tự ưu tiên cấu hình
                  </p>
                  <p className="mt-1.5 text-sm text-indigo-800">
                    Cá nhân → Cơ sở → Cụm → <strong>HQ</strong> → mặc định.
                  </p>
                  {data && !data.demo && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-700">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {data.overrideCount} đơn vị cấp dưới đang ghi đè một phần.
                    </p>
                  )}
                </div>

                <section className="rounded-2xl border border-border bg-surface p-5">
                  <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                    <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
                    Điểm danh
                  </h2>
                  <div className="mt-3.5">
                    <label
                      htmlFor="gs-late-minutes"
                      className="mb-1.5 block text-sm font-semibold text-foreground"
                    >
                      Cho phép điểm danh trễ (phút)
                    </label>
                    <input
                      id="gs-late-minutes"
                      type="number"
                      min={0}
                      max={120}
                      {...register('allow_late_checkin_minutes')}
                      className={`${INPUT_CLASS} max-w-40`}
                    />
                    <FieldError message={errors.allow_late_checkin_minutes?.message} />
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-surface p-5">
                  <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                    <Percent className="h-4 w-4 text-primary" aria-hidden="true" />
                    Thuế TNCN
                  </h2>
                  <div className="mt-3.5">
                    <label
                      htmlFor="gs-tax-rate"
                      className="mb-1.5 block text-sm font-semibold text-foreground"
                    >
                      Mức thuế mặc định (%) khi hợp đồng không ghi rõ
                    </label>
                    <input
                      id="gs-tax-rate"
                      type="number"
                      step="0.5"
                      min={0}
                      max={50}
                      {...register('tax_rate_default')}
                      className={`${INPUT_CLASS} max-w-40`}
                    />
                    <FieldError message={errors.tax_rate_default?.message} />
                  </div>
                </section>
              </>
            )}

            {tab === 'api-hq' && (
              <section className="rounded-2xl border border-border bg-surface p-5">
                <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                  <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                  OpenAI API Key dùng chung (HQ)
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Áp dụng khi Đơn vị chưa có key riêng. Muốn gán theo từng trường → tab{' '}
                  <button
                    type="button"
                    onClick={() => setTab('api-units')}
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    API theo Đơn vị
                  </button>
                  .
                </p>
                <div className="mt-3.5">
                  <label
                    htmlFor="gs-api-key"
                    className="mb-1.5 block text-sm font-semibold text-foreground"
                  >
                    API Key mới
                  </label>
                  <input
                    id="gs-api-key"
                    type="password"
                    autoComplete="off"
                    placeholder={data?.hasApiKey ? 'Nhập key mới để thay' : 'sk-…'}
                    {...register('openai_api_key')}
                    className={INPUT_CLASS}
                  />
                  <FieldError message={errors.openai_api_key?.message} />
                </div>
                {data?.hasApiKey && (
                  <button
                    type="button"
                    onClick={() => void handleClearApiKey()}
                    disabled={clearingKey}
                    className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                  >
                    {clearingKey ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Xóa key dùng chung
                  </button>
                )}
              </section>
            )}

            {(tab === 'general' || tab === 'api-hq') && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  Lưu cài đặt
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </RoleGuard>
  )
}
