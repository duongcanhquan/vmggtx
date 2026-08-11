import {
  AlertTriangle,
  Banknote,
  FileText,
  SearchX,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { getRevenueReport, type RevenueReport } from './actions'

// ============================================================
// BÁO CÁO DOANH THU (Admin Portal - Server Component)
// ============================================================

export const dynamic = 'force-dynamic'

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

function formatMonth(month: string): string {
  const [year, m] = month.split('-')
  return `Tháng ${Number(m)}/${year}`
}

export default async function AdminRevenuePage() {
  const result = await getRevenueReport()

  if (result.error !== undefined) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
        {result.error}
      </div>
    )
  }

  const report: RevenueReport = result.report
  const maxMonth = Math.max(1, ...report.byMonth.map((row) => row.collected))

  const cards = [
    {
      label: 'Đã thu thực tế',
      value: vnd.format(report.totalCollected),
      icon: Banknote,
      tone: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Tổng phát hành',
      value: vnd.format(report.totalInvoiced),
      icon: FileText,
      tone: 'bg-indigo-50 text-indigo-600',
    },
    {
      label: 'Công nợ còn lại',
      value: vnd.format(report.totalOutstanding),
      icon: AlertTriangle,
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Hóa đơn chưa tất toán',
      value: `${report.pendingInvoices}`,
      icon: Wallet,
      tone: 'bg-rose-50 text-rose-600',
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground">
        <TrendingUp className="h-6 w-6 text-indigo-600" aria-hidden="true" />
        Báo cáo Doanh thu
      </h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="bento-card min-w-0 overflow-hidden p-5">
            <div className={`inline-flex rounded-xl p-2.5 ${card.tone}`}>
              <card.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-3 truncate text-xs font-medium uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p
              title={card.value}
              className="mt-1 min-w-0 max-w-full break-words font-heading text-[clamp(0.95rem,0.7rem+1vw,1.25rem)] font-bold leading-tight tabular-nums text-slate-900"
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Doanh thu theo tháng */}
        <div className="bento-card p-5">
          <h2 className="font-heading text-base font-bold text-slate-900">
            Tiền thu theo tháng
          </h2>
          {report.byMonth.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <SearchX className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">Chưa có phiếu thu nào.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {report.byMonth.map((row) => (
                <div key={row.month}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700">{formatMonth(row.month)}</span>
                    <span className="font-semibold text-slate-900">
                      {vnd.format(row.collected)}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        ({row.paymentCount} phiếu)
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#33319b] to-[#5d68e8]"
                      style={{ width: `${Math.round((row.collected / maxMonth) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Doanh thu theo đơn vị */}
        <div className="bento-card p-5">
          <h2 className="font-heading text-base font-bold text-slate-900">
            Theo đơn vị
          </h2>
          {report.byOrg.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <SearchX className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">Chưa có dữ liệu tài chính.</p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Đơn vị</th>
                    <th className="py-2 pr-3 text-right font-semibold">Phát hành</th>
                    <th className="py-2 pr-3 text-right font-semibold">Đã thu</th>
                    <th className="py-2 text-right font-semibold">Công nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byOrg.map((row) => (
                    <tr key={row.orgId} className="border-b border-slate-50">
                      <td className="py-2.5 pr-3 font-medium text-slate-800">
                        {row.orgName}
                        <span className="ml-1.5 text-xs text-slate-400">
                          ({row.invoiceCount} HĐ)
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-600">
                        {vnd.format(row.invoiced)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-emerald-600">
                        {vnd.format(row.collected)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-semibold ${row.outstanding > 0 ? 'text-amber-600' : 'text-slate-400'}`}
                      >
                        {vnd.format(row.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
