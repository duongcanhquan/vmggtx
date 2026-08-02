'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Receipt, Wallet } from 'lucide-react'
import {
  getParentStudent,
  getParentTuition,
  type ParentTuition,
} from '../../actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { readLoginPortal } from '@/lib/auth/loginPortal'

// ============================================================
// Học phí (tab Học phí) - phụ huynh xem hóa đơn, đã đóng bao
// nhiêu, còn nợ bao nhiêu, khoản nào QUÁ HẠN cần đóng ngay.
// ============================================================

const CURRENCY = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Chờ đóng', className: 'bg-amber-50 text-amber-700' },
  partial: { label: 'Đóng một phần', className: 'bg-sky-50 text-sky-700' },
  paid: { label: 'Đã đóng đủ', className: 'bg-emerald-50 text-emerald-700' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN')
}

export default function ParentTuitionPage() {
  const router = useRouter()
  const [tuition, setTuition] = useState<ParentTuition | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Chạy song song: action dữ liệu tự xác thực phiên phụ huynh server-side
      const [student, data] = await Promise.all([
        getParentStudent(),
        getParentTuition(),
      ])
      if (cancelled) return
      if (!student) {
        router.replace(readLoginPortal() ?? '/parent/login')
        return
      }
      setTuition(data)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loading || !tuition) {
    return <FunLoader label="Đang tải thông tin học phí…" />
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight">
        <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
        Học phí
      </h1>

      {/* ===== Tổng quan ===== */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Đã đóng
          </p>
          <p className="mt-1 font-heading text-base font-bold text-emerald-700">
            {CURRENCY.format(tuition.totalPaid)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Còn lại
          </p>
          <p
            className={`mt-1 font-heading text-base font-bold ${
              tuition.totalRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {CURRENCY.format(tuition.totalRemaining)}
          </p>
        </div>
      </div>

      {tuition.overdueRemaining > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Có khoản <strong>{CURRENCY.format(tuition.overdueRemaining)}</strong> đã QUÁ HẠN.
            Kính mong phụ huynh sắp xếp đóng sớm hoặc liên hệ văn phòng để được hỗ trợ.
          </span>
        </div>
      )}

      {/* ===== Danh sách hóa đơn ===== */}
      {tuition.invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Chưa có hóa đơn học phí nào.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tuition.invoices.map((invoice) => {
            const badge = STATUS_BADGE[invoice.status] ?? STATUS_BADGE.pending
            const remaining = invoice.amount - invoice.paidTotal
            return (
              <li
                key={invoice.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  invoice.overdue ? 'border-rose-200 bg-rose-50/70' : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-indigo-700">
                    {invoice.code}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                {invoice.note && (
                  <p className="mt-1.5 text-sm font-medium text-foreground">{invoice.note}</p>
                )}
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Số tiền</dt>
                    <dd className="font-semibold">{CURRENCY.format(invoice.amount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Đã đóng</dt>
                    <dd className="text-emerald-700">{CURRENCY.format(invoice.paidTotal)}</dd>
                  </div>
                  {remaining > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Còn lại</dt>
                      <dd className="font-semibold text-rose-600">
                        {CURRENCY.format(remaining)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Hạn nộp</dt>
                    <dd
                      className={
                        invoice.overdue ? 'font-semibold text-rose-600' : 'text-foreground'
                      }
                    >
                      {formatDate(invoice.dueDate)}
                      {invoice.overdue && ' (quá hạn)'}
                    </dd>
                  </div>
                </dl>
                {invoice.status === 'paid' && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Đã hoàn thành — cảm ơn quý phụ huynh!
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
