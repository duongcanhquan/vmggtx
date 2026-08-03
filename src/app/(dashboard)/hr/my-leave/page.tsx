'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarOff, Loader2, Palmtree, Send, XCircle } from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { HrLeaveTabs } from '@/components/campus-admin/HrLeaveTabs'
import { AiDraftButton } from '@/components/ai/AiDraftButton'
import { useEffectiveOrgId } from '@/lib/ai/useEffectiveOrgId'
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getMyLeaveBalance,
  listMyLeaveRequests,
} from './actions'
import type { LeaveRequestRow } from '../attendance/actions'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: 'Phép năm',
  unpaid: 'Không lương',
  other: 'Khác',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  cancelled: 'Đã hủy',
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-red-50 text-red-800',
  cancelled: 'bg-muted text-muted-foreground',
}

export default function MyLeavePage() {
  const currentOrgId = useEffectiveOrgId()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const [balance, setBalance] = useState<Awaited<ReturnType<typeof getMyLeaveBalance>>['data']>(null)
  const [requests, setRequests] = useState<LeaveRequestRow[]>([])

  const [leaveType, setLeaveType] = useState<'annual' | 'unpaid' | 'other'>('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [bal, req] = await Promise.all([getMyLeaveBalance(year), listMyLeaveRequests()])
    if (bal.error) setToast({ type: 'error', message: bal.error })
    if (req.error) setToast({ type: 'error', message: req.error })
    setBalance(bal.data)
    setRequests(req.data)
    setLoading(false)
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const result = await createLeaveRequest({
      leaveType,
      startDate,
      endDate,
      reason,
    })
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã gửi đơn xin nghỉ.' })
    setStartDate('')
    setEndDate('')
    setReason('')
    void load()
  }

  async function onCancel(id: string) {
    if (!window.confirm('Hủy đơn nghỉ đang chờ duyệt?')) return
    setBusy(true)
    const result = await cancelLeaveRequest(id)
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã hủy đơn nghỉ.' })
    void load()
  }

  return (
    <RoleGuard
      allowedRoles={[
        'super_admin',
        'campus_admin',
        'academic_staff',
        'admission_staff',
        'accountant',
        'teacher',
      ]}
      fallback={
        <div className="p-6 text-center text-muted-foreground">
          Chức năng này không dành cho học viên.
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-bold text-foreground">Xin nghỉ phép</h1>
            <p className="text-sm text-muted-foreground">
              Gửi đơn nghỉ phép năm / không lương — tách khỏi xin nghỉ buổi dạy.
            </p>
          </div>
          <HrLeaveTabs />
        </header>

        {loading ? (
          <FunLoader label="Đang tải..." />
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-indigo-50/50 p-4 dark:bg-indigo-950/20">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Palmtree className="h-5 w-5 text-primary" aria-hidden />
                  <h2 className="font-medium text-foreground">Quỹ phép năm {year}</h2>
                </div>
                <input
                  type="number"
                  className={inputClass + ' max-w-[100px]'}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  min={2020}
                  max={2100}
                  aria-label="Năm quỹ phép"
                />
              </div>
              {balance ? (
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-background p-3">
                    <p className="text-2xl font-bold text-foreground">{balance.entitled_days}</p>
                    <p className="text-xs text-muted-foreground">Được hưởng</p>
                  </div>
                  <div className="rounded-xl bg-background p-3">
                    <p className="text-2xl font-bold text-foreground">{balance.used_days}</p>
                    <p className="text-xs text-muted-foreground">Đã dùng</p>
                  </div>
                  <div className="rounded-xl bg-background p-3">
                    <p className="text-2xl font-bold text-emerald-700">{balance.remaining_days}</p>
                    <p className="text-xs text-muted-foreground">Còn lại</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có dữ liệu quỹ phép.</p>
              )}
            </section>

            <form
              onSubmit={onSubmit}
              className="space-y-4 rounded-2xl border border-border bg-surface p-4"
            >
              <h2 className="flex items-center gap-2 font-medium text-foreground">
                <CalendarOff className="h-5 w-5" aria-hidden />
                Tạo đơn nghỉ mới
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Loại nghỉ</label>
                  <select
                    className={inputClass}
                    value={leaveType}
                    onChange={(e) =>
                      setLeaveType(e.target.value as 'annual' | 'unpaid' | 'other')
                    }
                  >
                    <option value="annual">Phép năm</option>
                    <option value="unpaid">Không lương</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
                <div />
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Từ ngày</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Đến ngày</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs text-muted-foreground">Lý do</label>
                  <AiDraftButton
                    orgId={currentOrgId}
                    draftMode="leave_reason"
                    label="AI soạn"
                    contextHint={`Loại nghỉ: ${LEAVE_TYPE_LABEL[leaveType]}. Từ ${startDate || '…'} đến ${endDate || '…'}.`}
                    onDraft={(text) => setReason(text.slice(0, 500))}
                    onError={(message) => setToast({ type: 'error', message })}
                  />
                </div>
                <textarea
                  className={inputClass + ' min-h-[88px] py-2'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Mô tả ngắn..."
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Gửi đơn nghỉ
              </button>
            </form>

            <section className="space-y-3">
              <h2 className="font-medium text-foreground">Đơn của tôi</h2>
              {requests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
                  Bạn chưa gửi đơn nghỉ nào.
                </div>
              ) : (
                requests.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">
                          {LEAVE_TYPE_LABEL[r.leave_type]}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {r.start_date} → {r.end_date} · {r.days_count} ngày
                        </p>
                        {r.reason && (
                          <p className="mt-1 text-sm text-foreground">{r.reason}</p>
                        )}
                        {r.review_note && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Phản hồi: {r.review_note}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[r.status] ?? ''}`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    {r.status === 'pending' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onCancel(r.id)}
                        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-foreground hover:bg-muted/50 disabled:opacity-60"
                      >
                        <XCircle className="h-4 w-4" />
                        Hủy đơn
                      </button>
                    )}
                  </article>
                ))
              )}
            </section>
          </>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
