import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTuitionRemindersForOrgs } from '@/lib/services/tuitionReminders'

export const dynamic = 'force-dynamic'

// ============================================================
// CRON NHẮC HỌC PHÍ TỰ ĐỘNG (chạy hằng ngày qua Vercel Cron).
// vercel.json: { "crons": [{ "path": "/api/cron/tuition-reminders",
//                            "schedule": "0 1 * * *" }] }
// Bảo vệ bằng CRON_SECRET (Vercel tự gắn Authorization: Bearer).
// Quét TOÀN BỘ cơ sở, đẩy thông báo tới học viên có hóa đơn
// quá hạn / đến hạn trong 7 ngày - chống nhắc trùng theo ref_id.
// ============================================================

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data: orgs, error } = await admin
      .from('organizations')
      .select('id')
      .is('deleted_at', null)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = await sendTuitionRemindersForOrgs(
      admin,
      (orgs ?? []).map((o) => o.id)
    )
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true, sent: result.sent, skipped: result.skipped })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
