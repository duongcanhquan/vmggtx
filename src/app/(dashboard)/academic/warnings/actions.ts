'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  notifyParentWarningsToN8n,
  type ParentWarningNotification,
} from '@/lib/integrations/n8n'
import { resolveSetting } from '@/lib/utils/settingsResolver'
import { assertOrgAiReady, AI_NOT_ACTIVATED_MESSAGE } from '@/lib/ai/assertOrgAiReady'
import { requiredId, zodFail } from '@/lib/validation/schemas'
import { scanAttendanceWarningsCore } from '@/lib/academic/scanAttendanceWarnings'
import { z } from 'zod'

// ============================================================
// Cảnh báo học vụ — vận hành đầy đủ (055)
// severity: early | danger (theo ngưỡng org_settings)
// status: new → notified → in_progress → resolved
// ============================================================

export type WarningType = 'attendance' | 'grade'
export type WarningStatus = 'new' | 'notified' | 'in_progress' | 'resolved'
export type WarningSeverity = 'early' | 'danger'

export type WarningRow = {
  id: string
  student_id: string
  student_name: string
  student_phone: string | null
  class_id: string
  class_name: string
  org_name: string
  warning_type: WarningType
  severity: WarningSeverity
  description: string
  status: WarningStatus
  handler_notes: string | null
  metric_value: number | null
  created_at: string
}

export type WarningInsight = {
  topStudents: { student_id: string; student_name: string; unexcused: number; classes: number }[]
  topClasses: { class_id: string; class_name: string; warning_count: number; danger_count: number }[]
}

type ActionResult = { error: string } | { error?: undefined }

async function getSubtreeOrgIds(
  supabase: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: orgId,
  })
  if (error) throw error
  return (data ?? []).map((row: { id?: string } | string) =>
    typeof row === 'string' ? row : (row.id as string)
  )
}

type WarningCandidate = {
  student_id: string
  class_id: string
  org_id: string
  warning_type: WarningType
  severity: WarningSeverity
  description: string
  metric_value: number | null
}

/**
 * [QA-FIX B] Server Action có auth — core nằm ở lib (không gọi được từ client
 * mà bỏ qua RLS). Điểm danh gọi thẳng scanAttendanceWarningsCore sau khi đã auth.
 */
export async function scanAttendanceWarningsAdmin(
  orgId: string
): Promise<{ error: string } | { error?: undefined; count: number }> {
  const parsed = requiredId('Thiếu org_id: vui lòng chọn cấp quản lý.').safeParse(orgId)
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) {
      return { error: 'Bạn chưa đăng nhập. Quét cảnh báo yêu cầu quyền Giáo vụ trở lên.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: parsed.data,
      p_required_role: 'academic_staff',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Cơ sở này không thuộc quyền quản lý của bạn.' }
    }

    console.log('[QA-FIX B] scanAttendanceWarningsAdmin authorized', {
      userId: currentUser.id,
      orgId: parsed.data,
    })
    return scanAttendanceWarningsCore(parsed.data)
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Lỗi quét cảnh báo chuyên cần.',
    }
  }
}

async function upsertWarningCandidates(
  supabase: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>,
  orgIds: string[],
  candidates: WarningCandidate[]
): Promise<ActionResult> {
  if (candidates.length === 0) return {}

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
      // Không reset status đã xử lý / đang xử lý / đã báo
      const { error: updateError } = await supabase
        .from('student_warnings')
        .update(payload)
        .eq('id', row.id)
      if (updateError) {
        // Cột 055 chưa có → fallback chỉ description
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

export async function getWarnings(
  orgId: string
): Promise<{ data: WarningRow[]; demo: boolean; loadError?: string | null }> {
  try {
    const supabase = createClient()
    const orgIds = await getSubtreeOrgIds(supabase, orgId)

    const full = await supabase
      .from('student_warnings')
      .select(
        'id, student_id, class_id, warning_type, description, status, severity, handler_notes, metric_value, created_at, profiles!student_warnings_student_id_fkey(full_name, phone), classes(name), organizations(name)'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    let data = full.data
    let error = full.error
    if (error && /severity|handler_notes|metric_value|42703|column/i.test(error.message)) {
      const legacy = await supabase
        .from('student_warnings')
        .select(
          'id, student_id, class_id, warning_type, description, status, created_at, profiles!student_warnings_student_id_fkey(full_name, phone), classes(name), organizations(name)'
        )
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      data = (legacy.data ?? []).map((r) => ({
        ...r,
        severity: 'early',
        handler_notes: null,
        metric_value: null,
      })) as typeof data
      error = legacy.error
    }

    if (error) {
      return { data: [], demo: false, loadError: error.message }
    }

    const rows: WarningRow[] = (data ?? []).map((row) => {
      const student = row.profiles as
        | { full_name?: string; phone?: string | null }
        | { full_name?: string; phone?: string | null }[]
        | null
      const cls = row.classes as { name?: string } | { name?: string }[] | null
      const org = row.organizations as { name?: string } | { name?: string }[] | null
      const studentObj = Array.isArray(student) ? student[0] : student
      const status = row.status as string
      return {
        id: row.id,
        student_id: row.student_id,
        student_name: studentObj?.full_name ?? '—',
        student_phone: studentObj?.phone ?? null,
        class_id: row.class_id,
        class_name: Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—',
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        warning_type: row.warning_type as WarningType,
        severity: ((row as { severity?: string }).severity as WarningSeverity) || 'early',
        description: row.description,
        status: (status === 'in_progress' ||
        status === 'notified' ||
        status === 'resolved' ||
        status === 'new'
          ? status
          : 'new') as WarningStatus,
        handler_notes: (row as { handler_notes?: string | null }).handler_notes ?? null,
        metric_value:
          (row as { metric_value?: number | null }).metric_value != null
            ? Number((row as { metric_value?: number | null }).metric_value)
            : null,
        created_at: row.created_at,
      }
    })
    return { data: rows, demo: false, loadError: null }
  } catch (error) {
    return {
      data: [],
      demo: false,
      loadError:
        error instanceof Error ? error.message : 'Không tải được danh sách cảnh báo.',
    }
  }
}

/** Top HV vắng nhiều + top lớp theo số cảnh báo (từ dữ liệu đã quét + view). */
export async function getWarningInsights(
  orgId: string
): Promise<{ data: WarningInsight; error?: string }> {
  const empty: WarningInsight = { topStudents: [], topClasses: [] }
  try {
    const supabase = createClient()
    const orgIds = await getSubtreeOrgIds(supabase, orgId)

    const { data: stats } = await supabase
      .from('vw_student_attendance_stats')
      .select('student_id, class_id, unexcused_count')
      .in('org_id', orgIds)
      .gt('unexcused_count', 0)
      .order('unexcused_count', { ascending: false })
      .limit(80)

    const byStudent = new Map<
      string,
      { student_id: string; student_name: string; unexcused: number; classes: number }
    >()
    for (const row of stats ?? []) {
      const cur = byStudent.get(row.student_id) ?? {
        student_id: row.student_id,
        student_name: '—',
        unexcused: 0,
        classes: 0,
      }
      cur.unexcused += Number(row.unexcused_count)
      cur.classes += 1
      byStudent.set(row.student_id, cur)
    }
    const topStudentIds = Array.from(byStudent.values())
      .sort((a, b) => b.unexcused - a.unexcused)
      .slice(0, 8)
    if (topStudentIds.length > 0) {
      const { data: names } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in(
          'id',
          topStudentIds.map((s) => s.student_id)
        )
      const nameMap = new Map((names ?? []).map((n) => [n.id, n.full_name]))
      for (const s of topStudentIds) {
        s.student_name = nameMap.get(s.student_id) ?? '—'
      }
    }
    const topStudents = topStudentIds

    const { data: warnings } = await supabase
      .from('student_warnings')
      .select('class_id, severity, classes(name)')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .neq('status', 'resolved')

    const byClass = new Map<
      string,
      { class_id: string; class_name: string; warning_count: number; danger_count: number }
    >()
    for (const w of warnings ?? []) {
      const cls = w.classes as { name?: string } | { name?: string }[] | null
      const name = Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—'
      const cur = byClass.get(w.class_id) ?? {
        class_id: w.class_id,
        class_name: name,
        warning_count: 0,
        danger_count: 0,
      }
      cur.warning_count += 1
      if ((w as { severity?: string }).severity === 'danger') cur.danger_count += 1
      byClass.set(w.class_id, cur)
    }
    const topClasses = Array.from(byClass.values())
      .sort((a, b) => b.warning_count - a.warning_count || b.danger_count - a.danger_count)
      .slice(0, 8)

    return { data: { topStudents, topClasses } }
  } catch (e) {
    return {
      data: empty,
      error: e instanceof Error ? e.message : 'Không tải được thống kê.',
    }
  }
}

export async function runEarlyWarningSystem(
  orgId: string
): Promise<{ error: string } | { error?: undefined; attendance: number; grade: number }> {
  const parsed = requiredId('Thiếu org_id: vui lòng chọn cấp quản lý.').safeParse(orgId)
  if (!parsed.success) return zodFail(parsed.error)
  orgId = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) {
      return { error: 'Bạn chưa đăng nhập. Quét cảnh báo yêu cầu quyền Giáo vụ trở lên.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgId,
      p_required_role: 'academic_staff',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Cơ sở này không thuộc quyền quản lý của bạn.' }
    }

    const orgIds = await getSubtreeOrgIds(supabase, orgId)

    // Đã auth ở trên — gọi core (tránh double RPC is_authorized)
    const attendanceScan = await scanAttendanceWarningsCore(orgId)
    if (attendanceScan.error !== undefined) return { error: attendanceScan.error }
    const attendanceCount = attendanceScan.count

    const [{ value: gpaDangerRaw }, { value: gpaEarlyRaw }] = await Promise.all([
      resolveSetting('gpa_warning_limit', orgId),
      resolveSetting('gpa_early_warning', orgId),
    ])
    let gpaDanger = Number(gpaDangerRaw)
    let gpaEarly = Number(gpaEarlyRaw)
    if (!Number.isFinite(gpaDanger)) gpaDanger = 5
    if (!Number.isFinite(gpaEarly)) gpaEarly = 6
    if (gpaEarly <= gpaDanger) gpaEarly = Math.min(10, gpaDanger + 1)

    const { data: gradeRows, error: gradeError } = await supabase
      .from('grades')
      .select(
        'student_id, org_id, score, assessments!inner(class_id, weight, assessment_types(weight))'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
    if (gradeError) return { error: `Lỗi đọc điểm số: ${gradeError.message}` }

    const gpaMap = new Map<
      string,
      { student_id: string; class_id: string; org_id: string; sum: number; weightSum: number }
    >()
    for (const row of gradeRows ?? []) {
      const assessment = (Array.isArray(row.assessments)
        ? row.assessments[0]
        : row.assessments) as unknown as {
        class_id: string
        weight: number | null
        assessment_types:
          | { weight?: number | null }
          | { weight?: number | null }[]
          | null
      } | null
      if (!assessment) continue

      const typeRef = Array.isArray(assessment.assessment_types)
        ? assessment.assessment_types[0]
        : assessment.assessment_types
      const weight = Number(typeRef?.weight ?? assessment.weight ?? 1) || 1

      const key = `${row.student_id}|${assessment.class_id}`
      const entry =
        gpaMap.get(key) ??
        {
          student_id: row.student_id,
          class_id: assessment.class_id,
          org_id: row.org_id,
          sum: 0,
          weightSum: 0,
        }
      entry.sum += Number(row.score) * weight
      entry.weightSum += weight
      gpaMap.set(key, entry)
    }

    const gradeCandidates: WarningCandidate[] = []
    for (const entry of gpaMap.values()) {
      if (entry.weightSum === 0) continue
      const gpa = Math.round((entry.sum / entry.weightSum) * 100) / 100
      let severity: WarningSeverity | null = null
      if (gpa < gpaDanger) severity = 'danger'
      else if (gpa < gpaEarly) severity = 'early'
      if (!severity) continue

      gradeCandidates.push({
        student_id: entry.student_id,
        class_id: entry.class_id,
        org_id: entry.org_id,
        warning_type: 'grade',
        severity,
        description: `Học lực [${severity === 'danger' ? 'NGUY HIỂM' : 'SỚM'}]: ĐTB ${gpa.toFixed(1)} (sớm<${gpaEarly}, nguy hiểm<${gpaDanger}).`,
        metric_value: gpa,
      })
    }

    const gradeUpsert = await upsertWarningCandidates(supabase, orgIds, gradeCandidates)
    if (gradeUpsert.error !== undefined) return gradeUpsert

    revalidatePath('/academic/warnings')
    return { attendance: attendanceCount, grade: gradeCandidates.length }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi quét cảnh báo.',
    }
  }
}

export async function sendParentNotification(
  warningIds: string[]
): Promise<ActionResult & { sent?: number }> {
  const parsed = z
    .array(z.string().trim().min(1))
    .min(1, 'Chưa chọn cảnh báo nào để gửi.')
    .max(100, 'Chỉ gửi tối đa 100 cảnh báo mỗi lần.')
    .safeParse(warningIds)
  if (!parsed.success) return zodFail(parsed.error)
  warningIds = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) {
      return { error: 'Bạn chưa đăng nhập. Gửi thông báo yêu cầu quyền Giáo vụ trở lên.' }
    }

    const { data: warnings, error: readError } = await supabase
      .from('student_warnings')
      .select(
        'id, org_id, student_id, warning_type, description, profiles!student_warnings_student_id_fkey(full_name, phone), classes(name)'
      )
      .in('id', warningIds)
      .is('deleted_at', null)
    if (readError) return { error: `Lỗi đọc cảnh báo: ${readError.message}` }
    if (!warnings || warnings.length === 0) {
      return { error: 'Không tìm thấy cảnh báo (hoặc bạn không có quyền trên các cảnh báo này).' }
    }

    for (const targetOrgId of new Set(warnings.map((w) => w.org_id))) {
      const { data: authorized } = await supabase.rpc('is_authorized', {
        p_user_id: currentUser.id,
        p_target_org_id: targetOrgId,
        p_required_role: 'academic_staff',
      })
      if (authorized !== true) {
        return { error: 'TỪ CHỐI: Có cảnh báo không thuộc quyền quản lý của bạn.' }
      }
    }

    const payload: ParentWarningNotification[] = warnings.map((warning) => {
      const student = warning.profiles as
        | { full_name?: string; phone?: string | null }
        | { full_name?: string; phone?: string | null }[]
        | null
      const cls = warning.classes as { name?: string } | { name?: string }[] | null
      const studentObj = Array.isArray(student) ? student[0] : student
      return {
        warningId: warning.id,
        studentId: warning.student_id,
        studentName: studentObj?.full_name ?? 'Học sinh',
        studentPhone: studentObj?.phone ?? null,
        className: Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—',
        warningType: warning.warning_type as WarningType,
        description: warning.description,
      }
    })

    const result = await notifyParentWarningsToN8n(payload)
    if (!result.ok) return { error: result.message }

    const { error: updateError } = await supabase
      .from('student_warnings')
      .update({ status: 'notified' })
      .in(
        'id',
        warnings.map((w) => w.id)
      )
    if (updateError) {
      return { error: `Đã gửi n8n nhưng không cập nhật được trạng thái: ${updateError.message}` }
    }

    revalidatePath('/academic/warnings')
    return { sent: warnings.length }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi gửi thông báo phụ huynh.',
    }
  }
}

/** Cập nhật trạng thái xử lý + ghi chú. */
export async function updateWarningWorkflow(
  warningId: string,
  status: WarningStatus,
  notes?: string
): Promise<ActionResult> {
  const idOk = requiredId('Thiếu ID cảnh báo.').safeParse(warningId)
  if (!idOk.success) return zodFail(idOk.error)
  if (!['new', 'notified', 'in_progress', 'resolved'].includes(status)) {
    return { error: 'Trạng thái không hợp lệ.' }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Chưa đăng nhập.' }

    const { data: row, error: readErr } = await supabase
      .from('student_warnings')
      .select('id, org_id')
      .eq('id', warningId)
      .is('deleted_at', null)
      .maybeSingle()
    if (readErr || !row) return { error: readErr?.message ?? 'Không tìm thấy cảnh báo.' }

    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: row.org_id,
      p_required_role: 'academic_staff',
    })
    if (authorized !== true) return { error: 'Không có quyền cập nhật cảnh báo này.' }

    const patch: Record<string, unknown> = {
      status,
      handler_notes: notes?.trim() || null,
      handled_by: user.id,
      handled_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('student_warnings')
      .update(patch)
      .eq('id', warningId)

    if (error && /handler_notes|handled_by|in_progress|42703|column/i.test(error.message)) {
      const legacy = await supabase
        .from('student_warnings')
        .update({ status: status === 'in_progress' ? 'notified' : status })
        .eq('id', warningId)
      if (legacy.error) return { error: legacy.error.message }
      return {
        error:
          'Đã cập nhật trạng thái cơ bản. Chạy migration 055 để lưu ghi chú / đang xử lý đầy đủ.',
      }
    }
    if (error) return { error: error.message }

    revalidatePath('/academic/warnings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi cập nhật.' }
  }
}

/** AI tóm tắt + gợi ý việc làm cho danh sách cảnh báo (tùy chọn). */
export async function getWarningAiAssist(
  orgId: string,
  warningIds: string[]
): Promise<{ text?: string; error?: string }> {
  const parsed = z
    .array(z.string().uuid())
    .min(1)
    .max(20)
    .safeParse(warningIds)
  if (!parsed.success) return { error: 'Chọn 1–20 cảnh báo để phân tích.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Chưa đăng nhập.' }

    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: orgId,
      p_required_role: 'academic_staff',
    })
    if (authorized !== true) return { error: 'Không có quyền.' }

    const { data: rows } = await supabase
      .from('student_warnings')
      .select(
        'warning_type, severity, status, description, profiles!student_warnings_student_id_fkey(full_name), classes(name)'
      )
      .in('id', parsed.data)
      .is('deleted_at', null)

    if (!rows?.length) return { error: 'Không đọc được cảnh báo.' }

    const lines = rows.map((r, i) => {
      const p = r.profiles as { full_name?: string } | { full_name?: string }[] | null
      const c = r.classes as { name?: string } | { name?: string }[] | null
      const name = Array.isArray(p) ? p[0]?.full_name : p?.full_name
      const cls = Array.isArray(c) ? c[0]?.name : c?.name
      return `${i + 1}. ${name} · ${cls} · ${r.warning_type}/${(r as { severity?: string }).severity ?? 'early'} · ${r.status}: ${r.description}`
    })

    const aiGate = await assertOrgAiReady(orgId)
    if (!aiGate.ok) {
      return { error: aiGate.message || AI_NOT_ACTIVATED_MESSAGE }
    }
    const ai = aiGate.config

    const { createOpenAI } = await import('@ai-sdk/openai')
    const { generateText } = await import('ai')
    const openaiClient = createOpenAI({ apiKey: ai.apiKey })
    const { text } = await generateText({
      model: openaiClient(ai.model || 'gpt-4o-mini'),
      temperature: 0.3,
      system:
        'Bạn là giáo vụ GDTX Việt Nam. Tóm tắt rủi ro học vụ và đề xuất 3–5 việc làm cụ thể (gọi PH, họp, hỗ trợ học…). Trả lời tiếng Việt, ngắn gọn, gạch đầu dòng.',
      prompt: `Phân tích các cảnh báo sau:\n${lines.join('\n')}`,
      abortSignal: AbortSignal.timeout(25000),
    })

    if (!text?.trim()) return { error: 'AI không trả về nội dung.' }
    return { text: text.trim() }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi gọi AI.',
    }
  }
}
