'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { gradeScoreSchema, zodFail } from '@/lib/validation/schemas'

// ============================================================
// Sổ điểm điện tử - actions.
// CHẶN KHI ĐÃ KHÓA (2 tầng):
//   - updateGrade check class_results.is_locked -> từ chối sớm.
//   - Trigger trg_grades_prevent_locked (migration 008) chặn tuyệt
//     đối ở tầng DB, kể cả khi gọi thẳng API Supabase.
// Roster = enrollments status=active (không lấy cả org).
// ============================================================

export type Assessment = {
  id: string
  name: string
  weight: number
  max_score: number
}

export type GradebookStudent = {
  id: string
  full_name: string
}

export type Gradebook = {
  classId: string
  className: string
  assessments: Assessment[]
  students: GradebookStudent[]
  /** key = `${assessmentId}:{studentId}` -> điểm */
  grades: Record<string, number>
  isLocked: boolean
  /** true = user là GV chủ nhiệm lớp hoặc Staff trở lên -> được chốt sổ */
  canLock: boolean
  demo: boolean
  /** Lỗi tải / từ chối quyền — UI hiện thông báo, KHÔNG mock dữ liệu giả */
  loadError?: string | null
}

export type GradeActionResult =
  | { error: string }
  | { error?: undefined; demo?: boolean }

function emptyGradebook(
  classId: string,
  opts?: {
    className?: string
    canLock?: boolean
    isLocked?: boolean
    loadError?: string | null
  }
): Gradebook {
  return {
    classId,
    className: opts?.className ?? '',
    assessments: [],
    students: [],
    grades: {},
    isLocked: opts?.isLocked ?? false,
    canLock: opts?.canLock ?? false,
    demo: false,
    loadError: opts?.loadError ?? null,
  }
}

/** Nạp toàn bộ dữ liệu sổ điểm của một lớp (matrix HS x Bài kiểm tra). */
export async function getGradebook(classId: string): Promise<Gradebook> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return emptyGradebook(classId, {
        loadError: 'Bạn chưa đăng nhập.',
      })
    }

    const { data: cls } = await supabase
      .from('classes')
      .select('id, name, org_id, teacher_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!cls) {
      return emptyGradebook(classId, {
        loadError: 'Không tìm thấy lớp học.',
      })
    }

    const staffAuthRes = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: cls.org_id,
      p_required_role: 'academic_staff',
    })

    const canView = cls.teacher_id === user.id || staffAuthRes.data === true
    if (!canView) {
      return emptyGradebook(classId, {
        className: cls.name,
        loadError: 'Bạn không có quyền xem sổ điểm lớp này.',
      })
    }

    const [assessmentsRes, enrollRes, resultRes] = await Promise.all([
      supabase
        .from('assessments')
        .select('id, name, weight, max_score')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at'),
      supabase
        .from('enrollments')
        .select('student_id, profiles!enrollments_student_id_fkey(id, full_name, deleted_at)')
        .eq('class_id', classId)
        .eq('status', 'active')
        .is('deleted_at', null),
      supabase
        .from('class_results')
        .select('is_locked')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .maybeSingle(),
    ])

    if (assessmentsRes.error) {
      return emptyGradebook(classId, {
        className: cls.name,
        loadError: `Không tải bài kiểm tra: ${assessmentsRes.error.message}`,
      })
    }
    if (enrollRes.error) {
      // Fallback nếu join profiles lỗi tên FK — query 2 bước
      const { data: enrollRows, error: e2 } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('class_id', classId)
        .eq('status', 'active')
        .is('deleted_at', null)
      if (e2) {
        return emptyGradebook(classId, {
          className: cls.name,
          loadError: `Không tải danh sách ghi danh: ${e2.message}`,
        })
      }
      const ids = (enrollRows ?? []).map((r) => r.student_id)
      let students: GradebookStudent[] = []
      if (ids.length > 0) {
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
          .eq('role', 'student')
          .is('deleted_at', null)
          .order('full_name')
        if (pErr) {
          return emptyGradebook(classId, {
            className: cls.name,
            loadError: `Không tải hồ sơ học viên: ${pErr.message}`,
          })
        }
        students = (profiles ?? []).map((p) => ({
          id: p.id,
          full_name: p.full_name,
        }))
      }

      const assessments = (assessmentsRes.data ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        weight: Number(a.weight),
        max_score: Number(a.max_score),
      }))

      const assessmentIds = new Set(assessments.map((a) => a.id))
      const { data: gradeRows } = await supabase
        .from('grades')
        .select('assessment_id, student_id, score')
        .eq('org_id', cls.org_id)
        .is('deleted_at', null)

      const grades: Record<string, number> = {}
      for (const g of gradeRows ?? []) {
        if (assessmentIds.has(g.assessment_id)) {
          grades[`${g.assessment_id}:${g.student_id}`] = Number(g.score)
        }
      }

      return {
        classId,
        className: cls.name,
        assessments,
        students,
        grades,
        isLocked: resultRes.data?.is_locked === true,
        canLock: cls.teacher_id === user.id || staffAuthRes.data === true,
        demo: false,
        loadError: null,
      }
    }

    const assessments = (assessmentsRes.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      weight: Number(a.weight),
      max_score: Number(a.max_score),
    }))

    const students: GradebookStudent[] = []
    for (const row of enrollRes.data ?? []) {
      const profile = row.profiles as
        | { id?: string; full_name?: string; deleted_at?: string | null }
        | { id?: string; full_name?: string; deleted_at?: string | null }[]
        | null
      const p = Array.isArray(profile) ? profile[0] : profile
      if (!p?.id || p.deleted_at) continue
      students.push({ id: p.id, full_name: p.full_name ?? '—' })
    }
    students.sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))

    const assessmentIds = new Set(assessments.map((a) => a.id))
    const { data: gradeRows } = await supabase
      .from('grades')
      .select('assessment_id, student_id, score')
      .eq('org_id', cls.org_id)
      .is('deleted_at', null)

    const grades: Record<string, number> = {}
    for (const g of gradeRows ?? []) {
      if (assessmentIds.has(g.assessment_id)) {
        grades[`${g.assessment_id}:${g.student_id}`] = Number(g.score)
      }
    }

    return {
      classId,
      className: cls.name,
      assessments,
      students,
      grades,
      isLocked: resultRes.data?.is_locked === true,
      canLock: cls.teacher_id === user.id || staffAuthRes.data === true,
      demo: false,
      loadError: null,
    }
  } catch (e) {
    return emptyGradebook(classId, {
      loadError:
        e instanceof Error ? e.message : 'Không tải được sổ điểm.',
    })
  }
}

/**
 * Lưu 1 ô điểm (auto-save khi blur).
 * BẮT BUỘC check khóa sổ TRƯỚC khi ghi - nếu lớp đã locked thì từ chối
 * ngay (tầng 1). Trigger DB (migration 008) là tầng chặn thứ 2.
 */
export async function updateGrade(
  classId: string,
  assessmentId: string,
  studentId: string,
  score: number
): Promise<GradeActionResult> {
  if (!classId || !assessmentId || !studentId) {
    return { error: 'Thiếu thông tin ô điểm.' }
  }
  const parsedScore = gradeScoreSchema.safeParse(score)
  if (!parsedScore.success) return zodFail(parsedScore.error)
  score = parsedScore.data

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: result } = await supabase
      .from('class_results')
      .select('lock_status')
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (result?.lock_status === 'locked') {
      return { error: 'Đã hết hạn nhập điểm. Vui lòng liên hệ phòng Khảo thí.' }
    }

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, class_id, max_score, grading_deadline, org_id')
      .eq('id', assessmentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!assessment || assessment.class_id !== classId) {
      return { error: 'Bài kiểm tra không thuộc lớp này.' }
    }
    if (
      assessment.grading_deadline &&
      new Date(assessment.grading_deadline).getTime() < Date.now()
    ) {
      return { error: 'Đã quá hạn nhập điểm của bài này.' }
    }
    if (score > Number(assessment.max_score)) {
      return { error: `Điểm tối đa là ${assessment.max_score}.` }
    }

    // Học viên phải đang ghi danh active
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()
    if (!enrollment) {
      return { error: 'Học viên không còn trong danh sách ghi danh lớp.' }
    }

    const { data: cls } = await supabase
      .from('classes')
      .select('org_id, teacher_id')
      .eq('id', classId)
      .maybeSingle()
    if (!cls) return { error: 'Không tìm thấy lớp.' }

    const { data: staffOk } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: cls.org_id,
      p_required_role: 'academic_staff',
    })
    if (cls.teacher_id !== user.id && staffOk !== true) {
      return { error: 'Bạn không có quyền nhập điểm lớp này.' }
    }

    const { data: existing } = await supabase
      .from('grades')
      .select('id')
      .eq('assessment_id', assessmentId)
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('grades')
        .update({
          score,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) {
        if (/GRADEBOOK_LOCKED|GRADING_DEADLINE/i.test(error.message)) {
          return { error: 'Sổ điểm đã khóa hoặc quá hạn nhập.' }
        }
        return { error: `Không lưu điểm: ${error.message}` }
      }
    } else {
      const { error } = await supabase.from('grades').insert({
        org_id: cls.org_id,
        assessment_id: assessmentId,
        student_id: studentId,
        score,
      })
      if (error) {
        if (/GRADEBOOK_LOCKED|GRADING_DEADLINE/i.test(error.message)) {
          return { error: 'Sổ điểm đã khóa hoặc quá hạn nhập.' }
        }
        return { error: `Không lưu điểm: ${error.message}` }
      }
    }

    revalidatePath(`/teacher/grades/${classId}`)
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi lưu điểm.',
    }
  }
}

export async function lockGradebook(classId: string): Promise<GradeActionResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: cls } = await supabase
      .from('classes')
      .select('id, org_id, teacher_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls) return { error: 'Không tìm thấy lớp.' }

    const { data: staffOk } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: cls.org_id,
      p_required_role: 'academic_staff',
    })
    if (cls.teacher_id !== user.id && staffOk !== true) {
      return { error: 'Chỉ GV chủ nhiệm hoặc Giáo vụ được chốt sổ.' }
    }

    const now = new Date().toISOString()
    const { data: existing } = await supabase
      .from('class_results')
      .select('id')
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('class_results')
        .update({
          lock_status: 'locked',
          locked_at: now,
          locked_by: user.id,
          updated_at: now,
        })
        .eq('id', existing.id)
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('class_results').insert({
        class_id: classId,
        org_id: cls.org_id,
        lock_status: 'locked',
        locked_at: now,
        locked_by: user.id,
      })
      if (error) return { error: error.message }
    }

    revalidatePath(`/teacher/grades/${classId}`)
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi chốt sổ điểm.',
    }
  }
}
