'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// ĐIỀU PHỐI LỊCH HỌC (/staff/schedule-management) - migration 031
// Giáo vụ click 1 buổi học -> "Báo nghỉ & Đổi lịch":
//   A) DẠY THAY : chọn GV đang RẢNH khung giờ đó (lọc trùng lịch)
//   B) DẠY BÙ   : hủy buổi + xếp buổi bù (ngày/giờ/phòng mới),
//      gọi RPC check_schedule_conflict trước khi tạo.
// [ĐA TẦNG] mọi thao tác qua SSR client -> RLS subtree chặn tầng DB,
// kèm double-check role tường minh ở đây.
// ============================================================

const STAFF_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

export type CoordSession = {
  id: string
  classId: string
  className: string
  teacherId: string | null
  teacherName: string
  substituteTeacherName: string | null
  room: string | null
  startTime: string
  endTime: string
  status: 'scheduled' | 'completed' | 'cancelled'
  isMakeup: boolean
}

export type FreeTeacher = { id: string; name: string }

type ActionResult = { error: string } | { error?: undefined }

async function requireStaff(): Promise<
  { error: string } | { error?: undefined; userId: string; orgId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || !STAFF_ROLES.includes(profile.role) || !profile.org_id) {
    return { error: 'Chức năng này dành cho Giáo vụ / Quản lý cơ sở.' }
  }
  return { userId: user.id, orgId: profile.org_id }
}

/** Buổi học trong tuần của org + subtree (kèm thông tin dạy thay/dạy bù) */
export async function getCoordSessions(weekStartISO: string): Promise<
  { error: string } | { error?: undefined; sessions: CoordSession[] }
> {
  try {
    const weekStart = new Date(weekStartISO)
    if (Number.isNaN(weekStart.getTime())) return { error: 'Tuần không hợp lệ.' }
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, auth.orgId)

    // Cột 031 có thể chưa tồn tại -> thử select đầy đủ, fallback cơ bản
    let rows: Record<string, unknown>[] = []
    const fullSelect =
      'id, class_id, teacher_id, substitute_teacher_id, room, start_time, end_time, status, is_makeup, classes(name), teacher:profiles!class_sessions_teacher_id_fkey(full_name), substitute:profiles!class_sessions_substitute_teacher_id_fkey(full_name)'
    const { data, error } = await supabase
      .from('class_sessions')
      .select(fullSelect)
      .in('org_id', orgIds)
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString())
      .is('deleted_at', null)
      .order('start_time')

    if (error) {
      // Pre-031: fallback không có cột mới
      const { data: basicData, error: basicError } = await supabase
        .from('class_sessions')
        .select(
          'id, class_id, teacher_id, room, start_time, end_time, status, classes(name), profiles(full_name)'
        )
        .in('org_id', orgIds)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString())
        .is('deleted_at', null)
        .order('start_time')
      if (basicError) return { error: basicError.message }
      rows = (basicData ?? []).map((row) => ({
        ...row,
        teacher: row.profiles,
        substitute: null,
        substitute_teacher_id: null,
        is_makeup: false,
      }))
    } else {
      rows = (data ?? []) as Record<string, unknown>[]
    }

    const pickName = (value: unknown): string | null => {
      const obj = Array.isArray(value) ? value[0] : value
      return (
        (obj as { name?: string; full_name?: string } | null)?.name ??
        (obj as { full_name?: string } | null)?.full_name ??
        null
      )
    }

    return {
      sessions: rows.map((row) => ({
        id: row.id as string,
        classId: row.class_id as string,
        className: pickName(row.classes) ?? 'Lớp học',
        teacherId: (row.teacher_id as string | null) ?? null,
        teacherName: pickName(row.teacher) ?? 'Chưa gán GV',
        substituteTeacherName: pickName(row.substitute),
        room: (row.room as string | null) ?? null,
        startTime: row.start_time as string,
        endTime: row.end_time as string,
        status: ((row.status as string | null) ?? 'scheduled') as CoordSession['status'],
        isMakeup: Boolean(row.is_makeup),
      })),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** GV RẢNH trong khung giờ của buổi học (đã loại GV trùng lịch + GV gốc) */
export async function getFreeTeachers(sessionId: string): Promise<
  { error: string } | { error?: undefined; teachers: FreeTeacher[] }
> {
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: session } = await supabase
      .from('class_sessions')
      .select('id, teacher_id, start_time, end_time')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!session) return { error: 'Buổi học không tồn tại hoặc ngoài phạm vi.' }

    // Toàn bộ GV trong scope (RLS profiles giới hạn subtree)
    const { data: teachers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'teacher')
      .is('deleted_at', null)
      .order('full_name')
      .limit(300)

    // GV BẬN: có buổi giao khung giờ này (1 query, tránh N+1 RPC)
    const { data: busyRows } = await supabase
      .from('class_sessions')
      .select('teacher_id')
      .neq('status', 'cancelled')
      .neq('id', sessionId)
      .is('deleted_at', null)
      .lt('start_time', session.end_time)
      .gt('end_time', session.start_time)
    const busy = new Set((busyRows ?? []).map((row) => row.teacher_id).filter(Boolean))

    return {
      teachers: (teachers ?? [])
        .filter((t) => t.id !== session.teacher_id && !busy.has(t.id))
        .map((t) => ({ id: t.id, name: t.full_name })),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** A) Gán GV DẠY THAY - buổi giữ nguyên, ghi substitute_teacher_id */
export async function assignSubstitute(
  sessionId: string,
  substituteTeacherId: string
): Promise<ActionResult> {
  if (!substituteTeacherId) return { error: 'Vui lòng chọn giáo viên dạy thay.' }
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: session } = await supabase
      .from('class_sessions')
      .select('id, teacher_id, status, start_time, end_time')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!session) return { error: 'Buổi học không tồn tại hoặc ngoài phạm vi.' }
    if (session.status !== 'scheduled') {
      return { error: 'Chỉ đổi được giáo viên cho buổi CHƯA diễn ra/chưa hủy.' }
    }
    if (substituteTeacherId === session.teacher_id) {
      return { error: 'Giáo viên dạy thay phải khác giáo viên gốc.' }
    }

    // RPC chống trùng lịch (chỉ check GV, room=null để không tự vướng phòng buổi này)
    const { data: hasConflict } = await supabase.rpc('check_schedule_conflict', {
      p_teacher_id: substituteTeacherId,
      p_room: null,
      p_start_time: session.start_time,
      p_end_time: session.end_time,
    })
    if (hasConflict === true) {
      return { error: 'Giáo viên này đã bận khung giờ đó — hệ thống chặn trùng lịch.' }
    }

    const { error } = await supabase
      .from('class_sessions')
      .update({ substitute_teacher_id: substituteTeacherId })
      .eq('id', sessionId)
    if (error) {
      if (/substitute_teacher_id|column/i.test(error.message)) {
        return { error: 'Cần chạy migration 031_exam_ops.sql trước (Supabase SQL Editor).' }
      }
      return { error: `Không gán được GV dạy thay: ${error.message}` }
    }

    revalidatePath('/staff/schedule-management')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** B) HỦY buổi + XẾP BUỔI BÙ (check_schedule_conflict trước khi tạo) */
export async function cancelAndMakeup(
  sessionId: string,
  newStartISO: string,
  newEndISO: string,
  newRoom: string
): Promise<ActionResult> {
  const newStart = new Date(newStartISO)
  const newEnd = new Date(newEndISO)
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
    return { error: 'Thời gian buổi bù không hợp lệ.' }
  }
  if (newEnd <= newStart) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' }
  if (newStart.getTime() < Date.now()) return { error: 'Buổi bù phải ở tương lai.' }

  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: session } = await supabase
      .from('class_sessions')
      .select('id, org_id, class_id, teacher_id, status')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!session) return { error: 'Buổi học không tồn tại hoặc ngoài phạm vi.' }
    if (session.status === 'completed') {
      return { error: 'Buổi đã hoàn thành điểm danh — không thể hủy.' }
    }

    // RPC CHỐNG TRÙNG LỊCH: check cả GV lẫn PHÒNG cho khung giờ mới
    const { data: hasConflict, error: rpcError } = await supabase.rpc(
      'check_schedule_conflict',
      {
        p_teacher_id: session.teacher_id,
        p_room: newRoom.trim() || null,
        p_start_time: newStart.toISOString(),
        p_end_time: newEnd.toISOString(),
      }
    )
    if (rpcError) return { error: `Lỗi kiểm tra trùng lịch: ${rpcError.message}` }
    if (hasConflict === true) {
      return {
        error: 'TRÙNG LỊCH: giáo viên hoặc phòng đã có buổi khác trong khung giờ bù. Chọn giờ/phòng khác.',
      }
    }

    // Tạo buổi BÙ trước (fail thì buổi gốc còn nguyên)
    const { error: insertError } = await supabase.from('class_sessions').insert({
      org_id: session.org_id,
      class_id: session.class_id,
      teacher_id: session.teacher_id,
      room: newRoom.trim() || null,
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      is_makeup: true,
      original_session_id: sessionId,
    })
    if (insertError) {
      if (/is_makeup|original_session_id|column/i.test(insertError.message)) {
        return { error: 'Cần chạy migration 031_exam_ops.sql trước (Supabase SQL Editor).' }
      }
      return { error: `Không tạo được buổi bù: ${insertError.message}` }
    }

    const { error: cancelError } = await supabase
      .from('class_sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId)
    if (cancelError) {
      return { error: `Đã tạo buổi bù nhưng không hủy được buổi gốc: ${cancelError.message}` }
    }

    revalidatePath('/staff/schedule-management')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
