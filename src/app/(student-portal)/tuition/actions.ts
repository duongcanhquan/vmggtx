'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// HỌC PHÍ CỦA CHÍNH HỌC VIÊN (/tuition)
// RLS invoices_student_own / payments_student_own (migration 024)
// đảm bảo học viên CHỈ đọc được hóa đơn của mình.
// ============================================================

export type MyInvoice = {
  id: string
  amount: number
  paid: number
  status: 'pending' | 'partial' | 'paid' | 'cancelled'
  dueDate: string | null
  note: string | null
  createdAt: string
}

export type MyTuitionResult =
  | { error: string }
  | {
      error?: undefined
      invoices: MyInvoice[]
      totalAmount: number
      totalPaid: number
      totalOutstanding: number
    }

export async function getMyTuition(): Promise<MyTuitionResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, amount, status, due_date, note, created_at')
      .eq('student_id', user.id)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) return { error: `Không tải được hóa đơn: ${error.message}` }

    const invoiceIds = (invoices ?? []).map((invoice) => invoice.id)
    const paidByInvoice = new Map<string, number>()
    if (invoiceIds.length > 0) {
      const { data: payments } = await supabase
        .from('payments')
        .select('invoice_id, amount_paid')
        .in('invoice_id', invoiceIds)
        .is('deleted_at', null)
      for (const payment of payments ?? []) {
        paidByInvoice.set(
          payment.invoice_id,
          (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount_paid)
        )
      }
    }

    let totalAmount = 0
    let totalPaid = 0
    const rows: MyInvoice[] = (invoices ?? []).map((invoice) => {
      const amount = Number(invoice.amount)
      const paid = paidByInvoice.get(invoice.id) ?? 0
      totalAmount += amount
      totalPaid += paid
      return {
        id: invoice.id,
        amount,
        paid,
        status: invoice.status as MyInvoice['status'],
        dueDate: invoice.due_date,
        note: invoice.note,
        createdAt: invoice.created_at,
      }
    })

    return {
      invoices: rows,
      totalAmount,
      totalPaid,
      totalOutstanding: Math.max(0, totalAmount - totalPaid),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
