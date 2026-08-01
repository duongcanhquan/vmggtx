'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarPlus,
  CheckCircle2,
  Clock3,
  FileSignature,
  MessageSquareText,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  cancelMyRequest,
  createLeaveRequest,
  createProposalRequest,
  getMyRequestsData,
  type ClassOption,
  type LeaveOption,
  type TeacherRequest,
} from './actions'

// ============================================================
// Đơn từ & Đề xuất lịch (/teacher/requests)
// Giáo viên: xin nghỉ buổi dạy / đề xuất lịch dạy mới.
// Giáo vụ duyệt kèm phản hồi -> hiển thị ngay trong danh sách.
// ============================================================

const STATUS_META: Record<
  TeacherRequest['status'],
  { label: string; className: string; icon: typeof Clock3 }
> = {
  pending: { label: 'Chờ duyệt', className: 'bg-amber-50 text-amber-700', icon: Clock3 },
  approved: { label: 'Đã duyệt', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'Từ chối', className: 'bg-rose-50 text-rose-700', icon: XCircle },
  cancelled: { label: 'Đã rút', className: 'bg-slate-100 text-slate-500', icon: Undo2 },
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

export default function TeacherRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requests, setRequests] = useState<TeacherRequest[]>([])
  const [leaveOptions, setLeaveOptions] = useState<LeaveOption[]>([])
  const [classOptions, setClassOptions] = useState<ClassOption[]>([])
  const [toast, setToast] = useState<ToastData | null>(null)

  // Form state
  const [formType, setFormType] = useState<'leave' | 'propose'>('leave')
  const [leaveSessionId, setLeaveSessionId] = useState('')
  const [proposeClassId, setProposeClassId] = useState('')
  const [proposeStart, setProposeStart] = useState('')
  const [proposeEnd, setProposeEnd] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getMyRequestsData()
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setRequests(result.requests)
      setLeaveOptions(result.leaveOptions)
      setClassOptions(result.classOptions)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    const result =
      formType === 'leave'
        ? await createLeaveRequest(leaveSessionId, reason)
        : await createProposalRequest(proposeClassId, proposeStart, proposeEnd, reason)
    setSubmitting(false)

    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message:
        formType === 'leave'
          ? 'Đã gửi đơn xin nghỉ — giáo vụ sẽ phản hồi sớm.'
          : 'Đã gửi đề xuất lịch dạy — giáo vụ sẽ phản hồi sớm.',
    })
    setLeaveSessionId('')
    setProposeClassId('')
    setProposeStart('')
    setProposeEnd('')
    setReason('')
    void load()
  }

  const handleCancel = async (id: string) => {
    const result = await cancelMyRequest(id)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã rút đơn.' })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <FileSignature className="h-6 w-6 text-primary" aria-hidden="true" />
          Đơn từ &amp; Đề xuất lịch
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Xin nghỉ buổi dạy hoặc đề xuất lịch dạy mới — giáo vụ duyệt và phản hồi ngay tại đây.
        </p>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
          {/* ===== Form tạo đơn ===== */}
          <section className="h-fit rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 grid grid-cols-2 gap-2" role="tablist" aria-label="Loại đơn">
              <button
                type="button"
                role="tab"
                aria-selected={formType === 'leave'}
                onClick={() => setFormType('leave')}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  formType === 'leave'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Xin nghỉ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={formType === 'propose'}
                onClick={() => setFormType('propose')}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  formType === 'propose'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Đề xuất lịch
              </button>
            </div>

            {formType === 'leave' ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Buổi dạy xin nghỉ
                  <select
                    value={leaveSessionId}
                    onChange={(e) => setLeaveSessionId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Chọn buổi dạy sắp tới —</option>
                    {leaveOptions.map((opt) => (
                      <option key={opt.sessionId} value={opt.sessionId}>
                        {formatDateTime(opt.startTime)} · {opt.className}
                        {opt.room ? ` · ${opt.room}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {leaveOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Bạn không có buổi dạy nào sắp tới.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Lớp (tùy chọn)
                  <select
                    value={proposeClassId}
                    onChange={(e) => setProposeClassId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Đề xuất chung (chưa gắn lớp) —</option>
                    {classOptions.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Bắt đầu
                    <input
                      type="datetime-local"
                      value={proposeStart}
                      onChange={(e) => setProposeStart(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Kết thúc
                    <input
                      type="datetime-local"
                      value={proposeEnd}
                      onChange={(e) => setProposeEnd(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hệ thống tự kiểm tra trùng lịch với các buổi dạy hiện có của bạn.
                </p>
              </div>
            )}

            <label className="mt-3 block text-sm font-medium">
              {formType === 'leave' ? 'Lý do xin nghỉ' : 'Nội dung đề xuất'}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  formType === 'leave'
                    ? 'VD: Em bị ốm, xin phép nghỉ buổi này...'
                    : 'VD: Em rảnh khung giờ này, đề xuất dạy bù/tăng cường...'
                }
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Đang gửi...' : 'Gửi cho giáo vụ'}
            </button>
          </section>

          {/* ===== Danh sách đơn của tôi ===== */}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">
              Đơn của tôi ({requests.length})
            </h2>
            {requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                Chưa có đơn nào. Tạo đơn đầu tiên ở khung bên trái.
              </div>
            ) : (
              requests.map((req) => {
                const meta = STATUS_META[req.status]
                const StatusIcon = meta.icon
                return (
                  <article
                    key={req.id}
                    className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {req.request_type === 'leave' ? (
                          <Undo2 className="h-4 w-4 text-rose-500" aria-hidden="true" />
                        ) : (
                          <CalendarPlus className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                        )}
                        <span className="text-sm font-semibold">
                          {req.request_type === 'leave' ? 'Xin nghỉ' : 'Đề xuất lịch dạy'}
                          {req.class_name ? ` · ${req.class_name}` : ''}
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
                      {req.request_type === 'leave'
                        ? `Buổi: ${formatDateTime(req.session_start)}`
                        : `Khung giờ: ${formatDateTime(req.proposed_start)} → ${formatDateTime(req.proposed_end)}`}
                      {' · '}Gửi lúc {formatDateTime(req.created_at)}
                    </p>

                    <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">{req.reason}</p>

                    {req.review_note && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                        <MessageSquareText
                          className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500"
                          aria-hidden="true"
                        />
                        <span>
                          <strong className="font-semibold">Giáo vụ phản hồi:</strong>{' '}
                          {req.review_note}
                        </span>
                      </div>
                    )}

                    {req.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void handleCancel(req.id)}
                        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Rút đơn
                      </button>
                    )}
                  </article>
                )
              })
            )}
          </section>
        </div>
      )}
    </div>
  )
}
