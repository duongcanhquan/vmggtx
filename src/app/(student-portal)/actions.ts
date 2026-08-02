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

export type ReExamRequestStatus = 'pending' | 'approved' | 'rejected' | 'rescheduled'

export type PortalGradeItem = {
  /** id dòng điểm - dùng cho yêu cầu phúc khảo (null = dữ liệu demo) */
  grade_id: string | null
  /** id bài kiểm tra - dùng cho đơn ĐĂNG KÝ THI LẠI (migration 036) */
  assessment_id: string | null
  assessment_name: string
  weight: number
  max_score: number
  score: number
  /** null = bình thường | under_review = đang phúc khảo | resolved = đã trả kết quả */
  review_status: 'under_review' | 'resolved' | null
  /** Trạng thái đơn thi lại gần nhất của bài này (null = chưa gửi đơn) */
  re_exam_status: ReExamRequestStatus | null
}

export type PortalClassGrades = {
  class_id: string
  class_name: string
  items: PortalGradeItem[]
  /** Điểm TB dự kiến (có trọng số, tính trên các bài đã có điểm) */
  average: number | null
}

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

    if (!user) return { data: [], demo: false }

    // 1. Các lớp học sinh đang ghi danh (RLS: chỉ enrollment của chính mình)
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .is('deleted_at', null)

    const classIds = (enrollments ?? []).map((e) => e.class_id)
    if (classIds.length === 0) return { data: [], demo: false }

    // 2. Các buổi học sắp tới của những lớp đó (thời gian tăng dần)
    const { data: sessions, error } = await supabase
      .from('class_sessions')
      .select('id, room, start_time, end_time, classes(name), profiles(full_name)')
      .in('class_id', classIds)
      .gte('start_time', new Date().toISOString())
      .is('deleted_at', null)
      .order('start_time', { ascending: true })
      .limit(30)

    if (error) return { data: [], demo: false }
    if (!sessions || sessions.length === 0) return { data: [], demo: false }

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
    return { data: [], demo: false }
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

    if (!user) return { data: [], demo: false }

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
      if (basicQuery.error) return { data: [], demo: false }
      grades = basicQuery.data
    } else {
      grades = fullQuery.data
    }

    if (!grades || grades.length === 0) {
      return { data: [], demo: false }
    }

    // Đơn thi lại của học sinh (migration 036) - thiếu bảng thì bỏ qua êm
    const reExamByAssessment = new Map<string, ReExamRequestStatus>()
    const reExamQuery = await supabase
      .from('re_examination_requests')
      .select('assessment_id, status, created_at')
      .eq('student_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (!reExamQuery.error) {
      for (const request of reExamQuery.data ?? []) {
        // Đã sort mới nhất trước -> chỉ giữ trạng thái đơn gần nhất
        if (!reExamByAssessment.has(request.assessment_id)) {
          reExamByAssessment.set(request.assessment_id, request.status as ReExamRequestStatus)
        }
      }
    }

    // Group by lớp học
    const byClass = new Map<string, PortalClassGrades>()
    for (const row of grades) {
      const assessment = (
        Array.isArray(row.assessments) ? row.assessments[0] : row.assessments
      ) as {
        id: string
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
        assessment_id: assessment.id,
        assessment_name: assessment.name,
        weight: Number(assessment.weight),
        max_score: Number(assessment.max_score),
        score: Number(row.score),
        review_status:
          reviewStatus === 'under_review' || reviewStatus === 'resolved'
            ? reviewStatus
            : null,
        re_exam_status: reExamByAssessment.get(assessment.id) ?? null,
      })
    }

    const result = Array.from(byClass.values()).map((group) => ({
      ...group,
      average: weightedAverage(group.items),
    }))
    return { data: result, demo: false }
  } catch {
    return { data: [], demo: false }
  }
}

export type PortalAttendanceSummary = {
  total: number
  present: number
  excused: number
  unexcused: number
  presentRate: number
}

export type PortalLearningNote = {
  id: string
  kind: 'attendance_note' | 'diary' | 'parent_note'
  title: string
  description: string
  date: string
}

/** Chuyên cần của chính học viên đang đăng nhập (không MOCK). */
export async function getMyAttendanceSummary(): Promise<{
  data: PortalAttendanceSummary
  loadError?: string | null
}> {
  const empty: PortalAttendanceSummary = {
    total: 0,
    present: 0,
    excused: 0,
    unexcused: 0,
    presentRate: 100,
  }
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: empty, loadError: 'Bạn chưa đăng nhập.' }

    const { data, error } = await supabase
      .from('vw_student_attendance_stats')
      .select('total_sessions, present_count, excused_count, unexcused_count')
      .eq('student_id', user.id)

    if (error) {
      // Fallback: đếm trực tiếp bảng attendance
      const { data: rows, error: aErr } = await supabase
        .from('attendance')
        .select('status')
        .eq('student_id', user.id)
        .is('deleted_at', null)
      if (aErr) return { data: empty, loadError: aErr.message }
      let present = 0
      let excused = 0
      let unexcused = 0
      for (const r of rows ?? []) {
        if (r.status === 'present') present += 1
        else if (r.status === 'excused') excused += 1
        else if (r.status === 'absent') unexcused += 1
      }
      const total = present + excused + unexcused
      return {
        data: {
          total,
          present,
          excused,
          unexcused,
          presentRate: total > 0 ? Math.round((present / total) * 100) : 100,
        },
        loadError: null,
      }
    }

    const total = (data ?? []).reduce((sum, row) => sum + Number(row.total_sessions), 0)
    const present = (data ?? []).reduce((sum, row) => sum + Number(row.present_count), 0)
    const excused = (data ?? []).reduce((sum, row) => sum + Number(row.excused_count), 0)
    const unexcused = (data ?? []).reduce(
      (sum, row) => sum + Number(row.unexcused_count),
      0
    )
    return {
      data: {
        total,
        present,
        excused,
        unexcused,
        presentRate: total > 0 ? Math.round((present / total) * 100) : 100,
      },
      loadError: null,
    }
  } catch (e) {
    return {
      data: empty,
      loadError: e instanceof Error ? e.message : 'Không tải được chuyên cần.',
    }
  }
}

/**
 * Nhận xét / thái độ học tập: note điểm danh cá nhân + sổ đầu bài lớp đang học.
 */
export async function getMyLearningNotes(): Promise<{
  data: PortalLearningNote[]
  loadError?: string | null
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], loadError: 'Bạn chưa đăng nhập.' }

    const notes: PortalLearningNote[] = []

    const [{ data: attendanceNotes }, { data: enrollments }] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, note, created_at, status, class_sessions(start_time, classes(name))')
        .eq('student_id', user.id)
        .not('note', 'is', null)
        .neq('note', '')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', user.id)
        .eq('status', 'active')
        .is('deleted_at', null),
    ])

    for (const att of attendanceNotes ?? []) {
      const session = (
        Array.isArray(att.class_sessions) ? att.class_sessions[0] : att.class_sessions
      ) as {
        start_time?: string
        classes?: { name?: string } | { name?: string }[] | null
      } | null
      const cls = Array.isArray(session?.classes)
        ? session?.classes[0]
        : session?.classes
      notes.push({
        id: `a-${att.id}`,
        kind: 'attendance_note',
        title: `Nhận xét buổi học${cls?.name ? ` · ${cls.name}` : ''}`,
        description: String(att.note),
        date: (session?.start_time as string | undefined) ?? att.created_at,
      })
    }

    const classIds = (enrollments ?? []).map((e) => e.class_id)
    if (classIds.length > 0) {
      try {
        const { data: diaryRows } = await supabase
          .from('class_sessions')
          .select('id, diary_notes, parent_note, start_time, classes(name)')
          .in('class_id', classIds)
          .is('deleted_at', null)
          .order('start_time', { ascending: false })
          .limit(20)

        const ATTITUDE_LABEL: Record<string, string> = {
          good: 'Tốt',
          fair: 'Khá',
          noisy: 'Ồn ào',
        }

        for (const session of diaryRows ?? []) {
          const cls = session.classes as
            | { name?: string }
            | { name?: string }[]
            | null
          const className = Array.isArray(cls) ? cls[0]?.name : cls?.name
          const diary = session.diary_notes as {
            actual_content?: string
            attitude?: string
            reminders?: string
          } | null

          if (diary) {
            const parts: string[] = []
            if (diary.attitude && ATTITUDE_LABEL[diary.attitude]) {
              parts.push(`Thái độ lớp: ${ATTITUDE_LABEL[diary.attitude]}`)
            }
            if (diary.actual_content) {
              parts.push(`Nội dung: ${diary.actual_content}`)
            }
            if (diary.reminders) parts.push(`Nhắc nhở: ${diary.reminders}`)
            if (parts.length > 0) {
              notes.push({
                id: `d-${session.id}`,
                kind: 'diary',
                title: `Sổ đầu bài${className ? ` · ${className}` : ''}`,
                description: parts.join('\n'),
                date: session.start_time,
              })
            }
          }

          if (session.parent_note && String(session.parent_note).trim()) {
            notes.push({
              id: `p-${session.id}`,
              kind: 'parent_note',
              title: `Dặn dò${className ? ` · ${className}` : ''}`,
              description: String(session.parent_note).trim(),
              date: session.start_time,
            })
          }
        }
      } catch {
        // diary_notes / parent_note chưa migrate
      }
    }

    notes.sort((a, b) => (a.date < b.date ? 1 : -1))
    return { data: notes, loadError: null }
  } catch (e) {
    return {
      data: [],
      loadError:
        e instanceof Error ? e.message : 'Không tải được nhận xét học tập.',
    }
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

/**
 * ĐĂNG KÝ THI LẠI (migration 036): học sinh điểm dưới trung bình gửi
 * đơn vào re_examination_requests - Khảo thí "Duyệt & Xếp lịch" ở
 * /staff/assessments sẽ tự sinh buổi thi lại.
 * - Xác thực điểm/bài thi thuộc CHÍNH học sinh đang đăng nhập.
 * - org_id lấy từ dòng điểm phía server (không tin client).
 */
export async function requestReExamination(
  assessmentId: string,
  reason: string
): Promise<{ error: string } | { error?: undefined }> {
  const trimmedReason = reason.trim()
  if (!assessmentId) return { error: 'Thiếu mã bài kiểm tra.' }
  if (trimmedReason.length < 5) {
    return { error: 'Vui lòng nêu lý do đăng ký thi lại (ít nhất 5 ký tự).' }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    // Điểm của CHÍNH học sinh cho bài này (lấy org_id + grade_id từ server)
    const { data: grade } = await admin
      .from('grades')
      .select('id, org_id, score')
      .eq('assessment_id', assessmentId)
      .eq('student_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!grade) return { error: 'Không tìm thấy điểm của bạn cho bài kiểm tra này.' }

    const { error } = await admin.from('re_examination_requests').insert({
      org_id: grade.org_id,
      student_id: user.id,
      assessment_id: assessmentId,
      grade_id: grade.id,
      reason: trimmedReason.slice(0, 500),
      status: 'pending',
    })
    if (error) {
      if (/uq_reexam_pending/i.test(error.message)) {
        return { error: 'Bạn đã có đơn thi lại đang chờ duyệt cho bài này.' }
      }
      if (/re_examination_requests|does not exist/i.test(error.message)) {
        return { error: 'Tính năng đăng ký thi lại chưa sẵn sàng (thiếu migration 036).' }
      }
      return { error: `Không gửi được đơn: ${error.message}` }
    }
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
