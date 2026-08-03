import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendHrRemindersForOrgs } from '@/lib/services/hrReminders'

export const dynamic = 'force-dynamic'

// Cron hàng ngày: nhắc hết HĐ / thử việc / sinh nhật tuần.
// vercel.json schedule: 15 1 * * * (sau tuition-reminders).

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

    const result = await sendHrRemindersForOrgs(
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
