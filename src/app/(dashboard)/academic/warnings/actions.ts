'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  notifyParentWarningsToN8n,
  type ParentWarningNotification,
} from '@/lib/integrations/n8n'
import { requiredId, zodFail } from '@/lib/validation/schemas'
import { z } from 'zod'

// ============================================================
// Hệ thống Cảnh báo học vụ sớm (Early Warning System)
// (/academic/warnings - Campus Admin / Giáo vụ)
//
// runEarlyWarningSystem(orgId) quét 2 nhóm rủi ro:
//   1. CHUYÊN CẦN (cờ ĐỎ)  : vắng KHÔNG phép >= 3 buổi, HOẶC
//      tổng vắng (có phép + không phép) > 20% số buổi.
//      Nguồn: view vw_student_attendance_stats (migration 011).
//   2. HỌC LỰC (cờ CAM)    : điểm trung bình có trọng số < 5.0.
//      Hệ số ưu tiên lấy từ assessment_types.weight, fallback
//      assessments.weight (dữ liệu cũ trước migration 011).
// Kết quả upsert vào student_warnings; cảnh báo đã 'notified'
// không bị reset về 'new' khi quét lại (chỉ cập nhật mô tả).
// ============================================================

export type WarningType = 'attendance' | 'grade'
export type WarningStatus = 'new' | 'notified' | 'resolved'

export type WarningRow = {
  id: string
  student_id: string
  student_name: string
  student_phone: string | null
  class_id: string
  class_name: string
  org_name: string
  warning_type: WarningType
  description: string
  status: WarningStatus
}

type ActionResult = { error: string } | { error?: undefined }

// Ngưỡng cảnh báo
const UNEXCUSED_LIMIT = 3 // vắng không phép >= 3 buổi
const ABSENCE_RATIO_LIMIT = 0.2 // tổng vắng > 20% số buổi
const GPA_LIMIT = 5.0 // ĐTB < 5.0

// ---- Mock cho chế độ demo ----

const MOCK_WARNINGS: WarningRow[] = [
  {
    id: 'cb-001',
    student_id: 'st-01',
    student_name: 'Nguyễn Văn Toàn',
    student_phone: '0901234567',
    class_id: 'lop-01',
    class_name: 'Toán 12A1 - Ca tối',
    org_name: 'Chi nhánh Cầu Giấy',
    warning_type: 'attendance',
    description: 'Vắng không phép 4/18 buổi (22%).',
    status: 'new',
  },
  {
    id: 'cb-002',
    student_id: 'st-02',
    student_name: 'Đỗ Thu Hà',
    student_phone: '0912345678',
    class_id: 'lop-02',
    class_name: 'Ngữ văn 12A2 - Ca tối',
    org_name: 'Chi nhánh Đống Đa',
    warning_type: 'grade',
    description: 'Điểm trung bình 4.2 (< 5.0).',
    status: 'notified',
  },
]

async function getSubtreeOrgIds(
  supabase: ReturnType<typeof createClient>,
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

/** Danh sách cảnh báo hiện có trong subtree của org đang chọn */
export async function getWarnings(
  orgId: string
): Promise<{ data: WarningRow[]; demo: boolean }> {
  try {
    const supabase = createClient()
    const orgIds = await getSubtreeOrgIds(supabase, orgId)

    const { data, error } = await supabase
      .from('student_warnings')
      .select(
        'id, student_id, class_id, warning_type, description, status, profiles!student_warnings_student_id_fkey(full_name, phone), classes(name), organizations(name)'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    const rows: WarningRow[] = data.map((row) => {
      const student = row.profiles as
        | { full_name?: string; phone?: string | null }
        | { full_name?: string; phone?: string | null }[]
        | null
      const cls = row.classes as { name?: string } | { name?: string }[] | null
      const org = row.organizations as { name?: string } | { name?: string }[] | null
      const studentObj = Array.isArray(student) ? student[0] : student
      return {
        id: row.id,
        student_id: row.student_id,
        student_name: studentObj?.full_name ?? '—',
        student_phone: studentObj?.phone ?? null,
        class_id: row.class_id,
        class_name: Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—',
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        warning_type: row.warning_type as WarningType,
        description: row.description,
        status: row.status as WarningStatus,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: MOCK_WARNINGS, demo: true }
  }
}

/**
 * Quét toàn bộ học sinh trong subtree, gắn cờ cảnh báo.
 * Trả về số cảnh báo mỗi loại để UI hiển thị.
 */
export async function runEarlyWarningSystem(
  orgId: string
): Promise<{ error: string } | { error?: undefined; attendance: number; grade: number }> {
  // ===== QA GATE =====
  const parsed = requiredId('Thiếu org_id: vui lòng chọn cấp quản lý.').safeParse(orgId)
  if (!parsed.success) return zodFail(parsed.error)
  orgId = parsed.data

  try {
    const supabase = createClient()

    // ===== [BẢO MẬT] Đăng nhập + tối thiểu Giáo vụ trên org đích =====
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

    type Candidate = {
      student_id: string
      class_id: string
      org_id: string
      warning_type: WarningType
      description: string
    }
    const candidates: Candidate[] = []

    // ===== 1. CHUYÊN CẦN: đọc view thống kê điểm danh =====
    const { data: stats, error: statsError } = await supabase
      .from('vw_student_attendance_stats')
      .select('student_id, class_id, org_id, total_sessions, excused_count, unexcused_count')
      .in('org_id', orgIds)
    if (statsError) return { error: `Lỗi đọc thống kê điểm danh: ${statsError.message}` }

    for (const stat of stats ?? []) {
      const totalAbsent = stat.excused_count + stat.unexcused_count
      const ratio = stat.total_sessions > 0 ? totalAbsent / stat.total_sessions : 0
      const tooManyUnexcused = stat.unexcused_count >= UNEXCUSED_LIMIT
      const tooHighRatio = ratio > ABSENCE_RATIO_LIMIT

      if (tooManyUnexcused || tooHighRatio) {
        const reasons: string[] = []
        if (tooManyUnexcused) {
          reasons.push(`vắng không phép ${stat.unexcused_count} buổi`)
        }
        if (tooHighRatio) {
          reasons.push(
            `tổng vắng ${totalAbsent}/${stat.total_sessions} buổi (${Math.round(ratio * 100)}%)`
          )
        }
        candidates.push({
          student_id: stat.student_id,
          class_id: stat.class_id,
          org_id: stat.org_id,
          warning_type: 'attendance',
          description: `Chuyên cần: ${reasons.join('; ')}.`,
        })
      }
    }

    // ===== 2. HỌC LỰC: điểm trung bình có trọng số < 5.0 =====
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
      // Ưu tiên hệ số của assessment_types (mô hình mới), fallback weight cũ
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

    for (const entry of gpaMap.values()) {
      if (entry.weightSum === 0) continue
      const gpa = Math.round((entry.sum / entry.weightSum) * 100) / 100
      if (gpa < GPA_LIMIT) {
        candidates.push({
          student_id: entry.student_id,
          class_id: entry.class_id,
          org_id: entry.org_id,
          warning_type: 'grade',
          description: `Học lực: điểm trung bình ${gpa.toFixed(1)} (< ${GPA_LIMIT.toFixed(1)}).`,
        })
      }
    }

    // ===== 3. Ghi vào student_warnings =====
    // Cảnh báo đã tồn tại: chỉ cập nhật mô tả, GIỮ NGUYÊN status
    // (không reset 'notified'/'resolved' về 'new' khi quét lại).
    const { data: existing, error: existingError } = await supabase
      .from('student_warnings')
      .select('id, student_id, class_id, warning_type')
      .in('org_id', orgIds)
      .is('deleted_at', null)
    if (existingError) return { error: `Lỗi đọc cảnh báo cũ: ${existingError.message}` }

    const existingByKey = new Map(
      (existing ?? []).map((w) => [`${w.student_id}|${w.class_id}|${w.warning_type}`, w.id])
    )

    let attendanceCount = 0
    let gradeCount = 0
    for (const candidate of candidates) {
      if (candidate.warning_type === 'attendance') attendanceCount += 1
      else gradeCount += 1

      const key = `${candidate.student_id}|${candidate.class_id}|${candidate.warning_type}`
      const existingId = existingByKey.get(key)

      if (existingId) {
        const { error: updateError } = await supabase
          .from('student_warnings')
          .update({ description: candidate.description })
          .eq('id', existingId)
        if (updateError) return { error: `Lỗi cập nhật cảnh báo: ${updateError.message}` }
      } else {
        const { error: insertError } = await supabase.from('student_warnings').insert({
          org_id: candidate.org_id,
          student_id: candidate.student_id,
          class_id: candidate.class_id,
          warning_type: candidate.warning_type,
          description: candidate.description,
          status: 'new',
        })
        if (insertError) return { error: `Lỗi tạo cảnh báo: ${insertError.message}` }
      }
    }

    revalidatePath('/academic/warnings')
    return { attendance: attendanceCount, grade: gradeCount }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi quét cảnh báo.',
    }
  }
}

/**
 * Gửi thông báo Zalo cho Phụ huynh qua n8n webhook.
 * Gửi thành công -> cập nhật status các cảnh báo thành 'notified'.
 */
export async function sendParentNotification(
  warningIds: string[]
): Promise<ActionResult & { sent?: number }> {
  // ===== QA GATE =====
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

    // RLS đã cắt: chỉ đọc được cảnh báo trong subtree của người gọi
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

    // Double-check quyền trên từng org liên quan
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
      .in('id', warnings.map((w) => w.id))
    if (updateError) {
      return { error: `Đã gửi n8n nhưng không cập nhật được trạng thái: ${updateError.message}` }
    }

    revalidatePath('/academic/warnings')
    return { sent: warnings.length }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi gửi thông báo.',
    }
  }
}
