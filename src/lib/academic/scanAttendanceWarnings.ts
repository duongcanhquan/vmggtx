import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSetting } from '@/lib/utils/settingsResolver'

// ============================================================
// [QA-FIX B] Quét cảnh báo chuyên cần — core NỘI BỘ (không export
// từ 'use server'). Caller PHẢI đã xác thực quyền trước khi gọi.
// ============================================================

const ABSENCE_RATIO_EARLY = 0.15
const ABSENCE_RATIO_DANGER = 0.25

type WarningSeverity = 'early' | 'danger'

type WarningCandidate = {
  student_id: string
  class_id: string
  org_id: string
  warning_type: 'attendance'
  severity: WarningSeverity
  description: string
  metric_value: number | null
}

async function getSubtreeOrgIds(orgId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_descendant_org_ids', {
    p_org_id: orgId,
  })
  if (error) throw error
  return (data ?? []).map((row: { id?: string } | string) =>
    typeof row === 'string' ? row : (row.id as string)
  )
}

async function upsertWarningCandidates(
  orgIds: string[],
  candidates: WarningCandidate[]
): Promise<{ error?: string }> {
  if (candidates.length === 0) return {}
  const supabase = createAdminClient()

  const { data: existing, error: existingError } = await supabase
    .from('student_warnings')
    .select('id, student_id, class_id, warning_type, status')
    .in('org_id', orgIds)
    .is('deleted_at', null)
  if (existingError) {
    return { error: `Lỗi đọc cảnh báo cũ: ${existingError.message}` }
  }

  const existingByKey = new Map(
    (existing ?? []).map((w) => [
      `${w.student_id}|${w.class_id}|${w.warning_type}`,
      w,
    ])
  )

  for (const candidate of candidates) {
    const key = `${candidate.student_id}|${candidate.class_id}|${candidate.warning_type}`
    const row = existingByKey.get(key)

    const payload: Record<string, unknown> = {
      description: candidate.description,
      severity: candidate.severity,
      metric_value: candidate.metric_value,
    }

    if (row) {
      const { error: updateError } = await supabase
        .from('student_warnings')
        .update(payload)
        .eq('id', row.id)
      if (updateError) {
        if (/severity|metric_value|42703|column/i.test(updateError.message)) {
          await supabase
            .from('student_warnings')
            .update({ description: candidate.description })
            .eq('id', row.id)
        } else {
          return { error: `Lỗi cập nhật cảnh báo: ${updateError.message}` }
        }
      }
    } else {
      const { error: insertError } = await supabase.from('student_warnings').insert({
        org_id: candidate.org_id,
        student_id: candidate.student_id,
        class_id: candidate.class_id,
        warning_type: candidate.warning_type,
        description: candidate.description,
        status: 'new',
        severity: candidate.severity,
        metric_value: candidate.metric_value,
      })
      if (insertError) {
        if (/severity|metric_value|42703|column/i.test(insertError.message)) {
          const legacy = await supabase.from('student_warnings').insert({
            org_id: candidate.org_id,
            student_id: candidate.student_id,
            class_id: candidate.class_id,
            warning_type: candidate.warning_type,
            description: candidate.description,
            status: 'new',
          })
          if (legacy.error) {
            return { error: `Lỗi tạo cảnh báo: ${legacy.error.message}` }
          }
        } else {
          return { error: `Lỗi tạo cảnh báo: ${insertError.message}` }
        }
      }
    }
  }
  return {}
}

/**
 * Quét chuyên cần + upsert student_warnings.
 * Chỉ gọi từ server đã authz (điểm danh / runEarlyWarningSystem / action có gate).
 */
export async function scanAttendanceWarningsCore(
  orgId: string
): Promise<{ error: string } | { error?: undefined; count: number }> {
  try {
    const admin = createAdminClient()
    const orgIds = await getSubtreeOrgIds(orgId)

    const [{ value: dangerRaw }, { value: earlyRaw }] = await Promise.all([
      resolveSetting('max_absence_warning', orgId),
      resolveSetting('absence_early_warning', orgId),
    ])
    let dangerLimit = Math.max(1, Number(dangerRaw) || 3)
    let earlyLimit = Math.max(1, Number(earlyRaw) || 2)
    if (earlyLimit >= dangerLimit) earlyLimit = Math.max(1, dangerLimit - 1)

    const { data: stats, error: statsError } = await admin
      .from('vw_student_attendance_stats')
      .select(
        'student_id, class_id, org_id, total_sessions, excused_count, unexcused_count'
      )
      .in('org_id', orgIds)
    if (statsError) {
      return { error: `Lỗi đọc thống kê điểm danh: ${statsError.message}` }
    }

    const candidates: WarningCandidate[] = []
    for (const stat of stats ?? []) {
      const unexcused = Number(stat.unexcused_count)
      const totalAbsent = Number(stat.excused_count) + unexcused
      const totalSessions = Number(stat.total_sessions)
      const ratio = totalSessions > 0 ? totalAbsent / totalSessions : 0

      let severity: WarningSeverity | null = null
      if (unexcused >= dangerLimit || ratio > ABSENCE_RATIO_DANGER) {
        severity = 'danger'
      } else if (unexcused >= earlyLimit || ratio > ABSENCE_RATIO_EARLY) {
        severity = 'early'
      }
      if (!severity) continue

      const reasons: string[] = []
      if (unexcused >= earlyLimit) {
        reasons.push(
          `vắng không phép ${unexcused} buổi (sớm≥${earlyLimit}, nguy hiểm≥${dangerLimit})`
        )
      }
      if (ratio > ABSENCE_RATIO_EARLY) {
        reasons.push(
          `tổng vắng ${totalAbsent}/${totalSessions} buổi (${Math.round(ratio * 100)}%)`
        )
      }
      candidates.push({
        student_id: stat.student_id,
        class_id: stat.class_id,
        org_id: stat.org_id,
        warning_type: 'attendance',
        severity,
        description: `Chuyên cần [${severity === 'danger' ? 'NGUY HIỂM' : 'SỚM'}]: ${reasons.join('; ')}.`,
        metric_value: unexcused,
      })
    }

    const upserted = await upsertWarningCandidates(orgIds, candidates)
    if (upserted.error !== undefined) return { error: upserted.error }
    return { count: candidates.length }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Lỗi quét cảnh báo chuyên cần.',
    }
  }
}
