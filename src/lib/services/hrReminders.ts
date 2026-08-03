import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Nhắc HR hàng ngày: hết HĐ / hết thử việc (14 ngày) + sinh nhật
// trong 7 ngày. Gửi user_notifications tới campus_admin của org.
// ============================================================

type AdminClient = SupabaseClient

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function sendHrRemindersForOrgs(
  admin: AdminClient,
  orgIds: string[]
): Promise<{ sent: number; skipped: number; error?: string }> {
  let sent = 0
  let skipped = 0
  const today = new Date().toISOString().slice(0, 10)
  const until14 = addDays(today, 14)

  try {
    for (const orgId of orgIds) {
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('org_id', orgId)
        .eq('role', 'campus_admin')
        .is('deleted_at', null)
      const adminIds = (admins ?? []).map((a) => a.id)
      if (adminIds.length === 0) continue

      const { data: contracts } = await admin
        .from('teacher_contracts')
        .select('id, teacher_id, end_date, probation_end_date')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null)

      const teacherIds = [...new Set((contracts ?? []).map((c) => c.teacher_id))]
      const nameById = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await admin
          .from('profiles')
          .select('id, full_name')
          .in('id', teacherIds)
        for (const t of teachers ?? []) nameById.set(t.id, t.full_name)
      }

      for (const c of contracts ?? []) {
        const name = nameById.get(c.teacher_id) ?? 'Giảng viên'
        const payloads: { type: string; title: string; body: string; ref: string }[] = []
        if (c.end_date && c.end_date >= today && c.end_date <= until14) {
          payloads.push({
            type: 'hr_contract_end',
            title: `Sắp hết hạn HĐ: ${name}`,
            body: `Hợp đồng hết hạn ${c.end_date}. Kiểm tra gia hạn tại Lương & Hợp đồng.`,
            ref: c.id,
          })
        }
        if (
          c.probation_end_date &&
          c.probation_end_date >= today &&
          c.probation_end_date <= until14
        ) {
          payloads.push({
            type: 'hr_probation_end',
            title: `Sắp hết thử việc: ${name}`,
            body: `Thời gian thử việc kết thúc ${c.probation_end_date}.`,
            ref: `${c.id}:probation`,
          })
        }

        for (const p of payloads) {
          for (const uid of adminIds) {
            const { data: existing } = await admin
              .from('user_notifications')
              .select('id')
              .eq('recipient_id', uid)
              .eq('type', p.type)
              .eq('ref_id', p.ref)
              .gte('created_at', `${today}T00:00:00Z`)
              .limit(1)
            if (existing && existing.length > 0) {
              skipped += 1
              continue
            }
            const { error } = await admin.from('user_notifications').insert({
              recipient_id: uid,
              org_id: orgId,
              type: p.type,
              title: p.title,
              body: p.body,
              link: '/hr/contracts',
              ref_id: p.ref,
            })
            if (error) {
              // type check chưa chạy 072
              if (/type|check/i.test(error.message)) return { sent, skipped, error: error.message }
              skipped += 1
            } else sent += 1
          }
        }
      }

      // Sinh nhật 7 ngày
      const { data: people } = await admin
        .from('profiles')
        .select('id, full_name, date_of_birth')
        .eq('org_id', orgId)
        .neq('role', 'student')
        .is('deleted_at', null)
        .not('date_of_birth', 'is', null)

      for (let d = 0; d < 7; d++) {
        const day = addDays(today, d)
        const mmdd = day.slice(5, 10)
        for (const person of people ?? []) {
          const dob = person.date_of_birth as string
          if (dob.slice(5, 10) !== mmdd) continue
          const ref = `bday:${person.id}:${day.slice(0, 4)}`
          for (const uid of adminIds) {
            const { data: existing } = await admin
              .from('user_notifications')
              .select('id')
              .eq('recipient_id', uid)
              .eq('type', 'hr_birthday')
              .eq('ref_id', ref)
              .limit(1)
            if (existing && existing.length > 0) {
              skipped += 1
              continue
            }
            const { error } = await admin.from('user_notifications').insert({
              recipient_id: uid,
              org_id: orgId,
              type: 'hr_birthday',
              title: `Sinh nhật: ${person.full_name}`,
              body:
                d === 0
                  ? 'Sinh nhật hôm nay — gửi lời chúc từ nhà trường.'
                  : `Sinh nhật vào ${day} (còn ${d} ngày).`,
              link: '/hr/personnel',
              ref_id: ref,
            })
            if (error) {
              if (/type|check/i.test(error.message)) return { sent, skipped, error: error.message }
              skipped += 1
            } else sent += 1
          }
        }
      }
    }
    return { sent, skipped }
  } catch (e) {
    return {
      sent,
      skipped,
      error: e instanceof Error ? e.message : 'unknown',
    }
  }
}
