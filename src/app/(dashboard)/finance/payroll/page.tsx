'use client'

import { useState } from 'react'
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Loader2,
  PlayCircle,
  Wallet,
} from 'lucide-react'
import { OrgStaffTabs } from '@/components/campus-admin/OrgStaffTabs'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { runMonthlyPayroll, setPayrollStatus, type PayrollTableRow } from './actions'

// ============================================================
// Chạy Bảng Lương Tháng (/finance/payroll) - Kế toán / Campus Admin
// - Bấm "Chạy Bảng Lương Tháng [X]" -> gọi Engine calculateTeacherPayroll
//   cho TẤT CẢ giáo viên thuộc currentOrgId (server action runMonthlyPayroll).
// - Kết quả lưu payrolls (status='draft') và hiển thị Table để dò lại.
// ============================================================

const CONTRACT_TYPE_LABEL: Record<string, { label: string; className: string }> = {
  full_time: { label: 'Biên chế', className: 'bg-emerald-50 text-emerald-700' },
  visiting: { label: 'Thỉnh giảng', className: 'bg-sky-50 text-sky-700' },
  hourly: { label: 'Khoán giờ', className: 'bg-violet-50 text-violet-700' },
  probation: { label: 'Thử việc', className: 'bg-amber-50 text-amber-700' },
}

const OUTCOME_BADGE: Record<
  PayrollTableRow['outcome'],
  { label: string; className: string }
> = {
  saved: { label: 'Đã lưu nháp', className: 'bg-emerald-50 text-emerald-700' },
  locked: { label: 'Đã chốt', className: 'bg-slate-100 text-slate-500' },
  no_contract: { label: 'Thiếu hợp đồng', className: 'bg-rose-50 text-rose-700' },
}

const CURRENCY = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const selectClass =
  'min-h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function FinancePayrollPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const [running, setRunning] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [rows, setRows] = useState<PayrollTableRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ranPeriod, setRanPeriod] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  async function handleRun() {
    if (!currentOrgId) return
    setRunning(true)
    setError(null)
    setStatusMsg(null)
    setRows([])

    const result = await runMonthlyPayroll(currentOrgId, month, year)
    setRunning(false)

    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    setRows(result.rows)
    setRanPeriod(`${month}/${year}`)
  }

  async function handleStatus(next: 'approved' | 'paid') {
    if (!currentOrgId) return
    setStatusBusy(true)
    setStatusMsg(null)
    const result = await setPayrollStatus(currentOrgId, month, year, next)
    setStatusBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setStatusMsg(
      next === 'approved'
        ? `Đã duyệt ${result.updated ?? 0} dòng lương (draft → approved).`
        : `Đã đánh dấu đã chi ${result.updated ?? 0} dòng (approved → paid).`
    )
  }

  const savedRows = rows.filter((row) => row.outcome === 'saved')
  const totalNetPay = rows
    .filter((row) => row.outcome !== 'no_contract')
    .reduce((sum, row) => sum + row.net_pay, 0)
  const totalHours = rows.reduce((sum, row) => sum + row.total_hours_taught, 0)

  return (
    <div className="space-y-6">
      {/* ===== Header + Tabs mục "Lương & Hợp đồng" ===== */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Chạy Bảng Lương Tháng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kết quả lưu dạng <strong>draft</strong> để Kế toán dò lại.
          </p>
        </div>
        <OrgStaffTabs />
      </div>

      {!currentOrgId ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-heading text-lg font-bold">Chưa chọn cơ sở</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Chọn cơ sở ở góc trên bên phải.
          </p>
        </div>
      ) : (
        <>
          {/* ===== Chọn kỳ + nút chạy ===== */}
          <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5">
            <div>
              <label
                htmlFor="payroll-month"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Tháng
              </label>
              <select
                id="payroll-month"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className={selectClass}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="payroll-year"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Năm
              </label>
              <select
                id="payroll-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={selectClass}
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
                  (y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  )
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
              )}
              {running
                ? 'Đang chạy Engine…'
                : `Chạy Bảng Lương Tháng ${month}/${year}`}
            </button>
            <button
              type="button"
              onClick={() => handleStatus('approved')}
              disabled={statusBusy || running}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"
            >
              Duyệt draft → approved
            </button>
            <button
              type="button"
              onClick={() => handleStatus('paid')}
              disabled={statusBusy || running}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"
            >
              Đánh dấu đã chi
            </button>
          </section>

          {statusMsg && (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {statusMsg}
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Không chạy được bảng lương</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* ===== Bento tổng hợp ===== */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <p className="text-sm font-medium text-muted-foreground">
                    Đã lưu nháp / Tổng GV
                  </p>
                  <p className="mt-1 font-heading text-3xl font-bold tabular-nums">
                    {savedRows.length}/{rows.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <p className="text-sm font-medium text-muted-foreground">
                    Tổng tiết đã dạy
                  </p>
                  <p className="mt-1 font-heading text-3xl font-bold tabular-nums">
                    {totalHours}
                  </p>
                </div>
                <div className="min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-primary-foreground shadow-sm">
                  <p className="text-sm font-medium text-indigo-100">
                    Tổng chi lương kỳ {ranPeriod}
                  </p>
                  <p
                    title={CURRENCY.format(totalNetPay)}
                    className="mt-1 min-w-0 max-w-full break-words font-heading text-[clamp(1rem,0.75rem+1.2vw,1.875rem)] font-bold leading-tight tabular-nums"
                  >
                    {CURRENCY.format(totalNetPay)}
                  </p>
                </div>
              </div>

              {/* ===== Bảng dò soát cho Kế toán ===== */}
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-semibold">Giáo viên</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Loại HĐ</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Tiết dạy</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Lương chính</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Tiền dạy</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Bảo hiểm</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Thuế</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Thực lĩnh</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const outcome = OUTCOME_BADGE[row.outcome]
                      const typeMeta = row.contract_type
                        ? CONTRACT_TYPE_LABEL[row.contract_type]
                        : null
                      return (
                        <tr
                          key={row.teacher_id}
                          className={`border-b border-border last:border-b-0 hover:bg-indigo-50/30 ${
                            row.outcome === 'no_contract' ? 'bg-rose-50/40' : ''
                          } ${row.outcome === 'locked' ? 'text-muted-foreground' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{row.teacher_name}</p>
                            {row.outcome !== 'saved' && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {typeMeta ? (
                              <span
                                className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${typeMeta.className}`}
                              >
                                {typeMeta.label}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.total_hours_taught}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {CURRENCY.format(row.regular_pay)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {CURRENCY.format(row.teaching_pay)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                            -{CURRENCY.format(row.insurance_deduction)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                            -{CURRENCY.format(row.tax_deduction)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-primary">
                            {CURRENCY.format(row.net_pay)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${outcome.className}`}
                            >
                              {outcome.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-slate-50 font-semibold">
                      <td className="px-4 py-3" colSpan={2}>Tổng cộng</td>
                      <td className="px-4 py-3 text-right tabular-nums">{totalHours}</td>
                      <td className="px-4 py-3" colSpan={4} />
                      <td className="px-4 py-3 text-right tabular-nums text-primary">
                        {CURRENCY.format(totalNetPay)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {rows.length === 0 && !running && !error && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Wallet className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="font-heading text-lg font-bold">Chưa chạy kỳ lương nào</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
