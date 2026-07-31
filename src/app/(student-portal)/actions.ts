'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Cổng thông tin Học sinh - actions.
// Mọi query đều neo theo auth.uid() của HỌC SINH đang đăng nhập:
// RLS (migration 009) đảm bảo học sinh chỉ thấy dữ liệu của mình.
// ============================================================

export type PortalSession = {
  id: string
  class_name: string
  teacher_name: string
  room: string | null
  start_time: string
  end_time: string
}

export type PortalGradeItem = {
  assessment_name: string
  weight: number
  max_score: number
  score: number
}

export type PortalClassGrades = {
  class_id: string
  class_name: string
  items: PortalGradeItem[]
  /** Điểm TB dự kiến (có trọng số, tính trên các bài đã có điểm) */
  average: number | null
}

// ---------- MOCK cho chế độ demo ----------
function mockSchedule(): PortalSession[] {
  const now = new Date()
  const at = (dayOffset: number, hour: number, duration: number) => {
    const start = new Date(now)
    start.setDate(start.getDate() + dayOffset)
    start.setHours(hour, 0, 0, 0)
    const end = new Date(start)
    end.setHours(hour + duration)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const s1 = at(0, 18, 2)
  const s2 = at(1, 18, 2)
  const s3 = at(3, 8, 3)
  const s4 = at(5, 14, 2)
  return [
    { id: 'ps-1', class_name: 'Toán 12A - Ôn thi THPT', teacher_name: 'Thầy Phạm Quang Huy', room: 'P.301', start_time: s1.start, end_time: s1.end },
    { id: 'ps-2', class_name: 'Tiếng Anh B1 - Tối T3/T5', teacher_name: 'Cô Lê Minh Anh', room: 'P.204', start_time: s2.start, end_time: s2.end },
    { id: 'ps-3', class_name: 'Toán 12A - Ôn thi THPT', teacher_name: 'Thầy Phạm Quang Huy', room: 'P.301', start_time: s3.start, end_time: s3.end },
    { id: 'ps-4', class_name: 'Vật lý 12 - Luyện đề', teacher_name: 'Thầy Vũ Đức Long', room: 'Hội trường A', start_time: s4.start, end_time: s4.end },
  ]
}

const MOCK_GRADES: PortalClassGrades[] = [
  {
    class_id: 'mc-1',
    class_name: 'Toán 12A - Ôn thi THPT',
    items: [
      { assessment_name: '15 phút', weight: 0.1, max_score: 10, score: 8 },
      { assessment_name: '1 tiết', weight: 0.2, max_score: 10, score: 7.5 },
      { assessment_name: 'Giữa kỳ', weight: 0.3, max_score: 10, score: 8.5 },
    ],
    average: 8.17,
  },
  {
    class_id: 'mc-2',
    class_name: 'Tiếng Anh B1 - Tối T3/T5',
    items: [
      { assessment_name: '15 phút', weight: 0.1, max_score: 10, score: 9 },
      { assessment_name: 'Giữa kỳ', weight: 0.3, max_score: 10, score: 8 },
      { assessment_name: 'Cuối kỳ', weight: 0.4, max_score: 10, score: 9.5 },
    ],
    average: 8.88,
  },
  {
    class_id: 'mc-3',
    class_name: 'Vật lý 12 - Luyện đề',
    items: [{ assessment_name: '15 phút', weight: 0.1, max_score: 10, score: 7 }],
    average: 7,
  },
]

function weightedAverage(items: PortalGradeItem[]): number | null {
  let sum = 0
  let weightSum = 0
  for (const item of items) {
    sum += item.score * item.weight
    weightSum += item.weight
  }
  if (weightSum === 0) return null
  return Math.round((sum / weightSum) * 100) / 100
}

/**
 * Lịch học cá nhân: student_id lấy từ session auth (KHÔNG nhận từ client).
 * Luồng: enrollments (lớp đang tham gia) -> class_sessions của các lớp đó,
 * sắp xếp thời gian tăng dần.
 */
export async function getMySchedule(): Promise<{
  data: PortalSession[]
  demo: boolean
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { data: mockSchedule(), demo: true }

    // 1. Các lớp học sinh đang ghi danh (RLS: chỉ enrollment của chính mình)
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .is('deleted_at', null)

    const classIds = (enrollments ?? []).map((e) => e.class_id)
    if (classIds.length === 0) return { data: mockSchedule(), demo: true }

    // 2. Các buổi học sắp tới của những lớp đó (thời gian tăng dần)
    const { data: sessions, error } = await supabase
      .from('class_sessions')
      .select('id, room, start_time, end_time, classes(name), profiles(full_name)')
      .in('class_id', classIds)
      .gte('start_time', new Date().toISOString())
      .is('deleted_at', null)
      .order('start_time', { ascending: true })
      .limit(30)

    if (error || !sessions || sessions.length === 0) {
      return { data: mockSchedule(), demo: true }
    }

    const rows: PortalSession[] = sessions.map((row) => {
      const cls = row.classes as { name: string } | { name: string }[] | null
      const teacher = row.profiles as { full_name: string } | { full_name: string }[] | null
      return {
        id: row.id,
        class_name: Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—',
        teacher_name: Array.isArray(teacher)
          ? teacher[0]?.full_name ?? 'Chưa gán'
          : teacher?.full_name ?? 'Chưa gán',
        room: row.room,
        start_time: row.start_time,
        end_time: row.end_time,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: mockSchedule(), demo: true }
  }
}

/**
 * Báo cáo điểm: toàn bộ điểm của học sinh, NHÓM theo lớp học,
 * kèm điểm trung bình dự kiến (có trọng số).
 */
export async function getMyGrades(): Promise<{
  data: PortalClassGrades[]
  demo: boolean
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { data: MOCK_GRADES, demo: true }

    const { data: grades, error } = await supabase
      .from('grades')
      .select(
        'score, assessments(id, name, weight, max_score, class_id, classes(id, name))'
      )
      .eq('student_id', user.id)
      .is('deleted_at', null)

    if (error || !grades || grades.length === 0) {
      return { data: MOCK_GRADES, demo: true }
    }

    // Group by lớp học
    const byClass = new Map<string, PortalClassGrades>()
    for (const row of grades) {
      const assessment = (
        Array.isArray(row.assessments) ? row.assessments[0] : row.assessments
      ) as {
        name: string
        weight: number
        max_score: number
        class_id: string
        classes: { id: string; name: string } | { id: string; name: string }[] | null
      } | null
      if (!assessment) continue

      const cls = Array.isArray(assessment.classes)
        ? assessment.classes[0]
        : assessment.classes
      const classId = assessment.class_id
      const className = cls?.name ?? 'Lớp không xác định'

      if (!byClass.has(classId)) {
        byClass.set(classId, {
          class_id: classId,
          class_name: className,
          items: [],
          average: null,
        })
      }
      byClass.get(classId)!.items.push({
        assessment_name: assessment.name,
        weight: Number(assessment.weight),
        max_score: Number(assessment.max_score),
        score: Number(row.score),
      })
    }

    const result = Array.from(byClass.values()).map((group) => ({
      ...group,
      average: weightedAverage(group.items),
    }))
    return { data: result, demo: false }
  } catch {
    return { data: MOCK_GRADES, demo: true }
  }
}
