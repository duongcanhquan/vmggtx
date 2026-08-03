'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Flag,
  Loader2,
  RadarIcon,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  getWarningAiAssist,
  getWarningInsights,
  getWarnings,
  runEarlyWarningSystem,
  sendParentNotification,
  updateWarningWorkflow,
  type WarningInsight,
  type WarningRow,
  type WarningSeverity,
  type WarningStatus,
  type WarningType,
} from './actions'
import { AiDraftButton } from '@/components/ai/AiDraftButton'

const TYPE_META: Record<WarningType, { label: string; badgeClass: string }> = {
  attendance: {
    label: 'Vắng nhiều',
    badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
  grade: {
    label: 'Yếu kém',
    badgeClass: 'bg-orange-50 text-orange-700 border border-orange-200',
  },
}

const SEVERITY_META: Record<WarningSeverity, { label: string; className: string }> = {
  early: {
    label: 'Sớm',
    className: 'bg-amber-50 text-amber-800 border border-amber-200',
  },
  danger: {
    label: 'Nguy hiểm',
    className: 'bg-destructive/10 text-destructive border border-destructive/30',
  },
}

const STATUS_META: Record<WarningStatus, { label: string; className: string }> = {
  new: { label: 'Mới', className: 'bg-muted text-muted-foreground' },
  notified: { label: 'Đã báo PH', className: 'bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'Đang xử lý', className: 'bg-sky-50 text-sky-700' },
  resolved: { label: 'Đã xử lý', className: 'bg-indigo-50 text-indigo-700' },
}

export default function AcademicWarningsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [warnings, setWarnings] = useState<WarningRow[]>([])
  const [insights, setInsights] = useState<WarningInsight>({
    topStudents: [],
    topClasses: [],
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | WarningType>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | WarningSeverity>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | WarningStatus>('all')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [w, i] = await Promise.all([
      getWarnings(currentOrgId),
      getWarningInsights(currentOrgId),
    ])
    setWarnings(w.data)
    setInsights(i.data)
    setLoadError(w.loadError ?? i.error ?? null)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const kw = searchText.trim().toLowerCase()
    return warnings.filter((w) => {
      if (typeFilter !== 'all' && w.warning_type !== typeFilter) return false
      if (severityFilter !== 'all' && w.severity !== severityFilter) return false
      if (statusFilter !== 'all' && w.status !== statusFilter) return false
      if (!kw) return true
      return (
        w.student_name.toLowerCase().includes(kw) ||
        w.class_name.toLowerCase().includes(kw) ||
        w.org_name.toLowerCase().includes(kw) ||
        w.description.toLowerCase().includes(kw)
      )
    })
  }, [warnings, searchText, typeFilter, severityFilter, statusFilter])

  const kpi = useMemo(() => {
    const open = warnings.filter((w) => w.status !== 'resolved')
    return {
      total: warnings.length,
      early: open.filter((w) => w.severity === 'early').length,
      danger: open.filter((w) => w.severity === 'danger').length,
      newCount: warnings.filter((w) => w.status === 'new').length,
      inProgress: warnings.filter((w) => w.status === 'in_progress').length,
      resolved: warnings.filter((w) => w.status === 'resolved').length,
    }
  }, [warnings])

  const newIds = useMemo(
    () => filtered.filter((w) => w.status === 'new').map((w) => w.id),
    [filtered]
  )

  async function handleScan() {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cấp quản lý ở góc trên bên phải.' })
      return
    }
    setScanning(true)
    const result = await runEarlyWarningSystem(currentOrgId)
    setScanning(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Quét xong: ${result.attendance} chuyên cần, ${result.grade} học lực.`,
    })
    void load()
  }

  async function handleSend(ids: string[]) {
    if (ids.length === 0) {
      setToast({ type: 'error', message: 'Không có cảnh báo "Mới" để gửi PH.' })
      return
    }
    const result = await sendParentNotification(ids)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Đã gửi ${result.sent} thông báo Zalo cho phụ huynh.`,
    })
    void load()
  }

  async function handleWorkflow(id: string, status: WarningStatus) {
    setBusyId(id)
    const result = await updateWarningWorkflow(id, status, noteDraft[id])
    setBusyId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã cập nhật: ${STATUS_META[status].label}.` })
    void load()
  }

  async function handleAi() {
    if (!currentOrgId) return
    const ids = selected.size > 0 ? Array.from(selected) : filtered.slice(0, 10).map((w) => w.id)
    if (ids.length === 0) {
      setToast({ type: 'error', message: 'Chọn cảnh báo hoặc quét trước.' })
      return
    }
    setAiBusy(true)
    setAiText(null)
    const result = await getWarningAiAssist(currentOrgId, ids)
    setAiBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setAiText(result.text ?? null)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Cảnh báo học vụ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tổng hợp rủi ro · mức Sớm / Nguy hiểm · xử lý đến khi đóng case. Ngưỡng tại Cài đặt →
            Học vụ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={scanning || !currentOrgId}
            onClick={() => void handleScan()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RadarIcon className="h-4 w-4" aria-hidden="true" />
            )}
            Quét cảnh báo
          </button>
          <button
            type="button"
            disabled={sendingAll || newIds.length === 0}
            onClick={async () => {
              setSendingAll(true)
              await handleSend(newIds)
              setSendingAll(false)
            }}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {sendingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Báo PH ({newIds.length})
          </button>
          <button
            type="button"
            disabled={aiBusy}
            onClick={() => void handleAi()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            {aiBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            AI gợi ý
          </button>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Tổng', value: kpi.total },
          { label: 'Sớm (mở)', value: kpi.early },
          { label: 'Nguy hiểm', value: kpi.danger },
          { label: 'Mới', value: kpi.newCount },
          { label: 'Đang xử lý', value: kpi.inProgress },
          { label: 'Đã xử lý', value: kpi.resolved },
        ].map((k) => (
          <div key={k.label} className="bento-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {k.label}
            </p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            Top HV vắng không phép
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {insights.topStudents.length === 0 ? (
              <li className="text-muted-foreground">Chưa có dữ liệu vắng.</li>
            ) : (
              insights.topStudents.map((s) => (
                <li key={s.student_id} className="flex justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
                  <span className="font-medium">{s.student_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {s.unexcused} buổi · {s.classes} lớp
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
            <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
            Top lớp có cảnh báo (chưa đóng)
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {insights.topClasses.length === 0 ? (
              <li className="text-muted-foreground">Chưa có cảnh báo mở.</li>
            ) : (
              insights.topClasses.map((c) => (
                <li key={c.class_id} className="flex justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
                  <span className="font-medium">{c.class_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.warning_count} CB · {c.danger_count} nguy hiểm
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {aiText && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm whitespace-pre-wrap">
          <p className="mb-2 flex items-center gap-2 font-semibold text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Gợi ý AI
          </p>
          {aiText}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm HV, lớp, đơn vị, mô tả…"
            className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          aria-label="Lọc loại"
        >
          <option value="all">Mọi loại</option>
          <option value="attendance">Vắng nhiều</option>
          <option value="grade">Yếu kém</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
          className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          aria-label="Lọc mức"
        >
          <option value="all">Mọi mức</option>
          <option value="early">Sớm</option>
          <option value="danger">Nguy hiểm</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          aria-label="Lọc trạng thái"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="new">Mới</option>
          <option value="notified">Đã báo PH</option>
          <option value="in_progress">Đang xử lý</option>
          <option value="resolved">Đã xử lý</option>
        </select>
      </div>

      {loading ? (
        <FunLoader label="Đang tải cảnh báo…" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Không có cảnh báo khớp bộ lọc. Bấm «Quét cảnh báo» để cập nhật.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((w) => (
            <li
              key={w.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(w.id)}
                  onChange={() => toggleSelect(w.id)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                  aria-label={`Chọn ${w.student_name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Flag
                      className={`h-4 w-4 ${w.severity === 'danger' ? 'text-destructive' : 'text-amber-600'}`}
                      aria-hidden="true"
                    />
                    <p className="font-semibold">{w.student_name}</p>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_META[w.warning_type].badgeClass}`}>
                      {TYPE_META[w.warning_type].label}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${SEVERITY_META[w.severity].className}`}>
                      {SEVERITY_META[w.severity].label}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_META[w.status].className}`}>
                      {STATUS_META[w.status].label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {w.class_name} · {w.org_name}
                    {w.student_phone ? ` · ${w.student_phone}` : ''}
                  </p>
                  <p className="mt-2 text-sm">{w.description}</p>
                  {w.handler_notes && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ghi chú: {w.handler_notes}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Ghi chú xử lý / nhắn PH</span>
                    <AiDraftButton
                      orgId={currentOrgId}
                      draftMode="parent_warning"
                      label="AI soạn ghi chú"
                      contextHint={`Học viên: ${w.student_name}. Lớp: ${w.class_name}. Loại: ${TYPE_META[w.warning_type].label}. Mức: ${SEVERITY_META[w.severity].label}. Mô tả: ${w.description}`}
                      onDraft={(text) =>
                        setNoteDraft((prev) => ({ ...prev, [w.id]: text.slice(0, 1000) }))
                      }
                      onError={(message) => setToast({ type: 'error', message })}
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={noteDraft[w.id] ?? w.handler_notes ?? ''}
                    onChange={(e) =>
                      setNoteDraft((prev) => ({ ...prev, [w.id]: e.target.value }))
                    }
                    placeholder="Ghi chú xử lý…"
                    className="mt-1 min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:w-40">
                  {w.status === 'new' && (
                    <button
                      type="button"
                      disabled={sendingIds.has(w.id)}
                      onClick={async () => {
                        setSendingIds((p) => new Set(p).add(w.id))
                        await handleSend([w.id])
                        setSendingIds((p) => {
                          const n = new Set(p)
                          n.delete(w.id)
                          return n
                        })
                      }}
                      className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      Báo PH
                    </button>
                  )}
                  {w.status !== 'in_progress' && w.status !== 'resolved' && (
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => void handleWorkflow(w.id, 'in_progress')}
                      className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-60"
                    >
                      Đang xử lý
                    </button>
                  )}
                  {w.status !== 'resolved' && (
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => void handleWorkflow(w.id, 'resolved')}
                      className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Đã xử lý
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
