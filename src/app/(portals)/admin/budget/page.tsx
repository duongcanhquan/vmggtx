'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  GraduationCap,
  PiggyBank,
  Wallet,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { forecastPayroll, type PayrollForecast } from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// DỰ BÁO NGÂN SÁCH LƯƠNG (/admin/budget) - Campus Admin
// Giả lập quỹ lương THÁNG TỚI từ các buổi ĐÃ XẾP LỊCH (scheduled):
// khối thống kê tổng quỹ / lương cứng / thỉnh giảng / tăng giờ +
// biểu đồ Recharts theo môn học và theo giáo viên.
// ============================================================

// recharts (~100kB) chỉ tải khi vào trang này
const BudgetForecastCharts = dynamic(
  () => import('@/components/charts/BudgetForecastCharts'),
  { ssr: false, loading: () => <FunLoader label="Đang vẽ biểu đồ…" /> }
)

const vnd = new Intl.NumberFormat('vi-VN')

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Biên chế',
  probation: 'Thử việc',
  visiting: 'Thỉnh giảng',
  hourly: 'Khoán giờ',
}

/** Tháng/năm của THÁNG TỚI (mặc định của bộ lọc) */
function nextMonth(): { month: number; year: number } {
  const now = new Date()
  const month = now.getMonth() + 2 // getMonth() 0-based + sang tháng tới
  return month > 12 ? { month: 1, year: now.getFullYear() + 1 } : { month, year: now.getFullYear() }
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  hint?: string
  tone: string
}) {
  return (
    <div className="bento-card p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 truncate font-heading text-xl font-bold tabular-nums sm:text-2xl">
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function BudgetForecastPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const initial = useMemo(nextMonth, [])
  const [month, setMonth] = useState(initial.month)
  const [year, setYear] = useState(initial.year)

  const [forecast, setForecast] = useState<PayrollForecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(() => {
    if (!currentOrgId) return
    setLoading(true)
    setError(null)
    forecastPayroll(currentOrgId, month, year).then((result) => {
      setLoading(false)
      if (result.error !== undefined) {
        setError(result.error)
        setForecast(null)
      } else {
        setForecast(result)
      }
    })
  }, [currentOrgId, month, year])

  useEffect(run, [run])

  const now = new Date()
  const isNextMonth = month === initial.month && year === initial.year

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="bento-icon bg-emerald-50 text-emerald-700">
            <PiggyBank className="h-5 w-5" aria-hidden="true" />
          </span>
          Dự báo Ngân sách Lương
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Giả lập quỹ lương từ các buổi <strong>đã xếp lịch</strong> trong tương lai — giúp Ban
          Giám đốc chủ động kế hoạch ngân sách trước khi tháng bắt đầu.
        </p>
      </div>

      {!currentOrgId ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-heading text-lg font-bold">Chưa chọn cơ sở</p>
          <p className="max-w-sm text-sm text-muted-foreground">Chọn cơ sở ở góc trên bên phải.</p>
        </div>
      ) : (
        <>
          {/* ===== Bộ lọc kỳ dự báo ===== */}
          <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-5">
            <button
              type="button"
              onClick={() => {
                setMonth(initial.month)
                setYear(initial.year)
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                isNextMonth
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-surface hover:border-primary'
              }`}
            >
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              Tháng tới ({initial.month}/{initial.year})
            </button>

            <div>
              <label
                htmlFor="budget-month"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Tháng
              </label>
              <select
                id="budget-month"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="min-h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                htmlFor="budget-year"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Năm
              </label>
              <select
                id="budget-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="min-h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {[now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {loading && <FunLoader label="Đang giả lập quỹ lương từ thời khóa biểu…" />}

          {!loading && error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}

          {!loading && forecast && (
            <>
              {/* ===== Khối thống kê ===== */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  icon={Wallet}
                  label="Tổng quỹ lương dự kiến"
                  value={`${vnd.format(forecast.totalFund)} ₫`}
                  hint={`${forecast.teacherCount} giáo viên · ${forecast.totalScheduledSessions} buổi đã xếp`}
                  tone="bg-emerald-50 text-emerald-700"
                />
                <StatCard
                  icon={Building2}
                  label="Phân bổ lương cứng"
                  value={`${vnd.format(forecast.fixedFund)} ₫`}
                  hint="Biên chế / thử việc"
                  tone="bg-indigo-50 text-indigo-600"
                />
                <StatCard
                  icon={GraduationCap}
                  label="Phân bổ thỉnh giảng"
                  value={`${vnd.format(forecast.visitingFund)} ₫`}
                  hint="Thỉnh giảng + khoán giờ (theo tiết)"
                  tone="bg-amber-50 text-amber-600"
                />
                <StatCard
                  icon={Clock3}
                  label="Tăng giờ vượt định mức"
                  value={`${vnd.format(forecast.overtimeFund)} ₫`}
                  hint="Tiết vượt nghĩa vụ của biên chế"
                  tone="bg-sky-50 text-sky-600"
                />
              </div>

              {forecast.teachersWithoutContract.length > 0 && (
                <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {forecast.teachersWithoutContract.length} giáo viên có lịch dạy nhưng CHƯA có
                  hợp đồng hiệu lực (chưa tính được chi phí):{' '}
                  {forecast.teachersWithoutContract.join(', ')}
                </p>
              )}

              {/* ===== Biểu đồ phân tích ===== */}
              <BudgetForecastCharts
                bySubject={forecast.bySubject}
                byTeacher={forecast.byTeacherChart}
              />

              {/* ===== Bảng chi tiết theo giáo viên ===== */}
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Giáo viên</th>
                      <th className="px-4 py-3 font-semibold">Hợp đồng</th>
                      <th className="px-4 py-3 text-right font-semibold">Buổi đã xếp</th>
                      <th className="px-4 py-3 text-right font-semibold">Lương cứng</th>
                      <th className="px-4 py-3 text-right font-semibold">Tiền tiết dạy</th>
                      <th className="px-4 py-3 text-right font-semibold">Tổng dự kiến</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {forecast.teachers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          Tháng {forecast.month}/{forecast.year} chưa có buổi học nào được xếp
                          lịch.
                        </td>
                      </tr>
                    )}
                    {forecast.teachers.map((row) => (
                      <tr key={row.teacherId} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{row.teacherName}</td>
                        <td className="px-4 py-3">
                          {row.contractType ? (
                            <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium">
                              {CONTRACT_LABEL[row.contractType] ?? row.contractType}
                            </span>
                          ) : (
                            <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600">
                              Chưa có hợp đồng
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.scheduledSessions}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {vnd.format(row.fixedPay)} ₫
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {vnd.format(row.teachingPay)} ₫
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {vnd.format(row.grossPay)} ₫
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-muted-foreground">
                * Số liệu GIẢ LẬP theo thời khóa biểu, tính gross (lương cứng + tiền tiết dạy,
                chưa trừ BHXH/thuế). Lịch thay đổi thì dự báo thay đổi theo — chốt số thật ở
                mục Chạy Bảng Lương Tháng sau khi giáo viên chốt điểm danh.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
