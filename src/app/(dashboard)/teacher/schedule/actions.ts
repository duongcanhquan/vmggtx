'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Lịch dạy của Giáo viên (/teacher/schedule)
//
// KHÁC BIỆT QUAN TRỌNG so với các module khác: KHÔNG lọc theo org_id.
// Giáo viên có thể được Staff của NHIỀU chi nhánh gán dạy, nên lịch
// phải gom tất cả class_sessions có teacher_id = user hiện tại,
// bất kể buổi học thuộc chi nhánh nào.
// ============================================================

export type TeachingSession = {
  id: string
  class_id: string
  class_name: string
  org_name: string
  room: string | null
  start_time: string
  end_time: string
}

export type SessionStudent = {
  id: string
  full_name: string
  /** Trạng thái đã điểm danh trước đó (nếu có) để prefill popup */
  status: 'present' | 'excused' | 'absent' | null
}

// ---------- MOCK: lịch demo trải trên nhiều chi nhánh ----------
function buildMockWeek(weekStartISO: string): TeachingSession[] {
  const monday = new Date(`${weekStartISO}T00:00:00`)

  const at = (dayOffset: number, hour: number, durationHours: number) => {
    const start = new Date(monday)
    start.setDate(start.getDate() + dayOffset)
    start.setHours(hour, 0, 0, 0)
    const end = new Date(start)
    end.setHours(start.getHours() + durationHours)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const s1 = at(0, 18, 2) // Thứ 2
  const s2 = at(2, 18, 2) // Thứ 4
  const s3 = at(3, 8, 3) // Thứ 5
  const s4 = at(5, 14, 2) // Thứ 7

  return [
    {
      id: 'mock-s1',
      class_id: 'mock-c1',
      class_name: 'Toán 12A - Ôn thi THPT',
      org_name: 'Chi nhánh Cầu Giấy',
      room: 'P.301',
      start_time: s1.start,
      end_time: s1.end,
    },
    {
      id: 'mock-s2',
      class_id: 'mock-c1',
      class_name: 'Toán 12A - Ôn thi THPT',
      org_name: 'Chi nhánh Cầu Giấy',
      room: 'P.301',
      start_time: s2.start,
      end_time: s2.end,
    },
    {
      id: 'mock-s3',
      class_id: 'mock-c9',
      class_name: 'Toán 11 - Nâng cao',
      org_name: 'Chi nhánh Đống Đa',
      room: 'P.105',
      start_time: s3.start,
      end_time: s3.end,
    },
    {
      id: 'mock-s4',
      class_id: 'mock-c12',
      class_name: 'Luyện đề Toán - Cấp tốc',
      org_name: 'Cơ sở Hà Nội 2',
      room: 'Hội trường A',
      start_time: s4.start,
      end_time: s4.end,
    },
  ]
}

/**
 * Lịch dạy trong 1 tuần của giáo viên đang đăng nhập.
 * Query theo teacher_id = auth.uid(), KHÔNG lọc org_id: gom mọi buổi
 * dạy trên mọi chi nhánh mà giáo viên được gán.
 */
export async function getMyWeekSessions(weekStartISO: string): Promise<{
  data: TeachingSession[]
  demo: boolean
}> {
  const weekStart = new Date(`${weekStartISO}T00:00:00`)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: buildMockWeek(weekStartISO), demo: true }
    }

    const { data, error } = await supabase
      .from('class_sessions')
      .select(
        'id, class_id, room, start_time, end_time, classes(name), organizations(name)'
      )
      .eq('teacher_id', user.id) // Chỉ theo giáo viên - KHÔNG theo org
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString())
      .is('deleted_at', null)
      .order('start_time')

    if (error || !data) {
      return { data: buildMockWeek(weekStartISO), demo: true }
    }

    const rows: TeachingSession[] = data.map((row) => {
      const cls = row.classes as { name: string } | { name: string }[] | null
      const org = row.organizations as { name: string } | { name: string }[] | null
      return {
        id: row.id,
        class_id: row.class_id,
        class_name: Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—',
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        room: row.room,
        start_time: row.start_time,
        end_time: row.end_time,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: buildMockWeek(weekStartISO), demo: true }
  }
}

/**
 * Danh sách học viên cho popup điểm danh của một buổi học.
 * Roster = enrollments status=active của lớp buổi học (khớp /attendance).
 * Prefill từ attendance. Không trả MOCK khi lỗi/từ chối.
 */
export async function getSessionStudents(
  sessionId: string
): Promise<{ data: SessionStudent[]; demo: boolean; loadError?: string | null }> {
  try {
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], demo: false, loadError: 'Bạn chưa đăng nhập.' }
    }

    const { data: session } = await supabase
      .from('class_sessions')
      .select('id, class_id, org_id, teacher_id')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!session) {
      return { data: [], demo: false, loadError: 'Không tìm thấy buổi học.' }
    }

    if (session.teacher_id !== user.id) {
      const { data: authorized } = await supabase.rpc('is_authorized', {
        p_user_id: user.id,
        p_target_org_id: session.org_id,
        p_required_role: 'academic_staff',
      })
      if (authorized !== true) {
        return {
          data: [],
          demo: false,
          loadError: 'Bạn không có quyền điểm danh buổi này.',
        }
      }
    }

    const [enrollRes, existingRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('student_id, profiles!enrollments_student_id_fkey(id, full_name, deleted_at)')
        .eq('class_id', session.class_id)
        .eq('status', 'active')
        .is('deleted_at', null),
      supabase
        .from('attendance')
        .select('student_id, status')
        .eq('session_id', sessionId)
        .is('deleted_at', null),
    ])

    if (enrollRes.error) {
      // Fallback 2 bước nếu join FK lỗi
      const { data: enrollRows, error: e2 } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('class_id', session.class_id)
        .eq('status', 'active')
        .is('deleted_at', null)
      if (e2) {
        return {
          data: [],
          demo: false,
          loadError: `Không tải danh sách ghi danh: ${e2.message}`,
        }
      }
      const ids = (enrollRows ?? []).map((r) => r.student_id)
      let profiles: { id: string; full_name: string }[] = []
      if (ids.length > 0) {
        const { data: pRows, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
          .eq('role', 'student')
          .is('deleted_at', null)
          .order('full_name')
        if (pErr) {
          return {
            data: [],
            demo: false,
            loadError: `Không tải hồ sơ học viên: ${pErr.message}`,
          }
        }
        profiles = pRows ?? []
      }
      const statusByStudent = new Map(
        (existingRes.data ?? []).map((row) => [row.student_id, row.status])
      )
      return {
        data: profiles.map((student) => {
          const status = statusByStudent.get(student.id)
          return {
            id: student.id,
            full_name: student.full_name,
            status:
              status === 'present' || status === 'excused' || status === 'absent'
                ? status
                : null,
          }
        }),
        demo: false,
        loadError: null,
      }
    }

    const statusByStudent = new Map(
      (existingRes.data ?? []).map((row) => [row.student_id, row.status])
    )

    const rows: SessionStudent[] = []
    for (const row of enrollRes.data ?? []) {
      const profile = row.profiles as
        | { id?: string; full_name?: string; deleted_at?: string | null }
        | { id?: string; full_name?: string; deleted_at?: string | null }[]
        | null
      const p = Array.isArray(profile) ? profile[0] : profile
      if (!p?.id || p.deleted_at) continue
      const status = statusByStudent.get(p.id)
      rows.push({
        id: p.id,
        full_name: p.full_name ?? '—',
        status:
          status === 'present' || status === 'excused' || status === 'absent'
            ? status
            : null,
      })
    }
    rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))

    return { data: rows, demo: false, loadError: null }
  } catch (e) {
    return {
      data: [],
      demo: false,
      loadError: e instanceof Error ? e.message : 'Không tải được danh sách học viên.',
    }
  }
}
