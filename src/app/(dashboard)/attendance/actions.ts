'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyAbsenceToN8n } from '@/lib/integrations/n8n'
import { resolveSetting } from '@/lib/utils/settingsResolver'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

/** Trạng thái điểm danh theo CHECK constraint của bảng `attendance`. */
export type AttendanceStatus = 'present' | 'excused' | 'absent'

export type AttendanceRecord = {
  studentId: string
  status: AttendanceStatus
  /** Nhận xét riêng học sinh trong buổi (hiển thị Sổ Liên Lạc phụ huynh) */
  note?: string
}

export type SubmitResult = { error: string } | { success: true; absentCount: number }

export type RosterStudent = {
  id: string
  fullName: string
  /** Trạng thái đã lưu trước đó (điểm danh lại) */
  savedStatus: AttendanceStatus | null
  savedNote: string | null
}

/** Sổ đầu bài (migration 033) - lưu class_sessions.diary_notes (jsonb) */
export type DiaryNotes = {
  /** Nội dung thực dạy (so sánh với giáo án) */
  actualContent: string
  /** Đánh giá thái độ lớp */
  attitude: 'good' | 'fair' | 'noisy' | ''
  /** Nhắc nhở chung */
  reminders: string
}

export type SessionRoster = {
  className: string
  startTime: string
  endTime: string
  room: string | null
  sessionNote: string | null
  parentNote: string | null
  diary: DiaryNotes | null
  students: RosterStudent[]
}

export type TodaySession = {
  sessionId: string
  classId: string
  className: string
  room: string | null
  startTime: string
  endTime: string
  /** Buổi đã chốt điểm danh (status completed) */
  done: boolean
  cancelled: boolean
}

/**
 * Danh sách buổi học HÔM NAY (giờ Việt Nam) trong phạm vi org đang chọn.
 * RLS tự cắt thêm theo quyền của người dùng.
 */
export async function getTodaySessions(
  orgId: string
): Promise<{ data: TodaySession[]; demo: boolean }> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('unauthenticated')

    const orgIds = await getDescendantOrgIds(supabase, orgId)

    // Ranh giới ngày theo múi giờ VN (+7), server có thể chạy UTC
    const vnOffsetMs = 7 * 3600_000
    const nowVn = new Date(Date.now() + vnOffsetMs)
    const startUtc = new Date(
      Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()) - vnOffsetMs
    )
    const endUtc = new Date(startUtc.getTime() + 24 * 3600_000)

    const { data, error } = await supabase
      .from('class_sessions')
      .select('id, class_id, room, start_time, end_time, status, classes(name)')
      .in('org_id', orgIds)
      .gte('start_time', startUtc.toISOString())
      .lt('start_time', endUtc.toISOString())
      .is('deleted_at', null)
      .order('start_time')
    if (error) throw error

    const rows: TodaySession[] = (data ?? []).map((row) => {
      const cls = row.classes as { name?: string } | { name?: string }[] | null
      return {
        sessionId: row.id,
        classId: row.class_id,
        className: (Array.isArray(cls) ? cls[0]?.name : cls?.name) ?? 'Lớp học',
        room: row.room,
        startTime: row.start_time,
        endTime: row.end_time,
        done: row.status === 'completed',
        cancelled: row.status === 'cancelled',
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: [], demo: true }
  }
}

/**
 * Nạp danh sách học viên THẬT của buổi học (enrollments active của lớp)
 * + trạng thái/nhận xét đã lưu (nếu điểm danh lại) + sổ đầu bài của buổi.
 */
export async function getSessionRoster(
  sessionId: string
): Promise<{ error: string } | { error?: undefined; roster: SessionRoster }> {
  if (!sessionId) return { error: 'Thiếu session_id của buổi học.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }

    // diary_notes (033) có thể chưa migrate -> thử select đầy đủ, fallback
    let session: Record<string, unknown> | null = null
    const fullSession = await supabase
      .from('class_sessions')
      .select(
        'id, class_id, org_id, room, start_time, end_time, session_note, parent_note, diary_notes, classes(name)'
      )
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()
    if (fullSession.error) {
      const basicSession = await supabase
        .from('class_sessions')
        .select(
          'id, class_id, org_id, room, start_time, end_time, session_note, parent_note, classes(name)'
        )
        .eq('id', sessionId)
        .is('deleted_at', null)
        .maybeSingle()
      session = basicSession.data as Record<string, unknown> | null
    } else {
      session = fullSession.data as Record<string, unknown> | null
    }
    if (!session) return { error: 'Buổi học không tồn tại hoặc đã bị xóa.' }

    const cls = session.classes as { name?: string } | { name?: string }[] | null
    const className = (Array.isArray(cls) ? cls[0]?.name : cls?.name) ?? 'Lớp học'

    // Học viên đang theo học lớp + bản ghi điểm danh đã có (song song)
    const [enrollResult, savedResult] = await Promise.all([
      supabase
        .from('enrollments')
        .select('student_id, profiles!enrollments_student_id_fkey(full_name)')
        .eq('class_id', session.class_id as string)
        .eq('status', 'active')
        .is('deleted_at', null),
      supabase
        .from('attendance')
        .select('student_id, status, note')
        .eq('session_id', sessionId)
        .is('deleted_at', null),
    ])
    if (enrollResult.error) {
      return { error: `Lỗi đọc danh sách lớp: ${enrollResult.error.message}` }
    }

    const savedByStudent = new Map(
      (savedResult.data ?? []).map((row) => [
        row.student_id,
        { status: row.status as AttendanceStatus, note: row.note as string | null },
      ])
    )

    const students: RosterStudent[] = (enrollResult.data ?? [])
      .map((row) => {
        const profile = row.profiles as { full_name?: string } | { full_name?: string }[] | null
        const fullName =
          (Array.isArray(profile) ? profile[0]?.full_name : profile?.full_name) ?? 'Học viên'
        const saved = savedByStudent.get(row.student_id)
        return {
          id: row.student_id,
          fullName,
          savedStatus: saved?.status ?? null,
          savedNote: saved?.note ?? null,
        }
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))

    // Parse diary_notes jsonb (nếu có)
    const rawDiary = session.diary_notes as {
      actual_content?: string
      attitude?: string
      reminders?: string
    } | null
    const diary: DiaryNotes | null = rawDiary
      ? {
          actualContent: rawDiary.actual_content ?? '',
          attitude:
            rawDiary.attitude === 'good' || rawDiary.attitude === 'fair' || rawDiary.attitude === 'noisy'
              ? rawDiary.attitude
              : '',
          reminders: rawDiary.reminders ?? '',
        }
      : null

    return {
      roster: {
        className,
        startTime: session.start_time as string,
        endTime: session.end_time as string,
        room: (session.room as string | null) ?? null,
        sessionNote: (session.session_note as string | null) ?? null,
        parentNote: (session.parent_note as string | null) ?? null,
        diary,
        students,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}

/**
 * Lưu điểm danh cho một buổi học (Server Action cho mutation theo .cursorrules).
 * - Upsert theo unique (session_id, student_id): điểm danh lại sẽ ghi đè trạng thái cũ.
 * - Lọc học viên "Vắng không phép" (absent) và bắn thông báo n8n ở background.
 */
export async function submitAttendance(
  sessionId: string,
  records: AttendanceRecord[],
  sessionNotes?: { sessionNote?: string; parentNote?: string; diary?: DiaryNotes }
): Promise<SubmitResult> {
  if (!sessionId) {
    return { error: 'Thiếu session_id của buổi học.' }
  }
  if (!records || records.length === 0) {
    return { error: 'Không có bản ghi điểm danh nào để lưu.' }
  }
  // QA: chặn payload bất thường (note quá dài / quá nhiều bản ghi)
  if (records.length > 200) return { error: 'Quá nhiều bản ghi điểm danh.' }
  for (const record of records) {
    if (record.note && record.note.length > 500) {
      return { error: 'Nhận xét học sinh tối đa 500 ký tự.' }
    }
  }
  if ((sessionNotes?.sessionNote ?? '').length > 1000) {
    return { error: 'Nhận xét buổi học tối đa 1000 ký tự.' }
  }
  if ((sessionNotes?.parentNote ?? '').length > 1000) {
    return { error: 'Dặn dò phụ huynh tối đa 1000 ký tự.' }
  }
  if ((sessionNotes?.diary?.actualContent ?? '').length > 2000) {
    return { error: 'Nội dung thực dạy tối đa 2000 ký tự.' }
  }
  if ((sessionNotes?.diary?.reminders ?? '').length > 1000) {
    return { error: 'Nhắc nhở chung tối đa 1000 ký tự.' }
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
        note: record.note?.trim() || null,
      })),
      { onConflict: 'session_id,student_id' }
    )

    if (error) {
      return { error: `Lỗi lưu điểm danh: ${error.message}` }
    }

    // Chốt điểm danh = buổi ĐÃ DẠY THẬT -> đánh dấu completed để
    // Engine Tính Lương (payrollService) đếm tiết công cho giáo viên.
    // Đồng thời lưu SỔ ĐẦU BÀI: nhận xét buổi học + dặn dò phụ huynh.
    const sessionUpdate: Record<string, unknown> = { status: 'completed' }
    if (sessionNotes !== undefined) {
      sessionUpdate.session_note = sessionNotes.sessionNote?.trim() || null
      sessionUpdate.parent_note = sessionNotes.parentNote?.trim() || null
      // Sổ đầu bài có cấu trúc (033): nội dung thực dạy + thái độ + nhắc nhở
      if (sessionNotes.diary !== undefined) {
        const diary = sessionNotes.diary
        const hasContent =
          diary.actualContent.trim() || diary.attitude || diary.reminders.trim()
        sessionUpdate.diary_notes = hasContent
          ? {
              actual_content: diary.actualContent.trim(),
              attitude: diary.attitude || null,
              reminders: diary.reminders.trim(),
            }
          : null
      }
    }
    const { error: noteError } = await supabase
      .from('class_sessions')
      .update(sessionUpdate)
      .eq('id', sessionId)
      .neq('status', 'cancelled')
    if (noteError && sessionNotes !== undefined) {
      // Cột 027/033 chưa migrate -> thử lưu không kèm diary, rồi tối thiểu chốt buổi
      const { error: retryError } = await supabase
        .from('class_sessions')
        .update({
          status: 'completed',
          session_note: sessionNotes.sessionNote?.trim() || null,
          parent_note: sessionNotes.parentNote?.trim() || null,
        })
        .eq('id', sessionId)
        .neq('status', 'cancelled')
      if (retryError) {
        await supabase
          .from('class_sessions')
          .update({ status: 'completed' })
          .eq('id', sessionId)
          .neq('status', 'cancelled')
        return {
          error:
            'Đã lưu điểm danh nhưng CHƯA lưu được sổ đầu bài (thiếu migration 027_attendance_notes.sql).',
        }
      }
      return {
        error:
          'Đã lưu điểm danh + dặn dò, nhưng CHƯA lưu được Tổng kết buổi học (thiếu migration 033_diary_facilities.sql).',
      }
    }

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
