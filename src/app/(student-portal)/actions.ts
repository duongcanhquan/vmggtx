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
  /** id dòng điểm - dùng cho yêu cầu phúc khảo (null = dữ liệu demo) */
  grade_id: string | null
  assessment_name: string
  weight: number
  max_score: number
  score: number
  /** null = bình thường | under_review = đang phúc khảo | resolved = đã trả kết quả */
  review_status: 'under_review' | 'resolved' | null
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

const mockGradeItem = (
  assessment_name: string,
  weight: number,
  score: number
): PortalGradeItem => ({
  grade_id: null,
  assessment_name,
  weight,
  max_score: 10,
  score,
  review_status: null,
})

const MOCK_GRADES: PortalClassGrades[] = [
  {
    class_id: 'mc-1',
    class_name: 'Toán 12A - Ôn thi THPT',
    items: [
      mockGradeItem('15 phút', 0.1, 8),
      mockGradeItem('1 tiết', 0.2, 7.5),
      mockGradeItem('Giữa kỳ', 0.3, 8.5),
    ],
    average: 8.17,
  },
  {
    class_id: 'mc-2',
    class_name: 'Tiếng Anh B1 - Tối T3/T5',
    items: [
      mockGradeItem('15 phút', 0.1, 9),
      mockGradeItem('Giữa kỳ', 0.3, 8),
      mockGradeItem('Cuối kỳ', 0.4, 9.5),
    ],
    average: 8.88,
  },
  {
    class_id: 'mc-3',
    class_name: 'Vật lý 12 - Luyện đề',
    items: [mockGradeItem('15 phút', 0.1, 7)],
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

    // review_status (migration 031) có thể chưa tồn tại -> fallback êm
    let grades:
      | {
          id: string
          score: number
          review_status?: string | null
          assessments: unknown
        }[]
      | null = null
    const fullQuery = await supabase
      .from('grades')
      .select(
        'id, score, review_status, assessments(id, name, weight, max_score, class_id, classes(id, name))'
      )
      .eq('student_id', user.id)
      .is('deleted_at', null)
    if (fullQuery.error) {
      const basicQuery = await supabase
        .from('grades')
        .select(
          'id, score, assessments(id, name, weight, max_score, class_id, classes(id, name))'
        )
        .eq('student_id', user.id)
        .is('deleted_at', null)
      grades = basicQuery.data
    } else {
      grades = fullQuery.data
    }

    if (!grades || grades.length === 0) {
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
      const reviewStatus = row.review_status
      byClass.get(classId)!.items.push({
        grade_id: row.id,
        assessment_name: assessment.name,
        weight: Number(assessment.weight),
        max_score: Number(assessment.max_score),
        score: Number(row.score),
        review_status:
          reviewStatus === 'under_review' || reviewStatus === 'resolved'
            ? reviewStatus
            : null,
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

/**
 * PHÚC KHẢO (migration 031): học sinh yêu cầu chấm lại một bài.
 * - Xác thực điểm thuộc CHÍNH học sinh đang đăng nhập (không tin client).
 * - Ghi bằng admin client vì RLS không cho học sinh UPDATE bảng grades;
 *   filter cứng theo grade_id + student_id = auth.uid() nên an toàn.
 * - Điểm chuyển trạng thái 'under_review', Khảo thí xử lý ở /staff/exam-schedule.
 */
export async function requestGradeReview(
  gradeId: string,
  reason: string
): Promise<{ error: string } | { error?: undefined }> {
  const trimmedReason = reason.trim()
  if (!gradeId) return { error: 'Thiếu mã điểm.' }
  if (trimmedReason.length < 5) {
    return { error: 'Vui lòng nêu lý do phúc khảo (ít nhất 5 ký tự).' }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    const { data: grade } = await admin
      .from('grades')
      .select('id, review_status')
      .eq('id', gradeId)
      .eq('student_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!grade) return { error: 'Không tìm thấy điểm này của bạn.' }
    if (grade.review_status === 'under_review') {
      return { error: 'Bài này đang được phúc khảo — vui lòng chờ kết quả.' }
    }

    const { error } = await admin
      .from('grades')
      .update({
        review_status: 'under_review',
        review_reason: trimmedReason.slice(0, 500),
        review_requested_at: new Date().toISOString(),
      })
      .eq('id', gradeId)
      .eq('student_id', user.id)
    if (error) {
      if (/review_status|column/i.test(error.message)) {
        return { error: 'Tính năng phúc khảo chưa sẵn sàng (thiếu migration 031).' }
      }
      return { error: `Không gửi được yêu cầu: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
