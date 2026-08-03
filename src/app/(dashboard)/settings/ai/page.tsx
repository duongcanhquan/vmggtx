'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  ArrowLeft,
  BookMarked,
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
import { getOrgSettings, saveOrgSettings } from '../actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { DEFAULT_ORG_CONFIG } from '@/lib/validation/schemas'
import { AI_NOT_ACTIVATED_MESSAGE } from '@/lib/ai/aiMessages'

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
  const [assistEnabled, setAssistEnabled] = useState(true)
  const [assistSaving, setAssistSaving] = useState(false)
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
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [result, orgSettings] = await Promise.all([
      getAISettings(currentOrgId),
      getOrgSettings(currentOrgId),
    ])
    setView(result)
    setAssistEnabled(orgSettings.config?.ai_assist_enabled ?? DEFAULT_ORG_CONFIG.ai_assist_enabled)
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

  async function saveAssistToggle(next: boolean) {
    if (!currentOrgId) return
    setAssistEnabled(next)
    setAssistSaving(true)
    const current = await getOrgSettings(currentOrgId)
    const result = await saveOrgSettings(currentOrgId, {
      ...current.config,
      ai_assist_enabled: next,
    })
    setAssistSaving(false)
    if (result.error) {
      setAssistEnabled(!next)
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: next
        ? 'Đã bật hỗ trợ AI cho cơ sở.'
        : 'Đã tắt hỗ trợ AI — nhân viên sẽ thấy thông báo liên hệ quản trị viên.',
    })
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
      <div className="space-y-6">
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
            Mỗi cơ sở dùng API Key riêng để tự kiểm soát chi phí.
          </p>
        </div>

        {/* ===== Công tắc hỗ trợ AI ===== */}
        {!loading && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  Bật hỗ trợ AI cho cơ sở
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Tắt hoặc chưa có API Key → nhân viên thấy: «{AI_NOT_ACTIVATED_MESSAGE}».
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={assistEnabled}
                disabled={assistSaving || !currentOrgId}
                onClick={() => void saveAssistToggle(!assistEnabled)}
                className={`relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                  assistEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                    assistEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
            {!view?.configured && !view?.demo && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Cơ sở chưa lưu API Key riêng. Nếu HQ/env cũng không có key, AI sẽ báo chưa kích
                hoạt dù công tắc đang bật.
              </p>
            )}
          </div>
        )}

        {/* ===== Cảnh báo billing ===== */}
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            API Key sẽ được lưu trữ — hãy đặt giới hạn chi tiêu (billing limit) phía
            nhà cung cấp.
          </p>
        </div>

        {/* ===== Hướng dẫn Kho tri thức ===== */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
            <BookMarked className="h-5 w-5 text-secondary" aria-hidden="true" />
            Kho tri thức AI — cách dùng
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground">
            <li>
              Chọn <strong>cơ sở</strong> trên thanh tổ chức (góc trên) — tài liệu gắn đúng
              cơ sở đó.
            </li>
            <li>
              Vào{' '}
              <Link
                href="/ai/knowledge-base"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Kho tri thức AI
              </Link>
              , chọn <strong>category</strong> (Đào tạo / Tuyển sinh / Chung).
            </li>
            <li>
              Category <strong>Đào tạo</strong>: bắt buộc chọn <strong>môn</strong> từ danh
              mục Subjects; có thể gắn lớp/học phần.
            </li>
            <li>
              Lọc danh sách theo cơ sở đang chọn · môn · lớp · category trước khi kiểm tra
              file đã nạp.
            </li>
            <li>
              Embedding dùng API Key OpenAI của cơ sở (hoặc biến môi trường) — cấu hình bên
              dưới.
            </li>
          </ol>
          <Link
            href="/ai/knowledge-base"
            className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookMarked className="h-4 w-4" aria-hidden="true" />
            Mở Kho tri thức
          </Link>
        </div>

        {view?.configured && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Cơ sở đã có API Key ({PROVIDER_LABELS[view.aiProvider]}) — kết thúc bằng{' '}
              <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs font-semibold">
                •••• {view.keyPreview}
              </code>
              .
            </p>
          </div>
        )}

        {/* ===== Form ===== */}
        {loading ? (
          <FunLoader label="Đang tải cấu hình…" />
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
              Dùng API Key của cơ sở này (tắt = kế thừa cấp trên / env nếu có)
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
            Đang ở chế độ demo (chưa đăng nhập hoặc database trống).
          </p>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
