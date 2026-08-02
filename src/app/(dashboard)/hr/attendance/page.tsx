'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock,
  Check,
  Loader2,
  X,
  Wallet,
  ClipboardList,
  Palmtree,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import type { WorkdayOverrideStatus } from '@/lib/hr/workdays'
import {
  listHrStaff,
  listLeaveBalances,
  listLeaveRequests,
  listMonthlyTimesheet,
  listStaffSalaryTerms,
  reviewLeaveRequest,
  upsertStaffSalaryTerm,
  upsertWorkdayOverride,
  type LeaveBalanceRow,
  type LeaveRequestRow,
  type MonthlyTimesheetRow,
  type StaffOption,
  type StaffSalaryTermRow,
} from './actions'

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

const DAY_LABEL: Record<string, string> = {
  work: 'Làm việc',
  weekend: 'Cuối tuần',
  holiday: 'Lễ',
  leave: 'Nghỉ phép',
  absent: 'Vắng',
  present: 'Có mặt',
  remote: 'Làm từ xa',
}

const DAY_CLASS: Record<string, string> = {
  work: 'bg-background border-border',
  weekend: 'bg-muted/40 text-muted-foreground',
  holiday: 'bg-purple-50 text-purple-800',
  leave: 'bg-amber-50 text-amber-800',
  absent: 'bg-red-50 text-red-700',
  present: 'bg-emerald-50 text-emerald-800',
  remote: 'bg-sky-50 text-sky-800',
}

type TabKey = 'leave' | 'timesheet' | 'balance' | 'salary'

const TABS: { key: TabKey; label: string; icon: typeof ClipboardList }[] = [
  { key: 'leave', label: 'Đơn nghỉ', icon: ClipboardList },
  { key: 'timesheet', label: 'Bảng công', icon: CalendarClock },
  { key: 'balance', label: 'Quỹ phép', icon: Palmtree },
  { key: 'salary', label: 'Lương VP', icon: Wallet },
]

export default function HrAttendancePage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const now = new Date()
  const [tab, setTab] = useState<TabKey>('leave')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [requests, setRequests] = useState<LeaveRequestRow[]>([])
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([])
  const [timesheets, setTimesheets] = useState<MonthlyTimesheetRow[]>([])
  const [salaryTerms, setSalaryTerms] = useState<StaffSalaryTermRow[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [filterProfileId, setFilterProfileId] = useState('')
  const [leaveFilter, setLeaveFilter] = useState('')

  const [reviewNote, setReviewNote] = useState<Record<string, string>>({})

  const [salaryProfileId, setSalaryProfileId] = useState('')
  const [salaryBase, setSalaryBase] = useState('')

  const [overrideProfileId, setOverrideProfileId] = useState('')
  const [overrideDate, setOverrideDate] = useState('')
  const [overrideStatus, setOverrideStatus] = useState<WorkdayOverrideStatus>('present')
  const [overrideNote, setOverrideNote] = useState('')

  const load = useCallback(async () => {
    if (!orgId) {
      setRequests([])
      setBalances([])
      setTimesheets([])
      setSalaryTerms([])
      setStaff([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [req, bal, ts, sal, st] = await Promise.all([
      listLeaveRequests(orgId, leaveFilter ? (leaveFilter as LeaveRequestRow['status']) : undefined),
      listLeaveBalances(orgId, year),
      listMonthlyTimesheet(orgId, year, month, filterProfileId || undefined),
      listStaffSalaryTerms(orgId),
      listHrStaff(orgId),
    ])
    const err = req.error ?? bal.error ?? ts.error ?? sal.error ?? st.error
    if (err) setToast({ type: 'error', message: err })
    setRequests(req.data)
    setBalances(bal.data)
    setTimesheets(ts.data)
    setSalaryTerms(sal.data)
    setStaff(st.data)
    setLoading(false)
  }, [orgId, year, month, filterProfileId, leaveFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function onReview(id: string, decision: 'approve' | 'reject') {
    if (!orgId) return
    setBusy(id + decision)
    const result = await reviewLeaveRequest(orgId, id, decision, reviewNote[id])
    setBusy(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: decision === 'approve' ? 'Đã duyệt đơn nghỉ.' : 'Đã từ chối đơn nghỉ.',
    })
    void load()
  }

  async function onSaveSalary(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !salaryProfileId) return
    const base = Number(salaryBase.replace(/\D/g, ''))
    if (!base || base <= 0) {
      setToast({ type: 'error', message: 'Nhập lương tháng hợp lệ.' })
      return
    }
    setBusy('salary')
    const result = await upsertStaffSalaryTerm(orgId, {
      profileId: salaryProfileId,
      monthlyBase: base,
    })
    setBusy(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã lưu lương văn phòng.' })
    setSalaryBase('')
    void load()
  }

  async function onSaveOverride(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !overrideProfileId || !overrideDate) return
    setBusy('override')
    const result = await upsertWorkdayOverride(orgId, {
      profileId: overrideProfileId,
      workDate: overrideDate,
      status: overrideStatus,
      note: overrideNote,
    })
    setBusy(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã cập nhật ngày công.' })
    setOverrideNote('')
    void load()
  }

  const selectedTimesheet = timesheets[0]

  return (
    <RoleGuard
      allowedRoles={[
        'super_admin',
        'campus_admin',
        'academic_staff',
        'accountant',
      ]}
      fallback={
        <div className="p-6 text-center text-muted-foreground">
          Bạn không có quyền truy cập trang này.
        </div>
      }
    >
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Ngày công & Phép
          </h1>
          <p className="text-sm text-muted-foreground">
            Duyệt đơn nghỉ, bảng công tháng, quỹ phép và lương văn phòng.
          </p>
        </header>

        {!orgId ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
            Chọn cơ sở ở thanh trên để xem dữ liệu HR.
          </div>
        ) : loading ? (
          <FunLoader label="Đang tải dữ liệu HR..." />
        ) : (
          <>
            <nav className="flex flex-wrap gap-2">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                    tab === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface border border-border text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              ))}
            </nav>

            {tab === 'leave' && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    className={inputClass + ' max-w-xs'}
                    value={leaveFilter}
                    onChange={(e) => setLeaveFilter(e.target.value)}
                    aria-label="Lọc trạng thái đơn"
                  >
                    <option value="">Tất cả trạng thái</option>
                    <option value="pending">Chờ duyệt</option>
                    <option value="approved">Đã duyệt</option>
                    <option value="rejected">Từ chối</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </div>

                {requests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
                    <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">Chưa có đơn nghỉ nào.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((r) => (
                      <article
                        key={r.id}
                        className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{r.profile_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {LEAVE_TYPE_LABEL[r.leave_type]} · {r.start_date} → {r.end_date} ·{' '}
                              {r.days_count} ngày
                            </p>
                            {r.reason && (
                              <p className="mt-1 text-sm text-foreground">{r.reason}</p>
                            )}
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[r.status] ?? ''}`}
                          >
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </div>

                        {r.status === 'pending' && (
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex-1">
                              <label className="mb-1 block text-xs text-muted-foreground">
                                Ghi chú duyệt
                              </label>
                              <input
                                className={inputClass}
                                value={reviewNote[r.id] ?? ''}
                                onChange={(e) =>
                                  setReviewNote((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                placeholder="Tùy chọn..."
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy === r.id + 'approve'}
                                onClick={() => void onReview(r.id, 'approve')}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {busy === r.id + 'approve' ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Duyệt
                              </button>
                              <button
                                type="button"
                                disabled={busy === r.id + 'reject'}
                                onClick={() => void onReview(r.id, 'reject')}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-60"
                              >
                                {busy === r.id + 'reject' ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <X className="h-4 w-4" />
                                )}
                                Từ chối
                              </button>
                            </div>
                          </div>
                        )}

                        {r.review_note && r.status !== 'pending' && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Ghi chú: {r.review_note}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === 'timesheet' && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Tháng</label>
                    <input
                      type="month"
                      className={inputClass + ' max-w-[180px]'}
                      value={`${year}-${String(month).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [y, m] = e.target.value.split('-').map(Number)
                        if (y) setYear(y)
                        if (m) setMonth(m)
                      }}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-xs text-muted-foreground">Nhân sự</label>
                    <select
                      className={inputClass}
                      value={filterProfileId}
                      onChange={(e) => setFilterProfileId(e.target.value)}
                    >
                      <option value="">Tất cả nhân sự</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <form
                  onSubmit={onSaveOverride}
                  className="rounded-2xl border border-border bg-indigo-50/50 p-4 dark:bg-indigo-950/20"
                >
                  <p className="mb-3 text-sm font-medium text-foreground">
                    Ghi đè ngày công (Admin)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <select
                      className={inputClass}
                      value={overrideProfileId}
                      onChange={(e) => setOverrideProfileId(e.target.value)}
                      required
                    >
                      <option value="">Chọn nhân sự</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className={inputClass}
                      value={overrideDate}
                      onChange={(e) => setOverrideDate(e.target.value)}
                      required
                    />
                    <select
                      className={inputClass}
                      value={overrideStatus}
                      onChange={(e) =>
                        setOverrideStatus(e.target.value as WorkdayOverrideStatus)
                      }
                    >
                      <option value="present">Có mặt</option>
                      <option value="absent">Vắng</option>
                      <option value="leave">Nghỉ phép</option>
                      <option value="remote">Làm từ xa</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy === 'override'}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {busy === 'override' && <Loader2 className="h-4 w-4 animate-spin" />}
                      Lưu override
                    </button>
                  </div>
                  <input
                    className={inputClass + ' mt-3'}
                    placeholder="Ghi chú (tùy chọn)"
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                  />
                </form>

                {timesheets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
                    Không có dữ liệu bảng công.
                  </div>
                ) : filterProfileId && selectedTimesheet ? (
                  <TimesheetCard row={selectedTimesheet} />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {timesheets.slice(0, 20).map((row) => (
                      <TimesheetCard key={row.profile_id} row={row} compact />
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === 'balance' && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Năm</label>
                  <input
                    type="number"
                    className={inputClass + ' max-w-[120px]'}
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    min={2020}
                    max={2100}
                  />
                </div>

                {balances.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
                    Chưa có quỹ phép. Nhân sự sẽ được khởi tạo khi xin phép hoặc tải trang.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium">Nhân sự</th>
                          <th className="px-4 py-3 font-medium">Được hưởng</th>
                          <th className="px-4 py-3 font-medium">Đã dùng</th>
                          <th className="px-4 py-3 font-medium">Còn lại</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balances.map((b) => (
                          <tr key={b.id} className="border-t border-border">
                            <td className="px-4 py-3">{b.profile_name}</td>
                            <td className="px-4 py-3">{b.entitled_days}</td>
                            <td className="px-4 py-3">{b.used_days}</td>
                            <td className="px-4 py-3 font-medium text-emerald-700">
                              {b.remaining_days}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {tab === 'salary' && (
              <section className="space-y-4">
                <form
                  onSubmit={onSaveSalary}
                  className="rounded-2xl border border-border bg-surface p-4"
                >
                  <p className="mb-3 font-medium text-foreground">Thiết lập lương văn phòng</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      className={inputClass}
                      value={salaryProfileId}
                      onChange={(e) => setSalaryProfileId(e.target.value)}
                      required
                    >
                      <option value="">Chọn nhân sự</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      placeholder="Lương tháng (VNĐ)"
                      value={salaryBase}
                      onChange={(e) => setSalaryBase(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      disabled={busy === 'salary'}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                    >
                      {busy === 'salary' && <Loader2 className="h-4 w-4 animate-spin" />}
                      Lưu lương
                    </button>
                  </div>
                </form>

                {salaryTerms.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-muted-foreground">
                    Chưa có hợp đồng lương văn phòng.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-border">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium">Nhân sự</th>
                          <th className="px-4 py-3 font-medium">Lương tháng</th>
                          <th className="px-4 py-3 font-medium">Hiệu lực từ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salaryTerms.map((t) => (
                          <tr key={t.id} className="border-t border-border">
                            <td className="px-4 py-3">{t.profile_name}</td>
                            <td className="px-4 py-3">
                              {t.monthly_base.toLocaleString('vi-VN')} ₫
                            </td>
                            <td className="px-4 py-3">{t.effective_from}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}

function TimesheetCard({
  row,
  compact = false,
}: {
  row: MonthlyTimesheetRow
  compact?: boolean
}) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-foreground">{row.profile_name}</h3>
        <p className="text-sm text-muted-foreground">
          Chuẩn {row.standard_days} · Phép {row.leave_days} · Công {row.worked_days}
        </p>
      </div>
      {!compact && (
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {row.days.map((d) => (
            <div
              key={d.date}
              title={d.note ?? undefined}
              className={`rounded-lg border px-1 py-2 ${DAY_CLASS[d.label] ?? ''}`}
            >
              <div className="font-medium">{d.date.slice(8)}</div>
              <div className="truncate">{DAY_LABEL[d.label]}</div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
