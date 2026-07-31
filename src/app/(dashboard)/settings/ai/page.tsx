'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { RoleGuard } from '@/components/shared/RoleGuard'
import {
  AI_PROVIDERS,
  aiSettingsSchema,
  type AISettingsFormInput,
  type AISettingsFormValues,
} from '@/lib/validation/schemas'
import { getAISettings, saveAISettings, type AISettingsView } from './actions'

// ============================================================
// Cấu hình AI Đa khách hàng (/settings/ai) - Campus Admin.
// Mỗi cơ sở nhập API Key riêng để tự kiểm soát chi phí AI.
// Key KHÔNG BAO GIỜ hiển thị lại đầy đủ - chỉ 4 ký tự cuối.
// ============================================================

const PROVIDER_LABELS: Record<(typeof AI_PROVIDERS)[number], string> = {
  openai: 'OpenAI (GPT)',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
}

const MODEL_PLACEHOLDERS: Record<(typeof AI_PROVIDERS)[number], string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  google: 'gemini-1.5-flash',
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
      {message}
    </p>
  )
}

export default function AISettingsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [view, setView] = useState<AISettingsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<AISettingsFormInput, unknown, AISettingsFormValues>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues: {
      aiProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      apiKey: '',
      isActive: true,
    },
  })

  const selectedProvider = watch('aiProvider') ?? 'openai'

  const loadData = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const result = await getAISettings(currentOrgId)
    setView(result)
    reset({
      aiProvider: result.aiProvider,
      defaultModel: result.defaultModel,
      apiKey: '',
      isActive: result.isActive,
    })
    setLoading(false)
  }, [currentOrgId, reset])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function onSubmit(values: AISettingsFormValues) {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cơ sở ở góc trên bên phải.' })
      return
    }
    setSaving(true)
    const result = await saveAISettings(currentOrgId, values)
    setSaving(false)

    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã lưu cấu hình AI cho cơ sở.' })
    loadData()
  }

  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Campus Admin / Super Admin được cấu hình AI cho cơ sở.
        </p>
      }
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {/* ===== Header ===== */}
        <div>
          <Link
            href="/settings"
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Quay lại Cài đặt Cơ sở
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <BrainCircuit className="h-7 w-7 text-secondary" aria-hidden="true" />
            Cấu hình AI của Cơ sở
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mỗi cơ sở dùng API Key riêng để tự kiểm soát chi phí AI. Chi nhánh chưa có
            key sẽ tự dùng key của cơ sở Mẹ.
          </p>
        </div>

        {/* ===== Cảnh báo billing ===== */}
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            Lưu ý: API Key của bạn sẽ được lưu trữ để phục vụ các tác vụ AI cho cơ sở.
            Vui lòng thiết lập giới hạn chi tiêu (billing limit) trên nền tảng của nhà
            cung cấp.
          </p>
        </div>

        {view?.configured && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Cơ sở đã có API Key ({PROVIDER_LABELS[view.aiProvider]}) — kết thúc bằng{' '}
              <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs font-semibold">
                •••• {view.keyPreview}
              </code>
              . Để trống ô API Key nếu chỉ muốn đổi nhà cung cấp/model.
            </p>
          </div>
        )}

        {/* ===== Form ===== */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải cấu hình…
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4 rounded-2xl border border-border bg-surface p-5"
            noValidate
          >
            <div>
              <label
                htmlFor="ai-provider"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Nhà cung cấp AI
              </label>
              <select
                id="ai-provider"
                {...register('aiProvider')}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {AI_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_LABELS[provider]}
                  </option>
                ))}
              </select>
              <FieldError message={errors.aiProvider?.message} />
            </div>

            <div>
              <label
                htmlFor="ai-model"
                className="mb-1.5 block text-sm font-semibold text-foreground"
              >
                Model mặc định
              </label>
              <input
                id="ai-model"
                type="text"
                placeholder={MODEL_PLACEHOLDERS[selectedProvider]}
                {...register('defaultModel')}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <FieldError message={errors.defaultModel?.message} />
            </div>

            <div>
              <label
                htmlFor="ai-key"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground"
              >
                <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                API Key {view?.configured && '(để trống = giữ key hiện tại)'}
              </label>
              <input
                id="ai-key"
                type="password"
                autoComplete="off"
                placeholder={view?.configured ? '••••••••••••••••' : 'sk-...'}
                {...register('apiKey')}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <FieldError message={errors.apiKey?.message} />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background p-3.5 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                {...register('isActive')}
                className="h-4 w-4 cursor-pointer rounded border-border accent-indigo-600"
              />
              Kích hoạt AI cho cơ sở này (tắt = chi nhánh dùng key kế thừa từ cấp trên)
            </label>

            <button
              type="submit"
              disabled={saving || !currentOrgId}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu…' : 'Lưu cấu hình AI'}
            </button>
          </form>
        )}

        {view?.demo && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Đang ở chế độ demo (chưa đăng nhập hoặc database trống) — form không lưu
            được cho tới khi đăng nhập bằng tài khoản Campus Admin.
          </p>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
