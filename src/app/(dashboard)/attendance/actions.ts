'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyAbsenceToN8n } from '@/lib/integrations/n8n'
import { resolveSetting } from '@/lib/utils/settingsResolver'

/** Trạng thái điểm danh theo CHECK constraint của bảng `attendance`. */
export type AttendanceStatus = 'present' | 'excused' | 'absent'

export type AttendanceRecord = {
  studentId: string
  status: AttendanceStatus
}

export type SubmitResult = { error: string } | { success: true; absentCount: number }

/**
 * Lưu điểm danh cho một buổi học (Server Action cho mutation theo .cursorrules).
 * - Upsert theo unique (session_id, student_id): điểm danh lại sẽ ghi đè trạng thái cũ.
 * - Lọc học viên "Vắng không phép" (absent) và bắn thông báo n8n ở background.
 */
export async function submitAttendance(
  sessionId: string,
  records: AttendanceRecord[]
): Promise<SubmitResult> {
  if (!sessionId) {
    return { error: 'Thiếu session_id của buổi học.' }
  }
  if (!records || records.length === 0) {
    return { error: 'Không có bản ghi điểm danh nào để lưu.' }
  }

  try {
    const supabase = createClient()

    // ===== [SECURITY AUDIT] AUTH: action GHI bắt buộc đăng nhập =====
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }

    // attendance.org_id là NOT NULL: lấy org từ chính buổi học
    const { data: session } = await supabase
      .from('class_sessions')
      .select('org_id, teacher_id')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!session) {
      return { error: 'Buổi học không tồn tại hoặc đã bị xóa.' }
    }

    // ===== [SECURITY AUDIT] QUYỀN: GV của buổi HOẶC Staff của org =====
    if (session.teacher_id !== user.id) {
      const { data: authorized } = await supabase.rpc('is_authorized', {
        p_user_id: user.id,
        p_target_org_id: session.org_id,
        p_required_role: 'academic_staff',
      })
      if (authorized !== true) {
        return { error: 'TỪ CHỐI: Bạn không có quyền điểm danh buổi học này.' }
      }
    }

    const { error } = await supabase.from('attendance').upsert(
      records.map((record) => ({
        org_id: session.org_id,
        session_id: sessionId,
        student_id: record.studentId,
        status: record.status,
      })),
      { onConflict: 'session_id,student_id' }
    )

    if (error) {
      return { error: `Lỗi lưu điểm danh: ${error.message}` }
    }

    // Chốt điểm danh = buổi ĐÃ DẠY THẬT -> đánh dấu completed để
    // Engine Tính Lương (payrollService) đếm tiết công cho giáo viên
    await supabase
      .from('class_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .neq('status', 'cancelled')

    // Lọc học viên VẮNG KHÔNG PHÉP -> thông báo n8n
    const absentStudentIds = records
      .filter((record) => record.status === 'absent')
      .map((record) => record.studentId)

    if (absentStudentIds.length > 0) {
      // [CẤU HÌNH ĐỘNG] Phân giải qua settingsResolver: kế thừa
      // Cơ sở -> Cụm -> HQ -> default (default = true: lỗi đọc
      // config thì vẫn GỬI, an toàn hơn im lặng bỏ sót phụ huynh).
      const autoSms = await resolveSetting('auto_attendance_sms', session.org_id)

      if (autoSms.value) {
        // Fire-and-forget: không await để không block phản hồi về UI
        void notifyAbsenceToN8n(
          absentStudentIds,
          sessionId,
          new Date().toISOString().slice(0, 10)
        )
      }
    }

    revalidatePath('/attendance')
    return { success: true, absentCount: absentStudentIds.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}

// ============================================================
// Chính sách điểm danh của buổi học - phân giải qua settingsResolver
// (Cá nhân -> Cơ sở -> Cụm -> HQ -> default), KHÔNG hardcode.
// ============================================================

export type AttendancePolicy = {
  /** Cho phép học viên điểm danh trễ tối đa bao nhiêu phút */
  allowLateCheckinMinutes: number
  /** Cấp quyết định giá trị: 'user' | 'org' | 'inherited' | 'default' */
  source: string
}

export async function getAttendancePolicy(sessionId: string): Promise<AttendancePolicy> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Lấy org của buổi học; không tìm thấy (demo) -> resolve với org null
    const { data: session } = await supabase
      .from('class_sessions')
      .select('org_id')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()

    const resolved = await resolveSetting(
      'allow_late_checkin_minutes',
      session?.org_id ?? null,
      user?.id
    )
    return { allowLateCheckinMinutes: resolved.value, source: resolved.source }
  } catch {
    return { allowLateCheckinMinutes: 15, source: 'default' }
  }
}
