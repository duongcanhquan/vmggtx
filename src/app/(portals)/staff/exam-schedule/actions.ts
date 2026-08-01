'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// PORTAL KHẢO THÍ (/staff/exam-schedule) - migration 031
// - Xếp lịch thi cho bài kiểm tra (assessment): hệ thống TỰ CHIA
//   PHÒNG theo sĩ số lớp / sức chứa phòng.
// - Kéo thả phân công GIÁM THỊ (GT1/GT2) vào từng phòng, chống
//   trùng lịch coi thi.
// - Xử lý yêu cầu PHÚC KHẢO của học sinh (grades.review_status).
// [ĐA TẦNG] SSR client + RLS subtree, double-check role tường minh.
// ============================================================

const STAFF_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

export type ExamAssessment = {
  id: string
  name: string
  className: string
  studentCount: number
}

export type ProctorChip = {
  id: string
  teacherId: string
  teacherName: string
  role: 'proctor_1' | 'proctor_2'
}

export type ExamRoom = {
  id: string
  assessmentName: string
  className: string
  room: string
  capacity: number | null
  startTime: string
  endTime: string
  proctors: ProctorChip[]
}

export type ReviewRequestRow = {
  gradeId: string
  studentName: string
  assessmentName: string
  className: string
  score: number
  maxScore: number
  reason: string | null
  requestedAt: string | null
}

export type ExamBoard = {
  assessments: ExamAssessment[]
  rooms: ExamRoom[]
  teachers: { id: string; name: string }[]
  reviewRequests: ReviewRequestRow[]
}

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
    return { error: 'Chức năng này dành cho Giáo vụ / Khảo thí.' }
  }
  return { userId: user.id, orgId: profile.org_id }
}

const pickName = (value: unknown): string | null => {
  const obj = Array.isArray(value) ? value[0] : value
  return (
    (obj as { name?: string; full_name?: string } | null)?.name ??
    (obj as { full_name?: string } | null)?.full_name ??
    null
  )
}

/** Toàn bộ dữ liệu bảng điều khiển Khảo thí */
export async function getExamBoard(): Promise<
  { error: string } | { error?: undefined; board: ExamBoard }
> {
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, auth.orgId)

    const [assessmentsResult, schedulesResult, teachersResult] = await Promise.all([
      supabase
        .from('assessments')
        .select('id, name, class_id, classes(name)')
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('exam_schedules')
        .select(
          'id, room, capacity, start_time, end_time, assessments(name, classes(name)), exam_proctors(id, teacher_id, role, profiles(full_name))'
        )
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('start_time'),
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'teacher')
        .is('deleted_at', null)
        .order('full_name')
        .limit(300),
    ])

    if (schedulesResult.error && /exam_schedules/i.test(schedulesResult.error.message)) {
      return {
        error: 'Tính năng chưa sẵn sàng: database chưa chạy migration 031_exam_ops.sql.',
      }
    }

    // Sĩ số active của từng lớp (để tự chia phòng)
    const classIds = [
      ...new Set((assessmentsResult.data ?? []).map((a) => a.class_id)),
    ]
    const countByClass = new Map<string, number>()
    if (classIds.length > 0) {
      const { data: enrollRows } = await supabase
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'active')
        .is('deleted_at', null)
      for (const row of enrollRows ?? []) {
        countByClass.set(row.class_id, (countByClass.get(row.class_id) ?? 0) + 1)
      }
    }

    const assessments: ExamAssessment[] = (assessmentsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      className: pickName(row.classes) ?? 'Lớp học',
      studentCount: countByClass.get(row.class_id) ?? 0,
    }))

    const rooms: ExamRoom[] = (schedulesResult.data ?? []).map((row) => {
      const assessment = (Array.isArray(row.assessments)
        ? row.assessments[0]
        : row.assessments) as unknown as { name?: string; classes?: unknown } | null
      const proctors = ((row.exam_proctors ?? []) as unknown as {
        id: string
        teacher_id: string
        role: string
        profiles: unknown
      }[]).map((p) => ({
        id: p.id,
        teacherId: p.teacher_id,
        teacherName: pickName(p.profiles) ?? 'Giáo viên',
        role: (p.role as 'proctor_1' | 'proctor_2') ?? 'proctor_1',
      }))
      proctors.sort((a, b) => a.role.localeCompare(b.role))
      return {
        id: row.id,
        assessmentName: assessment?.name ?? 'Bài thi',
        className: pickName(assessment?.classes) ?? 'Lớp học',
        room: row.room,
        capacity: row.capacity,
        startTime: row.start_time,
        endTime: row.end_time,
        proctors,
      }
    })

    // Yêu cầu phúc khảo đang chờ (cột 031 có thể chưa có -> bỏ qua êm)
    let reviewRequests: ReviewRequestRow[] = []
    const { data: reviewRows } = await supabase
      .from('grades')
      .select(
        'id, score, review_reason, review_requested_at, profiles(full_name), assessments(name, max_score, classes(name))'
      )
      .in('org_id', orgIds)
      .eq('review_status', 'under_review')
      .is('deleted_at', null)
      .order('review_requested_at', { ascending: true })
    if (reviewRows) {
      reviewRequests = reviewRows.map((row) => {
        const assessment = (Array.isArray(row.assessments)
          ? row.assessments[0]
          : row.assessments) as unknown as {
          name?: string
          max_score?: number
          classes?: unknown
        } | null
        return {
          gradeId: row.id,
          studentName: pickName(row.profiles) ?? 'Học sinh',
          assessmentName: assessment?.name ?? 'Bài kiểm tra',
          className: pickName(assessment?.classes) ?? 'Lớp học',
          score: Number(row.score),
          maxScore: Number(assessment?.max_score ?? 10),
          reason: row.review_reason,
          requestedAt: row.review_requested_at,
        }
      })
    }

    return {
      board: {
        assessments,
        rooms,
        teachers: (teachersResult.data ?? []).map((t) => ({ id: t.id, name: t.full_name })),
        reviewRequests,
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * Xếp lịch thi: TỰ ĐỘNG CHIA PHÒNG = ceil(sĩ số lớp / sức chứa).
 * Mỗi phòng là 1 dòng exam_schedules (P.Thi 1, P.Thi 2...).
 */
export async function createExamSchedule(
  assessmentId: string,
  startISO: string,
  endISO: string,
  capacity: number,
  roomPrefix: string
): Promise<{ error: string } | { error?: undefined; roomCount: number }> {
  const start = new Date(startISO)
  const end = new Date(endISO)
  if (!assessmentId) return { error: 'Vui lòng chọn bài thi.' }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Thời gian thi không hợp lệ.' }
  }
  if (end <= start) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    return { error: 'Sức chứa mỗi phòng phải từ 1 đến 500.' }
  }

  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, org_id, class_id')
      .eq('id', assessmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assessment) return { error: 'Bài thi không tồn tại hoặc ngoài phạm vi.' }

    const { count } = await supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', assessment.class_id)
      .eq('status', 'active')
      .is('deleted_at', null)
    const studentCount = count ?? 0
    const roomCount = Math.max(1, Math.ceil(studentCount / capacity))
    if (roomCount > 30) {
      return { error: `Cần tới ${roomCount} phòng — hãy tăng sức chứa mỗi phòng.` }
    }

    const prefix = roomPrefix.trim() || 'P.Thi'
    const rows = Array.from({ length: roomCount }, (_, index) => ({
      org_id: assessment.org_id,
      assessment_id: assessmentId,
      room: `${prefix} ${index + 1}`,
      capacity,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      created_by: auth.userId,
    }))

    const { error } = await supabase.from('exam_schedules').insert(rows)
    if (error) {
      if (/exam_schedules/i.test(error.message) && /does not exist|relation/i.test(error.message)) {
        return { error: 'Cần chạy migration 031_exam_ops.sql trước (Supabase SQL Editor).' }
      }
      return { error: `Không tạo được lịch thi: ${error.message}` }
    }

    revalidatePath('/staff/exam-schedule')
    return { roomCount }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Kéo thả giám thị vào phòng: tối đa 2 (GT1 + GT2), chống trùng ca coi thi */
export async function assignProctor(
  examScheduleId: string,
  teacherId: string
): Promise<ActionResult> {
  if (!examScheduleId || !teacherId) return { error: 'Thiếu thông tin phân công.' }
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { data: room } = await supabase
      .from('exam_schedules')
      .select('id, start_time, end_time, exam_proctors(id, teacher_id, role)')
      .eq('id', examScheduleId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!room) return { error: 'Phòng thi không tồn tại hoặc ngoài phạm vi.' }

    const existing = (room.exam_proctors ?? []) as { teacher_id: string; role: string }[]
    if (existing.some((p) => p.teacher_id === teacherId)) {
      return { error: 'Giáo viên này đã được phân công vào phòng này.' }
    }
    if (existing.length >= 2) {
      return { error: 'Phòng đã đủ 2 giám thị (GT1 + GT2).' }
    }

    // Chống trùng ca coi thi: GV đã gác phòng khác giao khung giờ này?
    const { data: otherAssignments } = await supabase
      .from('exam_proctors')
      .select('id, exam_schedules!inner(start_time, end_time, deleted_at)')
      .eq('teacher_id', teacherId)
    const overlapping = (otherAssignments ?? []).some((row) => {
      const schedule = (Array.isArray(row.exam_schedules)
        ? row.exam_schedules[0]
        : row.exam_schedules) as unknown as {
        start_time: string
        end_time: string
        deleted_at: string | null
      } | null
      if (!schedule || schedule.deleted_at !== null) return false
      return schedule.start_time < room.end_time && schedule.end_time > room.start_time
    })
    if (overlapping) {
      return { error: 'Giáo viên này đã gác thi phòng khác trong cùng khung giờ.' }
    }

    const role = existing.some((p) => p.role === 'proctor_1') ? 'proctor_2' : 'proctor_1'
    const { error } = await supabase.from('exam_proctors').insert({
      exam_schedule_id: examScheduleId,
      teacher_id: teacherId,
      role,
    })
    if (error) return { error: `Không phân công được giám thị: ${error.message}` }

    revalidatePath('/staff/exam-schedule')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Gỡ giám thị khỏi phòng */
export async function removeProctor(proctorId: string): Promise<ActionResult> {
  if (!proctorId) return { error: 'Thiếu mã phân công.' }
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error } = await supabase.from('exam_proctors').delete().eq('id', proctorId)
    if (error) return { error: `Không gỡ được giám thị: ${error.message}` }

    revalidatePath('/staff/exam-schedule')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Xóa phòng thi (soft delete, giám thị đi kèm hết hiệu lực) */
export async function deleteExamRoom(examScheduleId: string): Promise<ActionResult> {
  if (!examScheduleId) return { error: 'Thiếu mã phòng thi.' }
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error } = await supabase
      .from('exam_schedules')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', examScheduleId)
    if (error) return { error: `Không xóa được phòng thi: ${error.message}` }

    revalidatePath('/staff/exam-schedule')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * Xử lý PHÚC KHẢO: nhập điểm mới (nếu thay đổi) và đóng yêu cầu.
 * newScore = null -> giữ nguyên điểm, chỉ đóng yêu cầu.
 */
export async function resolveGradeReview(
  gradeId: string,
  newScore: number | null,
  responseNote: string
): Promise<ActionResult> {
  if (!gradeId) return { error: 'Thiếu mã điểm.' }
  if (newScore !== null && (!Number.isFinite(newScore) || newScore < 0)) {
    return { error: 'Điểm mới không hợp lệ.' }
  }
  try {
    const auth = await requireStaff()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const update: Record<string, unknown> = {
      review_status: 'resolved',
    }
    if (newScore !== null) update.score = newScore
    if (responseNote.trim()) update.note = `[Phúc khảo] ${responseNote.trim()}`

    const { error, count } = await supabase
      .from('grades')
      .update(update, { count: 'exact' })
      .eq('id', gradeId)
      .eq('review_status', 'under_review')
    if (error) return { error: `Không xử lý được phúc khảo: ${error.message}` }
    if (count === 0) return { error: 'Yêu cầu không tồn tại hoặc đã được xử lý.' }

    revalidatePath('/staff/exam-schedule')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
