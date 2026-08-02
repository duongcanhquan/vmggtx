'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  Loader2,
  Plus,
  Trash2,
  ClipboardList,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  createWorkTask,
  listAssignableStaff,
  listWorkTasks,
  softDeleteWorkTask,
  updateWorkTaskStatus,
  type StaffOption,
  type WorkTaskPriority,
  type WorkTaskRow,
  type WorkTaskStatus,
} from './actions'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const STATUS_LABEL: Record<WorkTaskStatus, string> = {
  todo: 'Mới',
  in_progress: 'Đang làm',
  done: 'Xong',
  cancelled: 'Hủy',
}

const PRIORITY_LABEL: Record<WorkTaskPriority, string> = {
  low: 'Thấp',
  normal: 'Thường',
  high: 'Cao',
  urgent: 'Gấp',
}

const COLUMNS: WorkTaskStatus[] = ['todo', 'in_progress', 'done']

export default function AcademicTasksPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [tasks, setTasks] = useState<WorkTaskRow[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<WorkTaskPriority>('normal')
  const [dueAt, setDueAt] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!orgId) {
      setTasks([])
      setStaff([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [t, s] = await Promise.all([
      listWorkTasks(orgId),
      listAssignableStaff(orgId),
    ])
    if (t.error) setToast({ type: 'error', message: t.error })
    setTasks(t.data)
    setStaff(s.data)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  const byStatus = useMemo(() => {
    const map: Record<string, WorkTaskRow[]> = {
      todo: [],
      in_progress: [],
      done: [],
    }
    for (const t of tasks) {
      if (t.status === 'cancelled') continue
      if (map[t.status]) map[t.status].push(t)
    }
    return map
  }, [tasks])

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const result = await createWorkTask(orgId, {
      title,
      description,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      assigneeIds,
    })
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo công việc.' })
    setFormOpen(false)
    setTitle('')
    setDescription('')
    setAssigneeIds([])
    setDueAt('')
    void load()
  }

  async function onStatus(id: string, status: WorkTaskStatus) {
    if (!orgId) return
    const result = await updateWorkTaskStatus(orgId, id, status)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    void load()
  }

  async function onDelete(id: string) {
    if (!orgId) return
    if (!window.confirm('Xóa công việc này?')) return
    const result = await softDeleteWorkTask(orgId, id)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã xóa việc.' })
    void load()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Phân công công việc
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Giao việc nội bộ cho giáo vụ / GV / nhân sự — tách biệt phiếu dịch vụ
            (e-ticket) và đơn xin nghỉ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={!orgId}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tạo việc
        </button>
      </header>

      {!orgId && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chọn đơn vị trên thanh tổ chức để quản lý phân công.
        </p>
      )}

      {loading ? (
        <FunLoader label="Đang tải công việc…" />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <section
              key={col}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <h2 className="mb-3 font-heading text-sm font-bold">
                {STATUS_LABEL[col]}{' '}
                <span className="tabular-nums text-muted-foreground">
                  ({byStatus[col]?.length ?? 0})
                </span>
              </h2>
              <ul className="space-y-2">
                {(byStatus[col] ?? []).length === 0 ? (
                  <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Trống
                  </li>
                ) : (
                  (byStatus[col] ?? []).map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-border bg-background p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-snug">{t.title}</p>
                        <button
                          type="button"
                          aria-label="Xóa"
                          onClick={() => void onDelete(t.id)}
                          className="shrink-0 text-destructive hover:opacity-80"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {t.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {PRIORITY_LABEL[t.priority]}
                        {t.due_at
                          ? ` · hạn ${new Date(t.due_at).toLocaleDateString('vi-VN')}`
                          : ''}
                      </p>
                      {t.assignee_names.length > 0 && (
                        <p className="mt-1 text-[11px] text-sky-800">
                          {t.assignee_names.join(', ')}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {COLUMNS.filter((s) => s !== t.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => void onStatus(t.id, s)}
                            className="rounded-lg border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                          >
                            → {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-black/50"
            onClick={() => setFormOpen(false)}
          />
          <form
            onSubmit={(e) => void onCreate(e)}
            className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl"
          >
            <h2 className="font-heading text-xl font-bold">Tạo công việc</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="wt-title">
                  Tiêu đề *
                </label>
                <input
                  id="wt-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="wt-desc">
                  Mô tả
                </label>
                <textarea
                  id="wt-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="wt-pri">
                    Ưu tiên
                  </label>
                  <select
                    id="wt-pri"
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as WorkTaskPriority)
                    }
                    className={inputClass}
                  >
                    {(Object.keys(PRIORITY_LABEL) as WorkTaskPriority[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {PRIORITY_LABEL[k]}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="wt-due">
                    Hạn
                  </label>
                  <input
                    id="wt-due"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Giao cho</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {staff.map((s) => (
                    <li key={s.id}>
                      <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-indigo-50/50">
                        <input
                          type="checkbox"
                          checked={assigneeIds.includes(s.id)}
                          onChange={() => toggleAssignee(s.id)}
                          className="accent-primary"
                        />
                        <span>
                          {s.full_name}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({s.role})
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckSquare className="h-4 w-4" />
                )}
                Lưu
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
