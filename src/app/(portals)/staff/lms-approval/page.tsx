'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BookOpenCheck,
  Check,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  approveLesson,
  getPendingLessonsForOrg,
  rejectLesson,
} from '@/app/(portals)/teacher/lms/actions'

// ============================================================
// Duyệt bài giảng LMS (/staff/lms-approval) — Giáo vụ / Campus Admin
// ============================================================

type PendingRow = {
  id: string
  title: string
  class_id: string
  class_name: string
  org_id: string
  teacher_name: string
  submitted_at: string | null
  created_at: string
}

export default function StaffLmsApprovalPage() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      setRows([])
      return
    }
    setLoading(true)
    const result = await getPendingLessonsForOrg(currentOrgId)
    setRows(result.data)
    setLoadError(result.loadError ?? null)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleApprove(row: PendingRow) {
    setBusyId(row.id)
    const res = await approveLesson(row.class_id, row.id)
    setBusyId(null)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
      return
    }
    setToast({ type: 'success', message: `Đã duyệt «${row.title}».` })
    void load()
  }

  async function handleReject(row: PendingRow) {
    setBusyId(row.id)
    const res = await rejectLesson(row.class_id, row.id, rejectNote)
    setBusyId(null)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
      return
    }
    setToast({ type: 'success', message: `Đã từ chối «${row.title}».` })
    setRejectingId(null)
    setRejectNote('')
    void load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          Duyệt bài giảng LMS
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Giáo viên gửi bài → Giáo vụ duyệt → học viên mới thấy trên /learn.
        </p>
      </div>

      {loadError && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {loading ? (
          <FunLoader label="Đang tải hàng chờ duyệt…" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <BookOpenCheck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {loadError
                ? 'Không có dữ liệu để hiển thị.'
                : 'Không có bài giảng nào đang chờ duyệt.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-heading text-base font-bold text-foreground">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {row.class_name} · GV {row.teacher_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Gửi:{' '}
                      {row.submitted_at
                        ? new Date(row.submitted_at).toLocaleString('vi-VN')
                        : new Date(row.created_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void handleApprove(row)}
                      className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {busyId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Duyệt
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => {
                        setRejectingId(row.id)
                        setRejectNote('')
                      }}
                      className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Từ chối
                    </button>
                  </div>
                </div>
                {rejectingId === row.id && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                    <label
                      htmlFor={`reject-${row.id}`}
                      className="text-xs font-semibold text-rose-800"
                    >
                      Lý do từ chối
                    </label>
                    <textarea
                      id={`reject-${row.id}`}
                      rows={2}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="VD: Thiếu mục tiêu bài học, cần bổ sung video…"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === row.id || rejectNote.trim().length < 3}
                        onClick={() => void handleReject(row)}
                        className="inline-flex min-h-9 cursor-pointer items-center rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Xác nhận từ chối
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(null)}
                        className="inline-flex min-h-9 cursor-pointer items-center rounded-xl border border-border px-3 text-xs font-semibold"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
