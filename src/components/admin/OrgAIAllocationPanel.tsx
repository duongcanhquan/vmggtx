'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { AI_PROVIDERS, type AIProvider } from '@/lib/validation/schemas'
import {
  clearOrgAISettings,
  getOrgAICenterData,
  saveOrgAISettings,
  type OrgAIRow,
} from '@/app/(portals)/admin/ai/actions'

// ============================================================
// Super Admin — Phân bổ API AI theo Đơn vị (/admin/ai)
// ============================================================

const PROVIDER_LABELS: Record<(typeof AI_PROVIDERS)[number], string> = {
  openai: 'OpenAI (GPT)',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
}

const MODEL_HINT: Record<(typeof AI_PROVIDERS)[number], string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  google: 'gemini-1.5-flash',
}

const inputClass =
  'mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function SourceBadge({ row }: { row: OrgAIRow }) {
  const styles: Record<OrgAIRow['effectiveSource'], string> = {
    own: 'bg-emerald-100 text-emerald-800',
    inherited: 'bg-sky-100 text-sky-800',
    hq: 'bg-violet-100 text-violet-800',
    env: 'bg-amber-100 text-amber-800',
  }
  const labels: Record<OrgAIRow['effectiveSource'], string> = {
    own: 'Key riêng',
    inherited: 'Kế thừa',
    hq: 'HQ toàn cục',
    env: 'Env / chưa có',
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${styles[row.effectiveSource]}`}
      title={row.effectiveHint}
    >
      {labels[row.effectiveSource]}
    </span>
  )
}

function EditPanel({
  row,
  onClose,
  onSaved,
}: {
  row: OrgAIRow
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [provider, setProvider] = useState<AIProvider>(row.aiProvider)
  const [model, setModel] = useState(row.defaultModel)
  const [apiKey, setApiKey] = useState('')
  const [isActive, setIsActive] = useState(row.isActive)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await saveOrgAISettings(row.orgId, {
      aiProvider: provider,
      defaultModel: model,
      apiKey,
      isActive,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onSaved(`Đã lưu API cho “${row.orgName}”.`)
    onClose()
  }

  async function handleClear() {
    if (
      !window.confirm(
        `Gỡ key riêng của “${row.orgName}”? Đơn vị sẽ dùng lại key HQ / env.`
      )
    ) {
      return
    }
    setClearing(true)
    setError(null)
    const result = await clearOrgAISettings(row.orgId)
    setClearing(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onSaved(`Đã gỡ key riêng của “${row.orgName}”.`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl">
        <h2 className="font-heading text-lg font-bold text-foreground">
          API AI · {row.orgName}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{row.effectiveHint}</p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-foreground">
            Nhà cung cấp
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
              className={inputClass}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Model mặc định
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_HINT[provider]}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            API Key {row.keyPreview ? `(hiện •••• ${row.keyPreview})` : ''}
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={row.keyPreview ? 'Để trống = giữ key cũ' : 'Dán API key mới'}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border text-indigo-600"
            />
            Kích hoạt key này (tắt = bỏ qua, dùng kế thừa)
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={!row.configured || clearing}
            onClick={() => void handleClear()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {clearing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            Gỡ key riêng
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrgAIAllocationPanel() {
  const [rows, setRows] = useState<OrgAIRow[]>([])
  const [hqKeyConfigured, setHqKeyConfigured] = useState(false)
  const [envKeyConfigured, setEnvKeyConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [editing, setEditing] = useState<OrgAIRow | null>(null)
  const [filter, setFilter] = useState<'level1' | 'all'>('level1')
  const [q, setQ] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const data = await getOrgAICenterData()
    setLoading(false)
    if ('error' in data && data.error) {
      setLoadError(data.error)
      setRows([])
      return
    }
    if (!('rows' in data)) {
      setLoadError('Không tải được dữ liệu.')
      return
    }
    setLoadError(null)
    setRows(data.rows)
    setHqKeyConfigured(data.hqKeyConfigured)
    setEnvKeyConfigured(data.envKeyConfigured)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter === 'level1' && !row.isLevel1) return false
      if (!needle) return true
      return row.orgName.toLowerCase().includes(needle)
    })
  }, [rows, filter, q])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <FunLoader label="Đang tải phân bổ API…" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      {editing && (
        <EditPanel
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            void reload()
          }}
        />
      )}

      <div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gán key OpenAI / Anthropic / Google cho từng Đơn vị. Key riêng ưu tiên hơn key HQ
          (tab API dùng chung). Không hiện lại full key — chỉ 4 ký tự cuối.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Key HQ (/admin/settings)</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldCheck
              className={`h-4 w-4 ${hqKeyConfigured ? 'text-emerald-600' : 'text-slate-300'}`}
              aria-hidden="true"
            />
            {hqKeyConfigured ? 'Đã cấu hình' : 'Chưa có'}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">OPENAI_API_KEY (env)</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-bold text-foreground">
            <Sparkles
              className={`h-4 w-4 ${envKeyConfigured ? 'text-emerald-600' : 'text-slate-300'}`}
              aria-hidden="true"
            />
            {envKeyConfigured ? 'Có trên server' : 'Chưa set'}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Đơn vị có key riêng</p>
          <p className="mt-1 text-sm font-bold text-foreground">
            {rows.filter((r) => r.effectiveSource === 'own').length} / {rows.length}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setFilter('level1')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === 'level1' ? 'bg-indigo-600 text-white' : 'text-muted-foreground'
            }`}
          >
            Đơn vị cấp 1
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === 'all' ? 'bg-indigo-600 text-white' : 'text-muted-foreground'
            }`}
          >
            Mọi đơn vị con
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên đơn vị…"
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
          Không có đơn vị phù hợp bộ lọc.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <li
              key={row.orgId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <p className="truncate text-sm font-semibold text-foreground">{row.orgName}</p>
                  {row.isLevel1 && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                      Cấp 1
                    </span>
                  )}
                  <SourceBadge row={row} />
                  {row.configured && !row.isActive && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                      Tắt
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {PROVIDER_LABELS[row.aiProvider]} · {row.defaultModel}
                  {row.keyPreview ? ` · •••• ${row.keyPreview}` : ''} — {row.effectiveHint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(row)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                {row.configured ? 'Sửa API' : 'Gán API'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
