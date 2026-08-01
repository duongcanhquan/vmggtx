'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock3,
  Inbox,
  MessageSquareText,
  Undo2,
  X,
  XCircle,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  getRequestsForReview,
  getTeacherOptions,
  reviewRequest,
  type ReviewRequest,
} from './actions'

// ============================================================
// Duyệt đơn giáo viên (/academic/requests)
// Giáo vụ duyệt/từ chối đề xuất lịch & đơn xin nghỉ, kèm phản hồi.
// Duyệt leave -> buổi tự hủy | Duyệt propose -> buổi tự tạo.
// ============================================================

const STATUS_META: Record<
  ReviewRequest['status'],
  { label: string; className: string; icon: typeof Clock3 }
> = {
  pending: { label: 'Chờ duyệt', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  approved: { label: 'Đã duyệt', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'Từ chối', className: 'bg-rose-50 text-rose-700', icon: XCircle },
  cancelled: { label: 'GV đã rút', className: 'bg-slate-100 text-slate-500', icon: Undo2 },
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AcademicRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requests, setRequests] = useState<ReviewRequest[]>([])
  const [toast, setToast] = useState<ToastData | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [substitutes, setSubstitutes] = useState<Record<string, string>>({})
  const [teacherOptions, setTeacherOptions] = useState<{ id: string; name: string }[]>([])
  const [actingId, setActingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'processed'>('pending')

  const load = useCallback(async () => {
    setLoading(true)
    const [result, teachers] = await Promise.all([
      getRequestsForReview(),
      getTeacherOptions(),
    ])
    setTeacherOptions(teachers)
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setRequests(result.requests)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests]
  )
  const visible = useMemo(
    () =>
      requests.filter((r) =>
        tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'
      ),
    [requests, tab]
  )

  const handleReview = async (id: string, decision: 'approve' | 'reject') => {
    if (actingId) return
    setActingId(id)
    const result = await reviewRequest(id, decision, notes[id] ?? '', substitutes[id] || undefined)
    setActingId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message:
        decision === 'approve'
          ? substitutes[id]
            ? 'Đã duyệt — giáo viên dạy thay được gán vào buổi học.'
            : 'Đã duyệt — lịch dạy đã tự cập nhật, giáo viên nhận được phản hồi.'
          : 'Đã từ chối kèm phản hồi cho giáo viên.',
    })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
            <Inbox className="h-6 w-6 text-primary" aria-hidden="true" />
            Duyệt đơn giáo viên
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đề xuất lịch dạy &amp; đơn xin nghỉ — duyệt là lịch tự cập nhật, phản hồi gửi thẳng
            tới cổng giáo viên.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors ${
              tab === 'pending'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Chờ duyệt ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('processed')}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors ${
              tab === 'processed'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            Đã xử lý
          </button>
        </div>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          {tab === 'pending' ? 'Không có đơn nào chờ duyệt. Tuyệt vời!' : 'Chưa có đơn đã xử lý.'}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((req) => {
            const meta = STATUS_META[req.status]
            const StatusIcon = meta.icon
            return (
              <article
                key={req.id}
                className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {req.request_type === 'leave' ? (
                      <Undo2 className="h-4 w-4 text-rose-500" aria-hidden="true" />
                    ) : (
                      <CalendarPlus className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                    )}
                    <span className="text-sm font-semibold">
                      {req.request_type === 'leave' ? 'Xin nghỉ' : 'Đề xuất lịch dạy'} ·{' '}
                      {req.teacher_name}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
                  >
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {meta.label}
                  </span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {req.org_name}
                  {req.class_name ? ` · ${req.class_name}` : ''}
                  {' · '}
                  {req.request_type === 'leave'
                    ? `Buổi: ${formatDateTime(req.session_start)}`
                    : `Khung giờ: ${formatDateTime(req.proposed_start)} → ${formatDateTime(req.proposed_end)}`}
                  {' · '}Gửi {formatDateTime(req.created_at)}
                </p>

                <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">{req.reason}</p>

                {req.status === 'pending' ? (
                  <div className="mt-3 space-y-2">
                    {req.request_type === 'leave' && (
                      <select
                        value={substitutes[req.id] ?? ''}
                        onChange={(e) =>
                          setSubstitutes((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Duyệt = HỦY buổi học (không có GV dạy thay)</option>
                        {teacherOptions
                          .filter((t) => t.name !== req.teacher_name)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              Dạy thay: {t.name}
                            </option>
                          ))}
                      </select>
                    )}
                    <textarea
                      value={notes[req.id] ?? ''}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                      rows={2}
                      maxLength={500}
                      placeholder="Phản hồi cho giáo viên (bắt buộc khi từ chối)..."
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => void handleReview(req.id, 'approve')}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Duyệt
                      </button>
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => void handleReview(req.id, 'reject')}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Từ chối
                      </button>
                    </div>
                    {req.request_type === 'leave' ? (
                      <p className="text-[11px] text-muted-foreground">
                        Chọn GV thay: giữ buổi · Bỏ trống: buổi tự hủy.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Duyệt = tạo buổi mới, tự chống trùng lịch.
                      </p>
                    )}
                  </div>
                ) : (
                  req.review_note && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                      <MessageSquareText
                        className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
                        aria-hidden="true"
                      />
                      <span>{req.review_note}</span>
                    </div>
                  )
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
