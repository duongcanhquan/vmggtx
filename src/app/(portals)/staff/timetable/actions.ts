'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// THỜI KHÓA BIỂU TOÀN CƠ SỞ (/staff/timetable)
// Trả về mọi buổi học trong TUẦN được chọn của org user + subtree.
// ============================================================

export type TimetableSession = {
  id: string
  classId: string
  className: string
  teacherName: string
  room: string | null
  startTime: string
  endTime: string
  status: 'scheduled' | 'completed' | 'cancelled'
}

export type TimetableResult =
  | { error: string }
  | { error?: undefined; sessions: TimetableSession[]; orgName: string }

export async function getOrgTimetable(weekStartISO: string): Promise<TimetableResult> {
  try {
    const weekStart = new Date(weekStartISO)
    if (Number.isNaN(weekStart.getTime())) {
      return { error: 'Tuần được chọn không hợp lệ.' }
    }
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, organizations(name)')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile?.org_id) return { error: 'Tài khoản chưa gắn cơ sở.' }

    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: profile.org_id,
    })
    const orgIds = ((subtree as string[] | null) ?? [profile.org_id]).slice()
    if (!orgIds.includes(profile.org_id)) orgIds.push(profile.org_id)

    // [ĐA TẦNG] lọc org_id tường minh; RLS chặn thêm ở tầng DB
    const { data, error } = await supabase
      .from('class_sessions')
      .select('id, class_id, room, start_time, end_time, status, classes(name), profiles(full_name)')
      .in('org_id', orgIds)
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString())
      .is('deleted_at', null)
      .order('start_time')

    if (error) return { error: `Không tải được thời khóa biểu: ${error.message}` }

    const rows = (data ?? []) as unknown as {
      id: string
      class_id: string
      room: string | null
      start_time: string
      end_time: string
      status: string | null
      classes: { name: string } | null
      profiles: { full_name: string } | null
    }[]

    const orgName =
      (profile as unknown as { organizations: { name: string } | null }).organizations?.name ??
      'Cơ sở của bạn'

    return {
      orgName,
      sessions: rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        className: row.classes?.name ?? 'Lớp học',
        teacherName: row.profiles?.full_name ?? 'Giáo viên',
        room: row.room,
        startTime: row.start_time,
        endTime: row.end_time,
        status: (row.status ?? 'scheduled') as TimetableSession['status'],
      })),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
