'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { paymentSchema, zodFail } from '@/lib/validation/schemas'

// ============================================================
// Tài chính - Học phí & Công nợ (Campus Admin / Staff)
// ============================================================

export type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'

export type InvoiceRow = {
  id: string
  code: string
  student_name: string
  org_name: string
  amount: number
  /** Tổng đã thu từ các phiếu thu */
  paid_total: number
  status: InvoiceStatus
  due_date: string | null
}

export type PaymentResult =
  | { error: string }
  | { error?: undefined; newStatus: InvoiceStatus; remaining: number }

// ---------- MOCK cho chế độ demo ----------
function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const MOCK_INVOICES: InvoiceRow[] = [
  {
    id: 'mock-inv1',
    code: 'HD-2607A1',
    student_name: 'Nguyễn Văn Toàn',
    org_name: 'Chi nhánh Cầu Giấy',
    amount: 4_500_000,
    paid_total: 0,
    status: 'pending',
    due_date: daysFromNow(-12), // QUÁ HẠN
  },
  {
    id: 'mock-inv2',
    code: 'HD-2607B4',
    student_name: 'Đỗ Thu Hà',
    org_name: 'Chi nhánh Đống Đa',
    amount: 6_000_000,
    paid_total: 2_000_000,
    status: 'partial',
    due_date: daysFromNow(-3), // QUÁ HẠN
  },
  {
    id: 'mock-inv3',
    code: 'HD-2607C9',
    student_name: 'Vũ Đức Mạnh',
    org_name: 'Chi nhánh Cầu Giấy',
    amount: 4_500_000,
    paid_total: 4_500_000,
    status: 'paid',
    due_date: daysFromNow(-20),
  },
  {
    id: 'mock-inv4',
    code: 'HD-2608D2',
    student_name: 'Hoàng Ngọc Lan',
    org_name: 'Cơ sở Hà Nội 1',
    amount: 8_200_000,
    paid_total: 4_000_000,
    status: 'partial',
    due_date: daysFromNow(15), // còn hạn
  },
  {
    id: 'mock-inv5',
    code: 'HD-2608E7',
    student_name: 'Trần Bảo Long',
    org_name: 'Chi nhánh Đống Đa',
    amount: 5_500_000,
    paid_total: 0,
    status: 'pending',
    due_date: daysFromNow(20), // còn hạn
  },
  {
    id: 'mock-inv6',
    code: 'HD-2606F0',
    student_name: 'Phạm Thị Mai',
    org_name: 'Cơ sở Hà Nội 1',
    amount: 3_800_000,
    paid_total: 0,
    status: 'cancelled',
    due_date: daysFromNow(-30),
  },
]

/**
 * Danh sách hóa đơn của org đang chọn + chi nhánh con/cháu,
 * kèm tổng tiền đã thu (SUM payments). Fallback demo khi DB trống.
 */
export async function getInvoices(
  orgId: string | null
): Promise<{ data: InvoiceRow[]; demo: boolean }> {
  if (!orgId) {
    return { data: MOCK_INVOICES, demo: true }
  }

  try {
    const supabase = createClient()

    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: orgId,
    })
    const orgIds: string[] = (subtree as string[] | null) ?? [orgId]

    const { data, error } = await supabase
      .from('invoices')
      .select(
        'id, amount, status, due_date, profiles(full_name), organizations(name), payments(amount_paid, deleted_at)'
      )
      .in('org_id', orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds])
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })

    if (error || !data || data.length === 0) {
      return { data: MOCK_INVOICES, demo: true }
    }

    const rows: InvoiceRow[] = data.map((row) => {
      const student = row.profiles as { full_name: string } | { full_name: string }[] | null
      const org = row.organizations as { name: string } | { name: string }[] | null
      const payments = (row.payments ?? []) as {
        amount_paid: number
        deleted_at: string | null
      }[]
      const paidTotal = payments
        .filter((p) => p.deleted_at === null)
        .reduce((sum, p) => sum + Number(p.amount_paid), 0)

      return {
        id: row.id,
        code: `HD-${row.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        student_name: Array.isArray(student)
          ? student[0]?.full_name ?? '—'
          : student?.full_name ?? '—',
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        amount: Number(row.amount),
        paid_total: paidTotal,
        status: row.status as InvoiceStatus,
        due_date: row.due_date,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: MOCK_INVOICES, demo: true }
  }
}

/**
 * Thu tiền một đợt cho hóa đơn (thu một phần hoặc toàn bộ).
 *
 * Luồng:
 * 1. Xác thực + double-check quyền: is_authorized(user, org của hóa đơn,
 *    'academic_staff') - Staff/Campus Admin trong đúng nhánh mới được thu.
 * 2. INSERT phiếu thu vào `payments`.
 * 3. SUM toàn bộ amount_paid của hóa đơn:
 *    - Tổng >= amount  -> UPDATE invoices.status = 'paid'
 *    - Tổng <  amount  -> UPDATE invoices.status = 'partial'
 */
export async function recordPayment(
  invoiceId: string,
  amount: number,
  paymentMethod: PaymentMethod
): Promise<PaymentResult> {
  // ===== QA GATE: mọi input qua Zod trước khi chạm Supabase =====
  const parsed = paymentSchema.safeParse({ invoiceId, amount, paymentMethod })
  if (!parsed.success) return zodFail(parsed.error)
  ;({ invoiceId, amount, paymentMethod } = parsed.data)

  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        error:
          'Bạn chưa đăng nhập. Chức năng thu tiền yêu cầu quyền Giáo vụ hoặc Campus Admin.',
      }
    }

    // Lấy hóa đơn (RLS đã giới hạn trong subtree của user)
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, org_id, amount, status')
      .eq('id', invoiceId)
      .is('deleted_at', null)
      .maybeSingle()

    if (invoiceError) {
      return { error: `Lỗi tải hóa đơn: ${invoiceError.message}` }
    }
    if (!invoice) {
      return { error: 'Hóa đơn không tồn tại hoặc bạn không có quyền xem.' }
    }
    if (invoice.status === 'paid') {
      return { error: 'Hóa đơn này đã thanh toán đủ.' }
    }
    if (invoice.status === 'cancelled') {
      return { error: 'Hóa đơn này đã bị hủy, không thể thu tiền.' }
    }

    // Double-check RBAC: quyền tối thiểu academic_staff trên org của hóa đơn
    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: invoice.org_id,
      p_required_role: 'academic_staff',
    })
    if (authorized !== true) {
      return {
        error: 'TỪ CHỐI: Bạn không có quyền thu tiền cho chi nhánh của hóa đơn này.',
      }
    }

    // Tổng đã thu TRƯỚC đợt này (chặn thu vượt số còn lại)
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('amount_paid')
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null)

    const paidBefore = (existingPayments ?? []).reduce(
      (sum, p) => sum + Number(p.amount_paid),
      0
    )
    const invoiceAmount = Number(invoice.amount)
    const remainingBefore = invoiceAmount - paidBefore

    if (amount > remainingBefore) {
      return {
        error: `Số tiền thu (${amount.toLocaleString('vi-VN')}đ) vượt quá số còn lại của hóa đơn (${remainingBefore.toLocaleString('vi-VN')}đ).`,
      }
    }

    // ===== 1. INSERT phiếu thu =====
    const { error: paymentError } = await supabase.from('payments').insert({
      org_id: invoice.org_id,
      invoice_id: invoiceId,
      amount_paid: amount,
      payment_method: paymentMethod,
      recorded_by: user.id,
    })

    if (paymentError) {
      return { error: `Lỗi lưu phiếu thu: ${paymentError.message}` }
    }

    // ===== 2. Tính lại tổng và cập nhật trạng thái =====
    const paidTotal = paidBefore + amount
    const newStatus: InvoiceStatus = paidTotal >= invoiceAmount ? 'paid' : 'partial'

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: newStatus })
      .eq('id', invoiceId)

    if (updateError) {
      return { error: `Đã lưu phiếu thu nhưng lỗi cập nhật hóa đơn: ${updateError.message}` }
    }

    revalidatePath('/finance/invoices')
    return { newStatus, remaining: invoiceAmount - paidTotal }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}
