'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// BÁO CÁO DOANH THU (/admin/revenue)
// Nguồn số liệu:
//   - payments (tiền THU THỰC TẾ) -> doanh thu theo tháng/đơn vị
//   - invoices (hóa đơn)          -> tổng phát hành + công nợ
// Phạm vi: subtree của org user (RLS + lọc org_id tường minh);
// super_admin xem toàn hệ thống.
// ============================================================

export type RevenueOrgRow = {
  orgId: string
  orgName: string
  invoiced: number
  collected: number
  outstanding: number
  invoiceCount: number
}

export type RevenueMonthRow = {
  /** YYYY-MM */
  month: string
  collected: number
  paymentCount: number
}

export type RevenueReport = {
  totalInvoiced: number
  totalCollected: number
  totalOutstanding: number
  pendingInvoices: number
  byOrg: RevenueOrgRow[]
  byMonth: RevenueMonthRow[]
}

export type RevenueResult = { error: string } | { error?: undefined; report: RevenueReport }

export async function getRevenueReport(): Promise<RevenueResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    // Phạm vi: org của user + subtree (super_admin: org gốc HQ -> tất cả)
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile?.org_id) return { error: 'Tài khoản chưa gắn cơ sở.' }

    const { data: subtree, error: subtreeError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: profile.org_id }
    )
    if (subtreeError) return { error: `Lỗi đọc cây tổ chức: ${subtreeError.message}` }
    const orgIds = ((subtree as string[] | null) ?? [profile.org_id]).slice()
    if (!orgIds.includes(profile.org_id)) orgIds.push(profile.org_id)

    const [orgsRes, invoicesRes, paymentsRes] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds)
        .is('deleted_at', null),
      supabase
        .from('invoices')
        .select('org_id, amount, status')
        .in('org_id', orgIds)
        .neq('status', 'cancelled')
        .is('deleted_at', null),
      supabase
        .from('payments')
        .select('org_id, amount_paid, created_at')
        .in('org_id', orgIds)
        .is('deleted_at', null),
    ])

    if (invoicesRes.error) return { error: `Lỗi đọc hóa đơn: ${invoicesRes.error.message}` }
    if (paymentsRes.error) return { error: `Lỗi đọc phiếu thu: ${paymentsRes.error.message}` }

    const orgNameById = new Map((orgsRes.data ?? []).map((org) => [org.id, org.name]))

    // Gom theo đơn vị
    const byOrgMap = new Map<string, RevenueOrgRow>()
    function orgRow(orgId: string): RevenueOrgRow {
      let row = byOrgMap.get(orgId)
      if (!row) {
        row = {
          orgId,
          orgName: orgNameById.get(orgId) ?? 'Đơn vị',
          invoiced: 0,
          collected: 0,
          outstanding: 0,
          invoiceCount: 0,
        }
        byOrgMap.set(orgId, row)
      }
      return row
    }

    let totalInvoiced = 0
    let pendingInvoices = 0
    for (const invoice of invoicesRes.data ?? []) {
      const amount = Number(invoice.amount)
      totalInvoiced += amount
      const row = orgRow(invoice.org_id)
      row.invoiced += amount
      row.invoiceCount += 1
      if (invoice.status !== 'paid') pendingInvoices += 1
    }

    let totalCollected = 0
    const byMonthMap = new Map<string, RevenueMonthRow>()
    for (const payment of paymentsRes.data ?? []) {
      const paid = Number(payment.amount_paid)
      totalCollected += paid
      orgRow(payment.org_id).collected += paid

      const month = String(payment.created_at).slice(0, 7)
      const monthRow = byMonthMap.get(month) ?? { month, collected: 0, paymentCount: 0 }
      monthRow.collected += paid
      monthRow.paymentCount += 1
      byMonthMap.set(month, monthRow)
    }

    for (const row of byOrgMap.values()) {
      row.outstanding = Math.max(0, row.invoiced - row.collected)
    }

    const byOrg = [...byOrgMap.values()].sort((a, b) => b.collected - a.collected)
    const byMonth = [...byMonthMap.values()]
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, 12)

    return {
      report: {
        totalInvoiced,
        totalCollected,
        totalOutstanding: Math.max(0, totalInvoiced - totalCollected),
        pendingInvoices,
        byOrg,
        byMonth,
      },
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
