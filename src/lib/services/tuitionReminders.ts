import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// NHẮC HỌC PHÍ TỰ ĐỘNG (dùng chung cho Server Action + Cron)
//
// Quét hóa đơn pending/partial có hạn nộp trong vòng `daysAhead`
// ngày tới HOẶC đã quá hạn -> đẩy thông báo user_notifications
// tới học viên (Cổng Học viên đọc trực tiếp; Sổ Liên Lạc Phụ
// huynh đọc qua getParentNotices).
//
// CHỐNG SPAM: mỗi hóa đơn chỉ nhắc lại sau REMIND_COOLDOWN_DAYS
// ngày (tra ref_id trong user_notifications).
// ============================================================

const REMIND_COOLDOWN_DAYS = 3

const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

export type ReminderResult = {
  /** Số thông báo đã gửi */
  sent: number
  /** Số hóa đơn bỏ qua (đã nhắc gần đây / đã thu đủ) */
  skipped: number
  error?: string
}

/**
 * Gửi nhắc học phí cho các hóa đơn chưa thu đủ trong danh sách org.
 * `client` có thể là session client (staff bấm nút - RLS áp) hoặc
 * admin client (cron chạy nền).
 */
export async function sendTuitionRemindersForOrgs(
  client: SupabaseClient,
  orgIds: string[],
  opts: { daysAhead?: number } = {}
): Promise<ReminderResult> {
  const daysAhead = opts.daysAhead ?? 7
  if (orgIds.length === 0) return { sent: 0, skipped: 0 }

  try {
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + daysAhead)
    const horizonISO = horizon.toISOString().slice(0, 10)

    const { data: invoices, error } = await client
      .from('invoices')
      .select(
        'id, org_id, student_id, amount, due_date, status, note, payments(amount_paid, deleted_at)'
      )
      .in('org_id', orgIds)
      .in('status', ['pending', 'partial'])
      .not('due_date', 'is', null)
      .lte('due_date', horizonISO)
      .is('deleted_at', null)
      .limit(1000)

    if (error) return { sent: 0, skipped: 0, error: error.message }
    if (!invoices || invoices.length === 0) return { sent: 0, skipped: 0 }

    // Hóa đơn đã nhắc trong REMIND_COOLDOWN_DAYS ngày -> bỏ qua
    const cooldownSince = new Date()
    cooldownSince.setDate(cooldownSince.getDate() - REMIND_COOLDOWN_DAYS)
    const { data: recent } = await client
      .from('user_notifications')
      .select('ref_id')
      .eq('type', 'tuition_reminder')
      .in('ref_id', invoices.map((inv) => inv.id))
      .gte('created_at', cooldownSince.toISOString())
    const recentlyReminded = new Set((recent ?? []).map((r) => r.ref_id as string))

    const todayISO = new Date().toISOString().slice(0, 10)
    let skipped = 0
    const rows: {
      org_id: string
      recipient_id: string
      type: string
      title: string
      body: string
      link: string
      ref_id: string
    }[] = []

    for (const inv of invoices) {
      if (recentlyReminded.has(inv.id)) {
        skipped += 1
        continue
      }
      const paid = ((inv.payments ?? []) as { amount_paid: number; deleted_at: string | null }[])
        .filter((p) => p.deleted_at === null)
        .reduce((sum, p) => sum + Number(p.amount_paid), 0)
      const remaining = Number(inv.amount) - paid
      if (remaining <= 0) {
        skipped += 1
        continue
      }

      const dueLabel = new Date(`${inv.due_date}T00:00:00`).toLocaleDateString('vi-VN')
      const overdue = String(inv.due_date) < todayISO
      rows.push({
        org_id: inv.org_id,
        recipient_id: inv.student_id,
        type: 'tuition_reminder',
        title: overdue ? 'Học phí QUÁ HẠN - vui lòng thanh toán' : 'Nhắc nộp học phí',
        body: `${inv.note ? `${inv.note}: ` : ''}còn ${VND.format(remaining)} ${
          overdue ? `(quá hạn từ ${dueLabel})` : `- hạn nộp ${dueLabel}`
        }. Vui lòng liên hệ văn phòng hoặc chuyển khoản để hoàn tất.`,
        link: '/tuition',
        ref_id: inv.id,
      })
    }

    if (rows.length === 0) return { sent: 0, skipped }

    const { error: insertError } = await client.from('user_notifications').insert(rows)
    if (insertError) return { sent: 0, skipped, error: insertError.message }

    return { sent: rows.length, skipped }
  } catch (err) {
    return {
      sent: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : 'Lỗi không xác định',
    }
  }
}
