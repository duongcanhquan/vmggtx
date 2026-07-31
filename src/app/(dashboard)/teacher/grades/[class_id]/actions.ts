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
}

export type GradeActionResult =
  | { error: string }
  | { error?: undefined; demo?: boolean }

// ---------- MOCK cho chế độ demo ----------
const MOCK_ASSESSMENTS: Assessment[] = [
  { id: 'as-1', name: '15 phút', weight: 0.1, max_score: 10 },
  { id: 'as-2', name: '1 tiết', weight: 0.2, max_score: 10 },
  { id: 'as-3', name: 'Giữa kỳ', weight: 0.3, max_score: 10 },
  { id: 'as-4', name: 'Cuối kỳ', weight: 0.4, max_score: 10 },
]

const MOCK_STUDENTS: GradebookStudent[] = [
  { id: 'st-1', full_name: 'Nguyễn Văn Toàn' },
  { id: 'st-2', full_name: 'Đỗ Thu Hà' },
  { id: 'st-3', full_name: 'Vũ Đức Mạnh' },
  { id: 'st-4', full_name: 'Hoàng Ngọc Lan' },
  { id: 'st-5', full_name: 'Trần Bảo Long' },
]

const MOCK_GRADES: Record<string, number> = {
  'as-1:st-1': 8, 'as-2:st-1': 7.5, 'as-3:st-1': 8.5,
  'as-1:st-2': 9, 'as-2:st-2': 9, 'as-3:st-2': 8, 'as-4:st-2': 9.5,
  'as-1:st-3': 6.5, 'as-2:st-3': 7,
  'as-1:st-4': 10, 'as-2:st-4': 9.5, 'as-3:st-4': 9,
  'as-1:st-5': 7,
}

function mockGradebook(classId: string): Gradebook {
  return {
    classId,
    className: 'Toán 12A - Ôn thi THPT (demo)',
    assessments: MOCK_ASSESSMENTS,
    students: MOCK_STUDENTS,
    grades: { ...MOCK_GRADES },
    isLocked: false,
    canLock: true,
    demo: true,
  }
}

/** Nạp toàn bộ dữ liệu sổ điểm của một lớp (matrix HS x Bài kiểm tra). */
export async function getGradebook(classId: string): Promise<Gradebook> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return mockGradebook(classId)

    const { data: cls } = await supabase
      .from('classes')
      .select('id, name, org_id, teacher_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!cls) return mockGradebook(classId)

    const [assessmentsRes, studentsRes, gradesRes, resultRes, staffAuthRes] =
      await Promise.all([
        supabase
          .from('assessments')
          .select('id, name, weight, max_score')
          .eq('class_id', classId)
          .is('deleted_at', null)
          .order('created_at'),
        // Chưa có bảng enrollments: tạm lấy học viên thuộc org của lớp
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'student')
          .eq('org_id', cls.org_id)
          .is('deleted_at', null)
          .order('full_name')
          .limit(100),
        supabase
          .from('grades')
          .select('assessment_id, student_id, score')
          .eq('org_id', cls.org_id)
          .is('deleted_at', null),
        supabase
          .from('class_results')
          .select('is_locked')
          .eq('class_id', classId)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase.rpc('is_authorized', {
          p_user_id: user.id,
          p_target_org_id: cls.org_id,
          p_required_role: 'academic_staff',
        }),
      ])

    // ===== [SECURITY AUDIT] GATE DỮ LIỆU: chỉ GV chủ nhiệm lớp hoặc
    // Staff trở lên trên org của lớp mới được xem sổ điểm thật =====
    const canView = cls.teacher_id === user.id || staffAuthRes.data === true
    if (!canView) {
      return mockGradebook(classId)
    }

    const assessments = (assessmentsRes.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      weight: Number(a.weight),
      max_score: Number(a.max_score),
    }))
    const students = studentsRes.data ?? []

    if (assessments.length === 0 || students.length === 0) {
      return mockGradebook(classId)
    }

    const assessmentIds = new Set(assessments.map((a) => a.id))
    const grades: Record<string, number> = {}
    for (const g of gradesRes.data ?? []) {
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
      // Chỉ GV chủ nhiệm hoặc Staff trở lên mới thấy nút "Chốt Sổ Điểm"
      canLock: cls.teacher_id === user.id || staffAuthRes.data === true,
      demo: false,
    }
  } catch {
    return mockGradebook(classId)
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
  // ===== QA GATE: điểm PHẢI trong khoảng 0-10 (Zod) trước khi chạm DB =====
  const parsedScore = gradeScoreSchema.safeParse(score)
  if (!parsedScore.success) return zodFail(parsedScore.error)
  score = parsedScore.data

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Demo mode: không ghi DB, trả thành công để UI mượt
    if (!user) return { demo: true }

    // ===== CHECK 1: LỚP ĐÃ CHỐT SỔ (lock_status - migration 023)? =====
    const { data: result } = await supabase
      .from('class_results')
      .select('lock_status')
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (result?.lock_status === 'locked') {
      return { error: 'Đã hết hạn nhập điểm. Vui lòng liên hệ phòng Khảo thí.' }
    }

    // ===== CHECK 2: bài kiểm tra thuộc đúng lớp + CÒN HẠN NHẬP ĐIỂM =====
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, class_id, org_id, max_score, grading_deadline')
      .eq('id', assessmentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!assessment || assessment.class_id !== classId) {
      return { error: 'Bài kiểm tra không thuộc lớp này.' }
    }
    // [KHẢO THÍ] NOW() vượt grading_deadline -> chặn (Gia hạn = dời deadline)
    if (
      assessment.grading_deadline !== null &&
      Date.now() > new Date(assessment.grading_deadline as string).getTime()
    ) {
      return { error: 'Đã hết hạn nhập điểm. Vui lòng liên hệ phòng Khảo thí.' }
    }
    if (score > Number(assessment.max_score)) {
      return { error: `Điểm tối đa của bài này là ${assessment.max_score}.` }
    }

    // ===== CHECK 3: quyền - GV chủ nhiệm hoặc Staff trên org của lớp =====
    const { data: cls } = await supabase
      .from('classes')
      .select('teacher_id, org_id')
      .eq('id', classId)
      .maybeSingle()

    if (cls?.teacher_id !== user.id) {
      const { data: authorized } = await supabase.rpc('is_authorized', {
        p_user_id: user.id,
        p_target_org_id: assessment.org_id,
        p_required_role: 'academic_staff',
      })
      if (authorized !== true) {
        return { error: 'TỪ CHỐI: Bạn không có quyền nhập điểm cho lớp này.' }
      }
    }

    // ===== Upsert điểm (trigger DB sẽ chặn thêm lần nữa nếu locked) =====
    const { error } = await supabase.from('grades').upsert(
      {
        org_id: assessment.org_id,
        assessment_id: assessmentId,
        student_id: studentId,
        score,
      },
      { onConflict: 'assessment_id,student_id' }
    )

    if (error) {
      if (
        error.message.includes('GRADEBOOK_LOCKED') ||
        error.message.includes('GRADING_DEADLINE_PASSED')
      ) {
        return { error: 'Đã hết hạn nhập điểm. Vui lòng liên hệ phòng Khảo thí.' }
      }
      return { error: `Lỗi lưu điểm: ${error.message}` }
    }

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}

/**
 * Chốt Sổ Điểm: set class_results.is_locked = true.
 * Chỉ GV chủ nhiệm lớp hoặc Staff/Campus Admin (trên org của lớp).
 */
export async function lockGradebook(classId: string): Promise<GradeActionResult> {
  if (!classId) return { error: 'Thiếu ID lớp học.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Demo mode: UI tự chuyển trạng thái khóa cục bộ
    if (!user) return { demo: true }

    const { data: cls } = await supabase
      .from('classes')
      .select('id, org_id, teacher_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!cls) return { error: 'Lớp học không tồn tại.' }

    // Quyền chốt sổ: GV chủ nhiệm HOẶC academic_staff trở lên trên org của lớp
    if (cls.teacher_id !== user.id) {
      const { data: authorized } = await supabase.rpc('is_authorized', {
        p_user_id: user.id,
        p_target_org_id: cls.org_id,
        p_required_role: 'academic_staff',
      })
      if (authorized !== true) {
        return { error: 'TỪ CHỐI: Chỉ Giáo viên chủ nhiệm hoặc Giáo vụ mới được chốt sổ.' }
      }
    }

    // lock_status là nguồn sự thật (is_locked giờ là GENERATED COLUMN)
    const { error } = await supabase.from('class_results').upsert(
      {
        org_id: cls.org_id,
        class_id: classId,
        lock_status: 'locked',
        locked_at: new Date().toISOString(),
        locked_by: user.id,
      },
      { onConflict: 'class_id' }
    )

    if (error) return { error: `Lỗi chốt sổ: ${error.message}` }

    revalidatePath(`/teacher/grades/${classId}`)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}
