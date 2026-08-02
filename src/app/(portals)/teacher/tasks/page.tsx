'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckSquare, ClipboardList, Loader2 } from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  listMyWorkTasks,
  updateMyWorkTaskStatus,
  type WorkTaskRow,
  type WorkTaskStatus,
} from '@/app/(dashboard)/academic/tasks/actions'

const STATUS_LABEL: Record<WorkTaskStatus, string> = {
  todo: 'Mới',
  in_progress: 'Đang làm',
  done: 'Xong',
  cancelled: 'Hủy',
}

export default function TeacherTasksPage() {
  const [tasks, setTasks] = useState<WorkTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listMyWorkTasks()
    if (res.error) setToast({ type: 'error', message: res.error })
    setTasks(res.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(id: string, status: WorkTaskStatus) {
    setBusyId(id)
    const result = await updateMyWorkTaskStatus(id, status)
    setBusyId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    void load()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header>
        <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Việc được giao</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Công việc nội bộ do giáo vụ / quản lý giao cho bạn.
        </p>
      </header>

      {loading ? (
        <FunLoader label="Đang tải…" />
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <CheckSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">Chưa có việc được giao.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-heading font-bold">{t.title}</p>
                  {t.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {STATUS_LABEL[t.status]}
                    {t.due_at
                      ? ` · hạn ${new Date(t.due_at).toLocaleString('vi-VN')}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.status !== 'in_progress' && t.status !== 'done' && (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => void setStatus(t.id, 'in_progress')}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                    >
                      {busyId === t.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      Bắt đầu
                    </button>
                  )}
                  {t.status !== 'done' && (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => void setStatus(t.id, 'done')}
                      className="inline-flex min-h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Hoàn thành
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
