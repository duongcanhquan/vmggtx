import { AlertTriangle, Banknote, SearchX, Wallet } from 'lucide-react'
import { getMyTuition, type MyInvoice } from './actions'

// ============================================================
// HỌC PHÍ (Student Portal - Server Component, mobile-first)
// ============================================================

export const dynamic = 'force-dynamic'

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})
const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
})

const STATUS_BADGE: Record<MyInvoice['status'], { label: string; className: string }> = {
  pending: { label: 'Chưa đóng', className: 'bg-rose-50 text-rose-600' },
  partial: { label: 'Đóng một phần', className: 'bg-amber-50 text-amber-600' },
  paid: { label: 'Đã đóng đủ', className: 'bg-emerald-50 text-emerald-600' },
  cancelled: { label: 'Đã hủy', className: 'bg-slate-100 text-slate-500' },
}

export default async function StudentTuitionPage() {
  const result = await getMyTuition()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Học phí</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hóa đơn học phí và lịch sử đóng tiền của bạn.
        </p>
      </div>

      {result.error !== undefined ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700">
          {result.error}
        </div>
      ) : (
        <>
          {/* Tổng quan */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <span className="inline-flex rounded-xl bg-emerald-50 p-2 text-emerald-600">
                <Banknote className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Đã đóng
              </p>
              <p className="font-heading text-lg font-bold">{vnd.format(result.totalPaid)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <span className="inline-flex rounded-xl bg-amber-50 p-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Còn lại
              </p>
              <p
                className={`font-heading text-lg font-bold ${result.totalOutstanding > 0 ? 'text-amber-600' : ''}`}
              >
                {vnd.format(result.totalOutstanding)}
              </p>
            </div>
          </div>

          {/* Danh sách hóa đơn */}
          {result.invoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <Wallet className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">Bạn chưa có hóa đơn học phí nào.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {result.invoices.map((invoice) => {
                const badge = STATUS_BADGE[invoice.status]
                return (
                  <div key={invoice.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-heading text-base font-bold">
                          {vnd.format(invoice.amount)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Phát hành {dateFmt.format(new Date(invoice.createdAt))}
                          {invoice.dueDate &&
                            ` · Hạn ${dateFmt.format(new Date(invoice.dueDate))}`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {invoice.status !== 'paid' && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Đã đóng {vnd.format(invoice.paid)}</span>
                          <span>
                            Còn {vnd.format(Math.max(0, invoice.amount - invoice.paid))}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.min(100, Math.round((invoice.paid / invoice.amount) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {invoice.note && (
                      <p className="mt-2 text-xs text-muted-foreground">{invoice.note}</p>
                    )}
                  </div>
                )
              })}
              <p className="text-center text-xs text-muted-foreground">
                {' '}
                Cần hỗ trợ về học phí? Liên hệ văn phòng cơ sở của bạn.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
