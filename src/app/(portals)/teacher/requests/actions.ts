'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// ĐƠN TỪ GIÁO VIÊN (/teacher/requests) - migration 029
//   - propose: đề xuất lịch dạy (lớp + khung giờ mong muốn)
//   - leave:   xin nghỉ một buổi dạy cụ thể
// RLS: giáo viên chỉ thấy/tạo/rút đơn CỦA MÌNH.
// "Thông minh": trước khi gửi đề xuất, hệ thống check TRÙNG LỊCH
// với các buổi dạy hiện có của chính giáo viên.
// ============================================================

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type TeacherRequest = {
  id: string
  request_type: 'propose' | 'leave'
  status: RequestStatus
  reason: string
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  class_name: string | null
  session_start: string | null
  session_end: string | null
  proposed_start: string | null
  proposed_end: string | null
}

export type LeaveOption = {
  sessionId: string
  className: string
  startTime: string
  endTime: string
  room: string | null
}

export type ClassOption = { id: string; name: string }

type ActionResult = { error: string } | { error?: undefined }

/** Đơn của tôi (mới nhất trước) + dữ liệu cho form tạo đơn */
export async function getMyRequestsData(): Promise<
  | { error: string }
  | {
      error?: undefined
      requests: TeacherRequest[]
      leaveOptions: LeaveOption[]
      classOptions: ClassOption[]
    }
> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const nowIso = new Date().toISOString()
    const [requestsResult, sessionsResult, classesResult] = await Promise.all([
      supabase
        .from('teacher_requests')
        .select(
          'id, request_type, status, reason, review_note, reviewed_at, created_at, proposed_start, proposed_end, classes(name), class_sessions(start_time, end_time, classes(name))'
        )
        .eq('teacher_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('class_sessions')
        .select('id, room, start_time, end_time, classes(name)')
        .eq('teacher_id', user.id)
        .gte('start_time', nowIso)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .order('start_time')
        .limit(40),
      supabase
        .from('classes')
        .select('id, name')
        .eq('teacher_id', user.id)
        .is('deleted_at', null)
        .order('name'),
    ])

    if (requestsResult.error) {
      // Bảng chưa có (chưa chạy migration 029)
      if (/teacher_requests/i.test(requestsResult.error.message)) {
        return {
          error:
            'Tính năng đơn từ chưa sẵn sàng: database chưa chạy migration 029_teacher_requests.sql.',
        }
      }
      return { error: requestsResult.error.message }
    }

    const pickName = (value: unknown): string | null => {
      const obj = Array.isArray(value) ? value[0] : value
      return (obj as { name?: string } | null)?.name ?? null
    }

    const requests: TeacherRequest[] = (requestsResult.data ?? []).map((row) => {
      const session = (Array.isArray(row.class_sessions)
        ? row.class_sessions[0]
        : row.class_sessions) as unknown as {
        start_time?: string
        end_time?: string
        classes?: unknown
      } | null
      return {
        id: row.id,
        request_type: row.request_type as 'propose' | 'leave',
        status: row.status as RequestStatus,
        reason: row.reason,
        review_note: row.review_note,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
        class_name: pickName(row.classes) ?? pickName(session?.classes),
        session_start: session?.start_time ?? null,
        session_end: session?.end_time ?? null,
        proposed_start: row.proposed_start,
        proposed_end: row.proposed_end,
      }
    })

    const leaveOptions: LeaveOption[] = (sessionsResult.data ?? []).map((row) => ({
      sessionId: row.id,
      className: pickName(row.classes) ?? 'Lớp học',
      startTime: row.start_time,
      endTime: row.end_time,
      room: row.room,
    }))

    return {
      requests,
      leaveOptions,
      classOptions: (classesResult.data ?? []) as ClassOption[],
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Xin nghỉ 1 buổi dạy cụ thể */
export async function createLeaveRequest(
  sessionId: string,
  reason: string
): Promise<ActionResult> {
  const trimmedReason = reason.trim()
  if (!sessionId) return { error: 'Vui lòng chọn buổi dạy xin nghỉ.' }
  if (trimmedReason.length < 5) return { error: 'Vui lòng ghi rõ lý do (tối thiểu 5 ký tự).' }
  if (trimmedReason.length > 500) return { error: 'Lý do tối đa 500 ký tự.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    // Buổi phải là CỦA TÔI, chưa hủy, còn ở tương lai
    const { data: session } = await supabase
      .from('class_sessions')
      .select('id, org_id, teacher_id, status, start_time')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!session || session.teacher_id !== user.id) {
      return { error: 'Buổi dạy không tồn tại hoặc không phải buổi của bạn.' }
    }
    if (session.status === 'cancelled') return { error: 'Buổi này đã bị hủy trước đó.' }

    // Chống gửi trùng: đã có đơn pending cho buổi này
    const { data: existing } = await supabase
      .from('teacher_requests')
      .select('id')
      .eq('teacher_id', user.id)
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .limit(1)
    if (existing && existing.length > 0) {
      return { error: 'Bạn đã có đơn xin nghỉ đang chờ duyệt cho buổi này.' }
    }

    const { error } = await supabase.from('teacher_requests').insert({
      org_id: session.org_id,
      teacher_id: user.id,
      request_type: 'leave',
      session_id: sessionId,
      reason: trimmedReason,
      status: 'pending',
    })
    if (error) return { error: `Không gửi được đơn: ${error.message}` }

    revalidatePath('/teacher/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Đề xuất lịch dạy: lớp (tùy chọn) + khung giờ mong muốn */
export async function createProposalRequest(
  classId: string,
  startISO: string,
  endISO: string,
  reason: string
): Promise<ActionResult> {
  const trimmedReason = reason.trim()
  const start = new Date(startISO)
  const end = new Date(endISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Thời gian đề xuất không hợp lệ.' }
  }
  if (end <= start) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' }
  if (start.getTime() < Date.now()) return { error: 'Khung giờ đề xuất phải ở tương lai.' }
  if (trimmedReason.length < 5) return { error: 'Vui lòng ghi rõ đề xuất (tối thiểu 5 ký tự).' }
  if (trimmedReason.length > 500) return { error: 'Nội dung tối đa 500 ký tự.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    // [THÔNG MINH] Check trùng lịch với buổi dạy hiện có của CHÍNH MÌNH
    const { data: conflicts } = await supabase
      .from('class_sessions')
      .select('id, start_time, classes(name)')
      .eq('teacher_id', user.id)
      .neq('status', 'cancelled')
      .is('deleted_at', null)
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .limit(1)
    if (conflicts && conflicts.length > 0) {
      const cls = conflicts[0].classes as { name?: string } | { name?: string }[] | null
      const clsName = (Array.isArray(cls) ? cls[0]?.name : cls?.name) ?? 'một lớp khác'
      return {
        error: `Trùng lịch: bạn đã có buổi dạy ${clsName} trong khung giờ này. Vui lòng chọn giờ khác.`,
      }
    }

    // Xác định org: theo lớp (nếu chọn) hoặc org của chính giáo viên
    let orgId: string | null = null
    if (classId) {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, org_id, teacher_id')
        .eq('id', classId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!cls) return { error: 'Lớp học không tồn tại.' }
      orgId = cls.org_id
    } else {
      const { data: me } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle()
      orgId = me?.org_id ?? null
    }
    if (!orgId) return { error: 'Tài khoản chưa gắn cơ sở — liên hệ giáo vụ.' }

    const { error } = await supabase.from('teacher_requests').insert({
      org_id: orgId,
      teacher_id: user.id,
      request_type: 'propose',
      class_id: classId || null,
      proposed_start: start.toISOString(),
      proposed_end: end.toISOString(),
      reason: trimmedReason,
      status: 'pending',
    })
    if (error) return { error: `Không gửi được đề xuất: ${error.message}` }

    revalidatePath('/teacher/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Rút đơn khi còn pending */
export async function cancelMyRequest(requestId: string): Promise<ActionResult> {
  if (!requestId) return { error: 'Thiếu mã đơn.' }
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { error, count } = await supabase
      .from('teacher_requests')
      .update({ status: 'cancelled' }, { count: 'exact' })
      .eq('id', requestId)
      .eq('teacher_id', user.id)
      .eq('status', 'pending')
    if (error) return { error: `Không rút được đơn: ${error.message}` }
    if (count === 0) return { error: 'Đơn không tồn tại hoặc đã được xử lý.' }

    revalidatePath('/teacher/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
