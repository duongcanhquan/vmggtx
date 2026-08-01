'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// DUYỆT ĐƠN GIÁO VIÊN (/academic/requests) - migration 029
// Giáo vụ / Quản lý cơ sở duyệt hoặc từ chối kèm phản hồi.
// Khi DUYỆT:
//   - leave   -> buổi dạy chuyển 'cancelled' (TKB + lương nhận biết)
//   - propose -> tạo buổi học mới (check trùng lịch giáo viên trước)
// RLS teacher_requests đã giới hạn subtree; vẫn check role tường minh.
// ============================================================

const REVIEWER_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

export type ReviewRequest = {
  id: string
  request_type: 'propose' | 'leave'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason: string
  review_note: string | null
  created_at: string
  reviewed_at: string | null
  teacher_name: string
  org_name: string
  class_name: string | null
  session_start: string | null
  session_end: string | null
  proposed_start: string | null
  proposed_end: string | null
}

type ActionResult = { error: string } | { error?: undefined }

type Reviewer =
  | { error: string; profile?: undefined }
  | { error?: undefined; profile: { id: string; role: string; org_id: string | null } }

async function getReviewer(supabase: ReturnType<typeof createClient>): Promise<Reviewer> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || !REVIEWER_ROLES.includes(profile.role)) {
    return { error: 'Bạn không có quyền duyệt đơn giáo viên.' }
  }
  return { profile }
}

/** Danh sách đơn trong phạm vi của tôi (RLS subtree), pending lên đầu */
export async function getRequestsForReview(): Promise<
  { error: string } | { error?: undefined; requests: ReviewRequest[] }
> {
  try {
    const supabase = createClient()
    const reviewer = await getReviewer(supabase)
    if (reviewer.error !== undefined) return { error: reviewer.error }

    const { data, error } = await supabase
      .from('teacher_requests')
      .select(
        `id, request_type, status, reason, review_note, created_at, reviewed_at,
         proposed_start, proposed_end,
         teacher:profiles!teacher_requests_teacher_id_fkey(full_name),
         organizations(name),
         classes(name),
         class_sessions(start_time, end_time, classes(name))`
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      if (/teacher_requests/i.test(error.message)) {
        return {
          error:
            'Tính năng chưa sẵn sàng: database chưa chạy migration 029_teacher_requests.sql.',
        }
      }
      return { error: error.message }
    }

    const pickName = (value: unknown): string | null => {
      const obj = Array.isArray(value) ? value[0] : value
      return (obj as { name?: string; full_name?: string } | null)?.name ?? null
    }

    const requests: ReviewRequest[] = (data ?? []).map((row) => {
      const teacher = (Array.isArray(row.teacher) ? row.teacher[0] : row.teacher) as {
        full_name?: string
      } | null
      const session = (Array.isArray(row.class_sessions)
        ? row.class_sessions[0]
        : row.class_sessions) as unknown as {
        start_time?: string
        end_time?: string
        classes?: unknown
      } | null
      return {
        id: row.id,
        request_type: row.request_type as ReviewRequest['request_type'],
        status: row.status as ReviewRequest['status'],
        reason: row.reason,
        review_note: row.review_note,
        created_at: row.created_at,
        reviewed_at: row.reviewed_at,
        teacher_name: teacher?.full_name ?? 'Giáo viên',
        org_name: pickName(row.organizations) ?? 'Cơ sở',
        class_name: pickName(row.classes) ?? pickName(session?.classes),
        session_start: session?.start_time ?? null,
        session_end: session?.end_time ?? null,
        proposed_start: row.proposed_start,
        proposed_end: row.proposed_end,
      }
    })

    // pending lên đầu, còn lại giữ thứ tự mới nhất trước
    requests.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return 0
    })

    return { requests }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Duyệt / từ chối đơn kèm phản hồi cho giáo viên */
export async function reviewRequest(
  requestId: string,
  decision: 'approve' | 'reject',
  note: string
): Promise<ActionResult> {
  const trimmedNote = note.trim()
  if (!requestId) return { error: 'Thiếu mã đơn.' }
  if (decision === 'reject' && trimmedNote.length < 3) {
    return { error: 'Khi từ chối, vui lòng ghi phản hồi để giáo viên nắm được lý do.' }
  }
  if (trimmedNote.length > 500) return { error: 'Phản hồi tối đa 500 ký tự.' }

  try {
    const supabase = createClient()
    const reviewer = await getReviewer(supabase)
    if (reviewer.error !== undefined) return { error: reviewer.error }

    // RLS đảm bảo chỉ thấy đơn trong subtree của mình
    const { data: request } = await supabase
      .from('teacher_requests')
      .select(
        'id, request_type, status, teacher_id, session_id, class_id, proposed_start, proposed_end'
      )
      .eq('id', requestId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!request) return { error: 'Đơn không tồn tại hoặc ngoài phạm vi quản lý của bạn.' }
    if (request.status !== 'pending') return { error: 'Đơn này đã được xử lý.' }

    if (decision === 'approve') {
      if (request.request_type === 'leave') {
        if (!request.session_id) return { error: 'Đơn xin nghỉ thiếu thông tin buổi dạy.' }
        const { data: session } = await supabase
          .from('class_sessions')
          .select('id, status')
          .eq('id', request.session_id)
          .is('deleted_at', null)
          .maybeSingle()
        if (!session) return { error: 'Buổi dạy không còn tồn tại.' }
        if (session.status === 'completed') {
          return { error: 'Buổi này đã hoàn thành điểm danh — không thể duyệt nghỉ.' }
        }
        const { error: cancelError } = await supabase
          .from('class_sessions')
          .update({ status: 'cancelled' })
          .eq('id', request.session_id)
        if (cancelError) return { error: `Không hủy được buổi dạy: ${cancelError.message}` }
      } else {
        // propose: cần lớp + khung giờ để tự tạo buổi học
        if (!request.class_id || !request.proposed_start || !request.proposed_end) {
          return {
            error:
              'Đề xuất chung (chưa gắn lớp/khung giờ) — hãy xếp lịch thủ công ở Quản lý lớp rồi từ chối đơn kèm phản hồi, hoặc yêu cầu giáo viên gửi lại kèm lớp.',
          }
        }
        const { data: cls } = await supabase
          .from('classes')
          .select('id, org_id')
          .eq('id', request.class_id)
          .is('deleted_at', null)
          .maybeSingle()
        if (!cls) return { error: 'Lớp học của đề xuất không còn tồn tại.' }

        // [THÔNG MINH] check trùng lịch giáo viên lần cuối trước khi tạo
        const { data: conflicts } = await supabase
          .from('class_sessions')
          .select('id')
          .eq('teacher_id', request.teacher_id)
          .neq('status', 'cancelled')
          .is('deleted_at', null)
          .lt('start_time', request.proposed_end)
          .gt('end_time', request.proposed_start)
          .limit(1)
        if (conflicts && conflicts.length > 0) {
          return {
            error:
              'Giáo viên đã có buổi dạy trùng khung giờ này (mới xếp sau khi gửi đơn). Hãy từ chối kèm phản hồi.',
          }
        }

        const { error: insertError } = await supabase.from('class_sessions').insert({
          org_id: cls.org_id,
          class_id: request.class_id,
          teacher_id: request.teacher_id,
          start_time: request.proposed_start,
          end_time: request.proposed_end,
        })
        if (insertError) return { error: `Không tạo được buổi học: ${insertError.message}` }
      }
    }

    const { error: updateError } = await supabase
      .from('teacher_requests')
      .update({
        status: decision === 'approve' ? 'approved' : 'rejected',
        review_note: trimmedNote || null,
        reviewed_by: reviewer.profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
    if (updateError) return { error: `Không cập nhật được đơn: ${updateError.message}` }

    revalidatePath('/academic/requests')
    revalidatePath('/teacher/requests')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
