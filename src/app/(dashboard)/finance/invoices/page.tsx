'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertTriangle,
  Banknote,
  BellRing,
  FilePlus2,
  Loader2,
  Printer,
  Trash2,
  X,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { SmartTable, sortableHeader } from '@/components/shared/SmartTable'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { printReceipt } from '@/lib/utils/printReceipt'
import {
  cancelInvoice,
  createInvoice,
  getInvoices,
  getStudentsForInvoice,
  recordPayment,
  sendTuitionReminders,
  type InvoiceRow,
  type PaymentMethod,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { ModuleAiInline } from '@/components/ai/ModuleAiInline'
import { AiDraftButton } from '@/components/ai/AiDraftButton'

// ============================================================
// Quản lý Học phí & Công nợ (/finance/invoices)
// - SmartTable: hóa đơn của org đang chọn + chi nhánh con.
// - Dòng pending/partial QUÁ HẠN được highlight đỏ nhạt.
// - "Thu tiền" mở Sheet trượt từ phải (tự dựng - Shadcn chưa cài),
//   thu một phần hoặc toàn bộ qua Server Action recordPayment.
// ============================================================

const STATUS_BADGE: Record<InvoiceRow['status'], { label: string; className: string }> = {
  pending: { label: 'Chờ thu', className: 'bg-slate-100 text-slate-700' },
  partial: { label: 'Thu một phần', className: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Đã thanh toán', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Đã hủy', className: 'bg-rose-50 text-rose-700' },
}

const CURRENCY = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

function isOverdue(invoice: InvoiceRow): boolean {
  if (invoice.status !== 'pending' && invoice.status !== 'partial') return false
  if (!invoice.due_date) return false
  return new Date(`${invoice.due_date}T23:59:59`) < new Date()
}

// ---------- Tuổi nợ (aging) ----------
type AgingBucket = 'current' | 'b7' | 'b30' | 'b30plus'

const AGING_META: Record<AgingBucket, { label: string; className: string; activeClassName: string }> = {
  current: {
    label: 'Chưa đến hạn',
    className: 'border-border bg-surface text-foreground',
    activeClassName: 'border-indigo-400 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200',
  },
  b7: {
    label: 'Quá hạn 0–7 ngày',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    activeClassName: 'border-amber-400 bg-amber-100 text-amber-900 ring-2 ring-amber-200',
  },
  b30: {
    label: 'Quá hạn 8–30 ngày',
    className: 'border-orange-200 bg-orange-50 text-orange-800',
    activeClassName: 'border-orange-400 bg-orange-100 text-orange-900 ring-2 ring-orange-200',
  },
  b30plus: {
    label: 'Quá hạn >30 ngày',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
    activeClassName: 'border-rose-400 bg-rose-100 text-rose-900 ring-2 ring-rose-200',
  },
}

/** Phân loại hóa đơn còn nợ theo số ngày quá hạn (null = không có nợ) */
function agingBucket(invoice: InvoiceRow): AgingBucket | null {
  if (invoice.status !== 'pending' && invoice.status !== 'partial') return null
  if (invoice.amount - invoice.paid_total <= 0) return null
  if (!invoice.due_date) return 'current'
  const overdueDays = Math.floor(
    (Date.now() - new Date(`${invoice.due_date}T23:59:59`).getTime()) / 86_400_000
  )
  if (overdueDays < 0) return 'current'
  if (overdueDays <= 7) return 'b7'
  if (overdueDays <= 30) return 'b30'
  return 'b30plus'
}

function formatDueDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Thông báo lỗi đỏ hiển thị NGAY dưới ô input sai */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

type PaymentFormValues = { amount: number; paymentMethod: PaymentMethod }

// ---------- Sheet trượt từ phải ----------
function PaymentSheet({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: InvoiceRow
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printAfter, setPrintAfter] = useState(true)

  const remaining = invoice.amount - invoice.paid_total

  // Schema động theo số tiền còn lại của hóa đơn - validate TRƯỚC khi Submit
  const paymentFormSchema = useMemo(
    () =>
      z.object({
        amount: z
          .number({ invalid_type_error: 'Số tiền thu phải là số.' })
          .positive('Số tiền thu phải lớn hơn 0.')
          .max(remaining, `Số tiền vượt quá số còn lại (${CURRENCY.format(remaining)}).`),
        paymentMethod: z.enum(['cash', 'transfer'], {
          errorMap: () => ({ message: 'Phương thức thanh toán không hợp lệ.' }),
        }),
      }),
    [remaining]
  )

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { amount: remaining, paymentMethod: 'cash' },
  })
  const method = watch('paymentMethod')

  // Kích hoạt animation trượt vào sau khi mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  function close() {
    setVisible(false)
    setTimeout(onClose, 300) // đợi animation trượt ra
  }

  // Chỉ chạy khi client-side đã pass toàn bộ Zod (server vẫn validate lần 2)
  async function onValid({ amount, paymentMethod }: PaymentFormValues) {
    setError(null)

    setSaving(true)
    const result = await recordPayment(invoice.id, amount, paymentMethod)
    setSaving(false)

    if (result.error !== undefined) {
      setError(result.error)
      return
    }

    // In biên lai (cửa sổ in của trình duyệt -> có thể Save as PDF)
    if (printAfter) {
      printReceipt({
        invoiceCode: invoice.code,
        studentName: invoice.student_name,
        orgName: invoice.org_name,
        amountPaid: amount,
        paymentMethod,
        invoiceTotal: invoice.amount,
        paidTotal: invoice.paid_total + amount,
        remaining: result.remaining,
      })
    }

    onSaved(
      result.newStatus === 'paid'
        ? `Đã thu ${CURRENCY.format(amount)}. Hóa đơn ${invoice.code} THANH TOÁN ĐỦ.`
        : `Đã thu ${CURRENCY.format(amount)}. Còn lại ${CURRENCY.format(result.remaining)} (thu một phần).`
    )
    close()
  }

  const badge = STATUS_BADGE[invoice.status]

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      {/* Overlay */}
      <button
        type="button"
        aria-label="Đóng"
        onClick={close}
        className={`absolute inset-0 cursor-pointer bg-black/50 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panel trượt từ phải */}
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md transform flex-col bg-surface shadow-2xl transition-transform duration-300 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="sheet-title" className="font-heading text-lg font-bold">
            Thu tiền · {invoice.code}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={close}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ===== Chi tiết hóa đơn ===== */}
          <dl className="space-y-3 rounded-2xl border border-border bg-background p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Học viên</dt>
              <dd className="font-medium text-foreground">{invoice.student_name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Cơ sở</dt>
              <dd className="text-foreground">{invoice.org_name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Hạn nộp</dt>
              <dd className={isOverdue(invoice) ? 'font-semibold text-rose-600' : 'text-foreground'}>
                {formatDueDate(invoice.due_date)}
                {isOverdue(invoice) && ' (quá hạn)'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Trạng thái</dt>
              <dd>
                <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
              </dd>
            </div>
            <hr className="border-border" />
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Tổng hóa đơn</dt>
              <dd className="font-semibold text-foreground">{CURRENCY.format(invoice.amount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Đã thu</dt>
              <dd className="text-emerald-700">{CURRENCY.format(invoice.paid_total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-foreground">Còn lại</dt>
              <dd className="font-heading text-lg font-bold text-primary">
                {CURRENCY.format(remaining)}
              </dd>
            </div>
          </dl>

          {/* ===== Form thu tiền ===== */}
          <form onSubmit={handleSubmit(onValid)} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="pay-amount" className="mb-1.5 block text-sm font-medium">
                Số tiền thu đợt này (VND) <span className="text-destructive">*</span>
              </label>
              <input
                id="pay-amount"
                type="number"
                step={1000}
                aria-invalid={!!errors.amount}
                className={`min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  errors.amount ? 'border-red-400 focus-visible:ring-red-400' : ''
                }`}
                {...register('amount', { valueAsNumber: true })}
              />
              <FieldError message={errors.amount?.message} />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setValue('amount', Math.round(remaining / 2), { shouldValidate: true })
                  }
                  className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Thu 50%
                </button>
                <button
                  type="button"
                  onClick={() => setValue('amount', remaining, { shouldValidate: true })}
                  className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Thu toàn bộ
                </button>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium">
                Phương thức thanh toán <span className="text-destructive">*</span>
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { value: 'cash', label: 'Tiền mặt' },
                    { value: 'transfer', label: 'Chuyển khoản' },
                  ] as { value: PaymentMethod; label: string }[]
                ).map((option) => (
                  <label
                    key={option.value}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition-colors duration-150 ${
                      method === option.value
                        ? 'border-indigo-300 bg-indigo-50 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-indigo-50/60'
                    }`}
                  >
                    <input
                      type="radio"
                      value={option.value}
                      className="sr-only"
                      {...register('paymentMethod')}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <FieldError message={errors.paymentMethod?.message} />
            </div>

            {/* ===== In biên lai sau khi thu ===== */}
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={printAfter}
                onChange={(e) => setPrintAfter(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-indigo-600"
              />
              <Printer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              In biên lai sau khi thu (có thể lưu PDF)
            </label>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Banknote className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu phiếu thu…' : 'Xác nhận thu tiền'}
            </button>
          </form>
        </div>
      </aside>
    </div>
  )
}

// ---------- Sheet tạo hóa đơn thủ công ----------
function CreateInvoiceSheet({
  orgId,
  onClose,
  onSaved,
}: {
  orgId: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [students, setStudents] = useState<{ id: string; name: string }[]>([])
  const [studentId, setStudentId] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    void getStudentsForInvoice(orgId).then(setStudents)
    return () => cancelAnimationFrame(raf)
  }, [orgId])

  function close() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  async function submit() {
    setError(null)
    const parsedAmount = Number(amount)
    if (!studentId) {
      setError('Vui lòng chọn học viên.')
      return
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Số tiền phải là số lớn hơn 0.')
      return
    }
    setSaving(true)
    const result = await createInvoice(studentId, parsedAmount, dueDate || null, note)
    setSaving(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onSaved(`Đã tạo hóa đơn ${CURRENCY.format(parsedAmount)}.`)
    close()
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Đóng"
        onClick={close}
        className={`absolute inset-0 cursor-pointer bg-black/50 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md transform flex-col bg-surface shadow-2xl transition-transform duration-300 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-heading text-lg font-bold">Tạo hóa đơn học phí</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={close}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
            Dùng cho các khoản phát sinh: học phí đợt mới, học lại, tài liệu, phí thi…
          </p>

          <label className="block text-sm font-medium">
            Học viên <span className="text-destructive">*</span>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— Chọn học viên —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Số tiền (VND) <span className="text-destructive">*</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="VD: 4500000"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="block text-sm font-medium">
            Hạn nộp
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="block text-sm font-medium">
            <span className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              Nội dung khoản thu
              <AiDraftButton
                orgId={orgId}
                draftMode="invoice_note"
                label="AI soạn"
                contextHint={`Số tiền: ${amount || '…'} VND. Hạn: ${dueDate || 'chưa chọn'}. Học viên id: ${studentId || 'chưa chọn'}.`}
                onDraft={(text) => setNote(text.replace(/\n/g, ' ').slice(0, 300))}
                onError={(message) => setError(message)}
              />
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="VD: Học phí khóa Toán 12 - đợt 2"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Đang tạo…' : 'Tạo hóa đơn'}
          </button>
        </div>
      </aside>
    </div>
  )
}

// ---------- Trang chính ----------
export default function InvoicesPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sheetInvoice, setSheetInvoice] = useState<InvoiceRow | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [reminding, setReminding] = useState(false)
  const [agingFilter, setAgingFilter] = useState<AgingBucket | null>(null)

  // Tổng hợp công nợ (tính trên dữ liệu đang xem, bỏ hóa đơn hủy)
  const summary = useMemo(() => {
    const active = invoices.filter((inv) => inv.status !== 'cancelled')
    const total = active.reduce((sum, inv) => sum + inv.amount, 0)
    const collected = active.reduce((sum, inv) => sum + inv.paid_total, 0)
    const overdueAmount = active
      .filter(isOverdue)
      .reduce((sum, inv) => sum + (inv.amount - inv.paid_total), 0)
    return {
      total,
      collected,
      remaining: total - collected,
      overdueAmount,
      overdueCount: active.filter(isOverdue).length,
    }
  }, [invoices])

  // Báo cáo tuổi nợ: gom hóa đơn còn nợ theo số ngày quá hạn
  const aging = useMemo(() => {
    const buckets: Record<AgingBucket, { count: number; amount: number }> = {
      current: { count: 0, amount: 0 },
      b7: { count: 0, amount: 0 },
      b30: { count: 0, amount: 0 },
      b30plus: { count: 0, amount: 0 },
    }
    for (const inv of invoices) {
      const bucket = agingBucket(inv)
      if (!bucket) continue
      buckets[bucket].count += 1
      buckets[bucket].amount += inv.amount - inv.paid_total
    }
    return buckets
  }, [invoices])

  const visibleInvoices = useMemo(
    () =>
      agingFilter
        ? invoices.filter((inv) => agingBucket(inv) === agingFilter)
        : invoices,
    [invoices, agingFilter]
  )

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const result = await getInvoices(currentOrgId)
    setInvoices(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [currentOrgId])

  const handleRemind = useCallback(async () => {
    if (!currentOrgId) return
    setReminding(true)
    const result = await sendTuitionReminders(currentOrgId)
    setReminding(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message:
        result.sent > 0
          ? `Đã gửi nhắc học phí tới ${result.sent} học viên (bỏ qua ${result.skipped} hóa đơn đã nhắc gần đây).`
          : 'Không có hóa đơn nào cần nhắc (đã nhắc trong 3 ngày qua hoặc chưa đến kỳ hạn).',
    })
  }, [currentOrgId])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const handleCancelInvoice = useCallback(
    async (invoice: InvoiceRow) => {
      const result = await cancelInvoice(invoice.id)
      if (result.error !== undefined) {
        setToast({ type: 'error', message: result.error })
        return
      }
      setToast({ type: 'success', message: `Đã hủy hóa đơn ${invoice.code}.` })
      void loadInvoices()
    },
    [loadInvoices]
  )

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: 'code',
        meta: { label: 'Mã HĐ' },
        header: sortableHeader<InvoiceRow>('Mã HĐ'),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-indigo-700">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'student_name',
        meta: { label: 'Học viên' },
        header: sortableHeader<InvoiceRow>('Học viên'),
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.student_name}</span>
        ),
      },
      {
        accessorKey: 'org_name',
        meta: { label: 'Cơ sở' },
        header: sortableHeader<InvoiceRow>('Cơ sở'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.org_name}</span>
        ),
      },
      {
        accessorKey: 'amount',
        meta: { label: 'Số tiền' },
        header: sortableHeader<InvoiceRow>('Số tiền'),
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">
            {CURRENCY.format(row.original.amount)}
          </span>
        ),
      },
      {
        id: 'remaining',
        meta: { label: 'Còn lại' },
        header: 'Còn lại',
        cell: ({ row }) => {
          const remaining = row.original.amount - row.original.paid_total
          return (
            <span className={remaining > 0 ? 'font-medium text-rose-600' : 'text-emerald-700'}>
              {CURRENCY.format(remaining)}
            </span>
          )
        },
      },
      {
        accessorKey: 'due_date',
        meta: { label: 'Hạn nộp' },
        header: sortableHeader<InvoiceRow>('Hạn nộp'),
        cell: ({ row }) => {
          const overdue = isOverdue(row.original)
          return (
            <span className={overdue ? 'inline-flex items-center gap-1 font-semibold text-rose-600' : 'text-muted-foreground'}>
              {overdue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {formatDueDate(row.original.due_date)}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        meta: { label: 'Trạng thái' },
        header: 'Trạng thái',
        cell: ({ row }) => {
          const badge = STATUS_BADGE[row.original.status]
          return (
            <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          )
        },
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => {
          const collectible =
            row.original.status === 'pending' || row.original.status === 'partial'
          if (!collectible) return null
          const cancellable = row.original.status === 'pending' && row.original.paid_total === 0
          return (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSheetInvoice(row.original)}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                Thu tiền
              </button>
              {cancellable && (
                <button
                  type="button"
                  title="Hủy hóa đơn (chưa có phiếu thu)"
                  onClick={() => void handleCancelInvoice(row.original)}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Hủy
                </button>
              )}
            </div>
          )
        },
      },
    ],
    [handleCancelInvoice]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Học phí &amp; Công nợ
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dòng đỏ nhạt là công nợ quá hạn.
          </p>
        </div>
        {currentOrgId && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleRemind()}
              disabled={reminding}
              title="Đẩy thông báo nhắc học phí tới Cổng Học viên & Sổ Liên Lạc Phụ huynh"
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reminding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BellRing className="h-4 w-4" aria-hidden="true" />
              )}
              {reminding ? 'Đang gửi nhắc…' : 'Nhắc học phí'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              Tạo hóa đơn
            </button>
          </div>
        )}
      </div>

      <ModuleAiInline moduleKey="finance" />

      {/* ===== Thẻ tổng hợp công nợ ===== */}
      {!loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Tổng phải thu', value: CURRENCY.format(summary.total), tone: 'text-foreground' },
            { label: 'Đã thu', value: CURRENCY.format(summary.collected), tone: 'text-emerald-700' },
            { label: 'Còn nợ', value: CURRENCY.format(summary.remaining), tone: 'text-amber-700' },
            {
              label: `Quá hạn (${summary.overdueCount} HĐ)`,
              value: CURRENCY.format(summary.overdueAmount),
              tone: 'text-rose-600',
            },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <p className={`mt-1 font-heading text-lg font-bold ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ===== Báo cáo tuổi nợ (bấm để lọc bảng) ===== */}
      {!loading && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Báo cáo tuổi nợ — bấm ô để lọc danh sách
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(AGING_META) as AgingBucket[]).map((bucket) => {
              const meta = AGING_META[bucket]
              const stats = aging[bucket]
              const active = agingFilter === bucket
              return (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAgingFilter(active ? null : bucket)}
                  className={`cursor-pointer rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? meta.activeClassName : meta.className
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                    {meta.label}
                  </p>
                  <p className="mt-1 font-heading text-lg font-bold">
                    {CURRENCY.format(stats.amount)}
                  </p>
                  <p className="mt-0.5 text-xs opacity-70">{stats.count} hóa đơn</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {loading ? (
        <FunLoader label="Đang tải danh sách hóa đơn…" />
      ) : (
        <SmartTable
          columns={columns}
          data={visibleInvoices}
          searchKey="student_name"
          searchPlaceholder="Tìm theo tên học viên…"
          emptyMessage="Chưa có hóa đơn nào trong phạm vi này."
          viewKey="invoices_page_view"
          rowClassName={(invoice) =>
            isOverdue(invoice) ? 'bg-rose-50/60 hover:bg-rose-50' : ''
          }
        />
      )}

      {showCreate && currentOrgId && (
        <CreateInvoiceSheet
          orgId={currentOrgId}
          onClose={() => setShowCreate(false)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            loadInvoices()
          }}
        />
      )}

      {sheetInvoice && (
        <PaymentSheet
          invoice={sheetInvoice}
          onClose={() => setSheetInvoice(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            loadInvoices()
          }}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
