'use client'

import { useCallback, useEffect, useState } from 'react'
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

// ============================================================
// Cài đặt toàn cục (/admin/settings) - CHỈ SuperAdmin.
// Giá trị lưu vào org_settings của HQ và TỰ TRÀN xuống mọi cơ sở
// con chưa ghi đè (chuỗi kế thừa Cá nhân -> Cơ sở -> Cụm -> HQ
// -> default, xử lý bởi settingsResolver).
// ============================================================

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

export default function AdminSettingsPage() {
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
    loadData()
  }, [loadData])

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
      message: 'Đã lưu cài đặt toàn cục — các cơ sở chưa ghi đè sẽ nhận giá trị mới ngay.',
    })
    loadData()
  }

  async function handleClearApiKey() {
    // [UX] Disable nút + spinner trong lúc gọi server action
    setClearingKey(true)
    const result = await clearGlobalApiKey()
    setClearingKey(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: 'Đã xóa API key dùng chung — hệ thống quay về dùng biến môi trường.',
    })
    loadData()
  }

  return (
    <RoleGuard
      allowedRoles={['super_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Super Admin được truy cập Cài đặt toàn cục.
        </p>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* ===== Header ===== */}
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Globe className="h-7 w-7 text-primary" aria-hidden="true" />
            Cài đặt toàn cục (HQ)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Giá trị đặt tại đây lưu vào cấu hình của{' '}
            <strong>{data?.rootOrgName ?? 'Tổng công ty (HQ)'}</strong> và tự động tràn
            xuống mọi Cụm / Cơ sở chưa tự ghi đè.
          </p>
        </div>

        {/* ===== Chuỗi kế thừa ===== */}
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            Thứ tự ưu tiên khi hệ thống đọc một cài đặt
          </p>
          <p className="mt-1.5 text-sm text-indigo-800">
            Cài đặt Cá nhân (nếu có) → Cơ sở → Cụm → <strong>HQ (trang này)</strong> →
            giá trị mặc định trong code. Cấp dưới ghi đè cấp trên; không cấp nào đặt thì
            dùng mặc định.
          </p>
          {data && !data.demo && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-indigo-700">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              Hiện có {data.overrideCount} đơn vị cấp dưới đang giữ cấu hình riêng (ghi
              đè một phần).
            </p>
          )}
        </div>

        {data?.demo && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Đang ở chế độ demo (chưa đăng nhập Super Admin hoặc database trống).
          </p>
        )}

        {/* ===== Form ===== */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải cài đặt…
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* --- AI --- */}
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                OpenAI API Key dùng chung
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dùng cho cơ sở KHÔNG có key riêng (org_ai_settings). Cơ sở nào đã cấu
                hình key riêng tại Cài đặt AI vẫn được ưu tiên dùng key của họ.
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
                  placeholder={
                    data?.hasApiKey
                      ? 'Đã có key — nhập để thay thế, bỏ trống để giữ nguyên'
                      : 'sk-…'
                  }
                  {...register('openai_api_key')}
                  className={INPUT_CLASS}
                />
                <FieldError message={errors.openai_api_key?.message} />
              </div>

              {data?.hasApiKey && (
                <button
                  type="button"
                  onClick={handleClearApiKey}
                  disabled={clearingKey}
                  className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-600 transition-colors duration-150 hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {clearingKey ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Xóa key dùng chung (quay về biến môi trường)
                </button>
              )}
            </section>

            {/* --- Học vụ --- */}
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

            {/* --- Tài chính --- */}
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

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Lưu &amp; tràn xuống toàn hệ thống
              </button>
            </div>
          </form>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
