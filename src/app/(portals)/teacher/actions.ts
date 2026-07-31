'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// WORKSPACE GIÁO VIÊN (/teacher/*)
// - getTeacherHome: lịch dạy HÔM NAY (theo giờ VN), cảnh báo buổi
//   đã học xong nhưng CHƯA điểm danh (7 ngày gần nhất), thống kê
//   tiết đã dạy trong tháng + số lớp phụ trách.
// - getMyTeachingClasses: danh sách lớp teacher_id = auth.uid().
// Giáo viên có thể dạy NHIỀU cơ sở → chỉ lọc theo teacher_id,
// KHÔNG lọc org_id (RLS vẫn là lớp chặn cuối).
// ============================================================

const VN_OFFSET_MS = 7 * 3600 * 1000

/** Khung [00:00, 24:00) của ngày hôm nay theo giờ Việt Nam (UTC+7) */
function vnDayRange(): { dayStart: Date; dayEnd: Date } {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS)
  const y = nowVn.getUTCFullYear()
  const m = nowVn.getUTCMonth()
  const d = nowVn.getUTCDate()
  return {
    dayStart: new Date(Date.UTC(y, m, d) - VN_OFFSET_MS),
    dayEnd: new Date(Date.UTC(y, m, d + 1) - VN_OFFSET_MS),
  }
}

/** Khung [ngày 1, ngày 1 tháng sau) của tháng hiện tại theo giờ VN */
function vnMonthRange(): { monthStart: Date; monthEnd: Date } {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS)
  const y = nowVn.getUTCFullYear()
  const m = nowVn.getUTCMonth()
  return {
    monthStart: new Date(Date.UTC(y, m, 1) - VN_OFFSET_MS),
    monthEnd: new Date(Date.UTC(y, m + 1, 1) - VN_OFFSET_MS),
  }
}

export type TeacherSession = {
  id: string
  classId: string
  className: string
  room: string | null
  startTime: string
  endTime: string
  status: 'scheduled' | 'completed' | 'cancelled'
}

export type TeacherHomeResult =
  | { error: string }
  | {
      error?: undefined
      todaySessions: TeacherSession[]
      /** Buổi ĐÃ KẾT THÚC (7 ngày gần nhất) nhưng chưa chốt điểm danh */
      pendingAttendance: TeacherSession[]
      stats: { monthCompleted: number; activeClasses: number }
    }

type SessionRow = {
  id: string
  class_id: string
  room: string | null
  start_time: string
  end_time: string
  status: string
  classes: { name: string } | null
}

function toTeacherSession(row: SessionRow): TeacherSession {
  return {
    id: row.id,
    classId: row.class_id,
    className: row.classes?.name ?? 'Lớp học',
    room: row.room,
    startTime: row.start_time,
    endTime: row.end_time,
    status: (row.status as TeacherSession['status']) ?? 'scheduled',
  }
}

export async function getTeacherHome(): Promise<TeacherHomeResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { dayStart, dayEnd } = vnDayRange()
    const { monthStart, monthEnd } = vnMonthRange()
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000)

    const [todayResult, pendingResult, monthResult, classesResult] = await Promise.all([
      // Lịch dạy hôm nay
      supabase
        .from('class_sessions')
        .select('id, class_id, room, start_time, end_time, status, classes(name)')
        .eq('teacher_id', user.id)
        .is('deleted_at', null)
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString())
        .order('start_time'),
      // Đã kết thúc nhưng chưa completed (7 ngày gần nhất, gồm hôm nay)
      supabase
        .from('class_sessions')
        .select('id, class_id, room, start_time, end_time, status, classes(name)')
        .eq('teacher_id', user.id)
        .eq('status', 'scheduled')
        .is('deleted_at', null)
        .lt('end_time', now.toISOString())
        .gte('end_time', sevenDaysAgo.toISOString())
        .order('end_time', { ascending: false })
        .limit(20),
      // Tổng tiết đã dạy trong tháng (ước tính lương)
      supabase
        .from('class_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .gte('start_time', monthStart.toISOString())
        .lt('start_time', monthEnd.toISOString()),
      // Số lớp đang phụ trách
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id)
        .is('deleted_at', null),
    ])

    if (todayResult.error) {
      return { error: `Không tải được lịch dạy: ${todayResult.error.message}` }
    }

    return {
      todaySessions: ((todayResult.data ?? []) as unknown as SessionRow[]).map(
        toTeacherSession
      ),
      pendingAttendance: ((pendingResult.data ?? []) as unknown as SessionRow[]).map(
        toTeacherSession
      ),
      stats: {
        monthCompleted: monthResult.count ?? 0,
        activeClasses: classesResult.count ?? 0,
      },
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

export type TeachingClass = {
  id: string
  name: string
  subjectName: string | null
  orgName: string | null
  isLocked: boolean
}

export type TeachingClassesResult =
  | { error: string }
  | { error?: undefined; classes: TeachingClass[] }

export async function getMyTeachingClasses(): Promise<TeachingClassesResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data, error } = await supabase
      .from('classes')
      .select('id, name, subjects(name), organizations(name)')
      .eq('teacher_id', user.id)
      .is('deleted_at', null)
      .order('name')
    if (error) return { error: `Không tải được danh sách lớp: ${error.message}` }

    const rows = (data ?? []) as unknown as {
      id: string
      name: string
      subjects: { name: string } | null
      organizations: { name: string } | null
    }[]

    // Trạng thái khóa sổ điểm (hiện badge ở trang Chấm điểm)
    const classIds = rows.map((row) => row.id)
    const lockedSet = new Set<string>()
    if (classIds.length > 0) {
      const { data: results } = await supabase
        .from('class_results')
        .select('class_id, is_locked')
        .in('class_id', classIds)
      for (const result of results ?? []) {
        if (result.is_locked) lockedSet.add(result.class_id)
      }
    }

    return {
      classes: rows.map((row) => ({
        id: row.id,
        name: row.name,
        subjectName: row.subjects?.name ?? null,
        orgName: row.organizations?.name ?? null,
        isLocked: lockedSet.has(row.id),
      })),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
