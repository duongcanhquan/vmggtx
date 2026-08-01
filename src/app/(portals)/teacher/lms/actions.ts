'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  buildObjectKey,
  isAllowedMimeType,
  isR2Configured,
  MAX_FILE_SIZE_BYTES,
  presignDownload,
  presignUpload,
} from '@/lib/storage/r2'

// ============================================================
// LMS - phía GIÁO VIÊN: soạn bài giảng, giao bài tập, chấm bài,
// tạo đề trắc nghiệm và đồng bộ điểm vào Sổ điểm chính thức.
// Quyền: GV chủ nhiệm lớp HOẶC academic_staff+ trong subtree.
// ============================================================

export type AttachmentMeta = {
  key: string
  name: string
  size: number
  type: string
}

const attachmentSchema = z.object({
  key: z.string().min(1).max(500),
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  type: z.string().max(150),
})

export type LmsLesson = {
  id: string
  title: string
  description: string | null
  content: string | null
  video_url: string | null
  attachments: AttachmentMeta[]
  status: 'draft' | 'published'
  created_at: string
}

export type LmsAssignment = {
  id: string
  title: string
  instructions: string | null
  attachments: AttachmentMeta[]
  due_at: string | null
  max_score: number
  allow_late: boolean
  submission_count: number
  graded_count: number
}

export type LmsQuiz = {
  id: string
  title: string
  description: string | null
  duration_minutes: number
  is_published: boolean
  question_count: number
  attempt_count: number
}

export type ClassLmsData = {
  classId: string
  className: string
  orgId: string
  r2Ready: boolean
  lessons: LmsLesson[]
  assignments: LmsAssignment[]
  quizzes: LmsQuiz[]
}

type ActionResult<T = undefined> =
  | { error: string }
  | { error?: undefined; data?: T }

// ---------- Kiểm tra quyền dùng chung ----------
type ClassAuth =
  | { error: string; supabase?: undefined; user?: undefined; cls?: undefined }
  | {
      error?: undefined
      supabase: ReturnType<typeof createClient>
      user: { id: string }
      cls: { id: string; name: string; org_id: string; teacher_id: string | null }
    }

async function authorizeClass(classId: string): Promise<ClassAuth> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn cần đăng nhập.' }

  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, org_id, teacher_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!cls) return { error: 'Không tìm thấy lớp học.' }

  let allowed = cls.teacher_id === user.id
  if (!allowed) {
    const { data: staffOk } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: cls.org_id,
      p_required_role: 'academic_staff',
    })
    allowed = Boolean(staffOk)
  }
  if (!allowed) return { error: 'Bạn không có quyền với lớp này.' }

  return { supabase, user, cls }
}

// ---------- 1. Danh sách lớp + dữ liệu LMS ----------
export async function getClassLmsData(classId: string): Promise<ClassLmsData | { error: string }> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, cls } = auth

    const [lessonsRes, assignmentsRes, quizzesRes] = await Promise.all([
      supabase
        .from('lms_lessons')
        .select('id, title, description, content, video_url, attachments, status, created_at')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('lms_assignments')
        .select('id, title, instructions, attachments, due_at, max_score, allow_late, lms_submissions(id, score)')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('lms_quizzes')
        .select('id, title, description, duration_minutes, is_published, lms_quiz_questions(id), lms_quiz_attempts(id)')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ])

    return {
      classId,
      className: cls.name,
      orgId: cls.org_id,
      r2Ready: isR2Configured(),
      lessons: (lessonsRes.data ?? []) as LmsLesson[],
      assignments: (assignmentsRes.data ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        instructions: a.instructions,
        attachments: (a.attachments ?? []) as AttachmentMeta[],
        due_at: a.due_at,
        max_score: Number(a.max_score),
        allow_late: a.allow_late,
        submission_count: (a.lms_submissions ?? []).length,
        graded_count: (a.lms_submissions ?? []).filter(
          (s: { score: number | null }) => s.score !== null
        ).length,
      })),
      quizzes: (quizzesRes.data ?? []).map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        duration_minutes: q.duration_minutes,
        is_published: q.is_published,
        question_count: (q.lms_quiz_questions ?? []).length,
        attempt_count: (q.lms_quiz_attempts ?? []).length,
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải dữ liệu LMS.' }
  }
}

// ---------- 2. Upload file (presigned PUT) ----------
const presignSchema = z.object({
  classId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(150),
  fileSize: z.number().int().positive(),
})

export async function presignLmsUpload(
  input: z.infer<typeof presignSchema>
): Promise<{ error: string } | { url: string; key: string }> {
  try {
    const parsed = presignSchema.safeParse(input)
    if (!parsed.success) return { error: 'Thông tin file không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }

    if (!isR2Configured())
      return { error: 'Chưa cấu hình lưu trữ R2 (xem VERCEL_DEPLOYMENT_CHECKLIST.md).' }
    if (parsed.data.fileSize > MAX_FILE_SIZE_BYTES)
      return { error: 'File vượt quá 50MB.' }
    if (!isAllowedMimeType(parsed.data.fileType))
      return { error: 'Định dạng file không được hỗ trợ.' }

    const key = buildObjectKey(auth.cls.org_id, `lms/${parsed.data.classId}`, parsed.data.fileName)
    return await presignUpload(key, parsed.data.fileType)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không tạo được link upload.' }
  }
}

/** Link tải file (GV): key phải nằm trong attachments của đúng bản ghi */
export async function getTeacherDownloadUrl(input: {
  classId: string
  kind: 'lesson' | 'assignment' | 'submission'
  recordId: string
  key: string
  fileName: string
}): Promise<{ error: string } | { url: string }> {
  try {
    const auth = await authorizeClass(input.classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase } = auth

    // Ràng class_id để không tải file của lớp khác cùng quyền quản lý
    let attachments: AttachmentMeta[] = []
    if (input.kind === 'lesson' || input.kind === 'assignment') {
      const table = input.kind === 'lesson' ? 'lms_lessons' : 'lms_assignments'
      const { data: row } = await supabase
        .from(table)
        .select('attachments')
        .eq('id', input.recordId)
        .eq('class_id', input.classId)
        .maybeSingle()
      attachments = (row?.attachments ?? []) as AttachmentMeta[]
    } else {
      const { data: row } = await supabase
        .from('lms_submissions')
        .select('attachments, lms_assignments!inner(class_id)')
        .eq('id', input.recordId)
        .eq('lms_assignments.class_id', input.classId)
        .maybeSingle()
      attachments = (row?.attachments ?? []) as AttachmentMeta[]
    }

    if (!attachments.some((f) => f.key === input.key))
      return { error: 'File không thuộc bản ghi này.' }

    return { url: await presignDownload(input.key, input.fileName) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không tạo được link tải.' }
  }
}

// ---------- 3. Bài giảng ----------
const lessonSchema = z.object({
  id: z.string().uuid().optional(),
  classId: z.string().uuid(),
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(200),
  description: z.string().trim().max(1000).optional().default(''),
  content: z.string().max(50000).optional().default(''),
  videoUrl: z
    .string()
    .trim()
    .url('Link video không hợp lệ')
    .max(500)
    .optional()
    .or(z.literal('')),
  attachments: z.array(attachmentSchema).max(10).default([]),
  status: z.enum(['draft', 'published']).default('draft'),
})

export async function saveLesson(input: z.infer<typeof lessonSchema>): Promise<ActionResult> {
  try {
    const parsed = lessonSchema.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, user, cls } = auth

    const payload = {
      org_id: cls.org_id,
      class_id: cls.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content || null,
      video_url: parsed.data.videoUrl || null,
      attachments: parsed.data.attachments,
      status: parsed.data.status,
    }

    const { error } = parsed.data.id
      ? await supabase
          .from('lms_lessons')
          .update(payload)
          .eq('id', parsed.data.id)
          .eq('class_id', cls.id) // chặn di chuyển bài sang lớp khác
      : await supabase.from('lms_lessons').insert({ ...payload, created_by: user.id })
    if (error) return { error: 'Không lưu được bài giảng: ' + error.message }

    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu bài giảng.' }
  }
}

export async function deleteLesson(classId: string, lessonId: string): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { error } = await auth.supabase
      .from('lms_lessons')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', lessonId)
      .eq('class_id', classId)
    if (error) return { error: error.message }
    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa bài giảng.' }
  }
}

// ---------- 4. Bài tập ----------
const assignmentSchema = z.object({
  id: z.string().uuid().optional(),
  classId: z.string().uuid(),
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(200),
  instructions: z.string().trim().max(10000).optional().default(''),
  dueAt: z.string().datetime({ offset: true }).optional().or(z.literal('')),
  allowLate: z.boolean().default(true),
  attachments: z.array(attachmentSchema).max(10).default([]),
})

export async function saveAssignment(
  input: z.infer<typeof assignmentSchema>
): Promise<ActionResult> {
  try {
    const parsed = assignmentSchema.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, user, cls } = auth

    const payload = {
      org_id: cls.org_id,
      class_id: cls.id,
      title: parsed.data.title,
      instructions: parsed.data.instructions || null,
      due_at: parsed.data.dueAt || null,
      allow_late: parsed.data.allowLate,
      attachments: parsed.data.attachments,
    }

    const { error } = parsed.data.id
      ? await supabase
          .from('lms_assignments')
          .update(payload)
          .eq('id', parsed.data.id)
          .eq('class_id', cls.id)
      : await supabase.from('lms_assignments').insert({ ...payload, created_by: user.id })
    if (error) return { error: 'Không lưu được bài tập: ' + error.message }

    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu bài tập.' }
  }
}

export async function deleteAssignment(
  classId: string,
  assignmentId: string
): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { error } = await auth.supabase
      .from('lms_assignments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .eq('class_id', classId)
    if (error) return { error: error.message }
    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa bài tập.' }
  }
}

// ---------- 5. Xem & chấm bài nộp ----------
export type SubmissionRow = {
  id: string
  student_id: string
  student_name: string
  content: string | null
  attachments: AttachmentMeta[]
  is_late: boolean
  submitted_at: string
  score: number | null
  feedback: string | null
}

export async function getSubmissions(
  classId: string,
  assignmentId: string
): Promise<{ error: string } | { data: SubmissionRow[] }> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }

    const { data: assignment } = await auth.supabase
      .from('lms_assignments')
      .select('id')
      .eq('id', assignmentId)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assignment) return { error: 'Bài tập không thuộc lớp này.' }

    const { data, error } = await auth.supabase
      .from('lms_submissions')
      .select(
        'id, student_id, content, attachments, is_late, submitted_at, score, feedback, profiles!lms_submissions_student_id_fkey(full_name)'
      )
      .eq('assignment_id', assignmentId)
      .is('deleted_at', null)
      .order('submitted_at')
    if (error) return { error: error.message }

    return {
      data: (data ?? []).map((s) => ({
        id: s.id,
        student_id: s.student_id,
        student_name:
          (s.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Học viên',
        content: s.content,
        attachments: (s.attachments ?? []) as AttachmentMeta[],
        is_late: s.is_late,
        submitted_at: s.submitted_at,
        score: s.score === null ? null : Number(s.score),
        feedback: s.feedback,
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải bài nộp.' }
  }
}

const gradeSchema = z.object({
  classId: z.string().uuid(),
  submissionId: z.string().uuid(),
  score: z.number().min(0, 'Điểm từ 0-10').max(10, 'Điểm từ 0-10'),
  feedback: z.string().trim().max(2000).optional().default(''),
})

export async function gradeSubmission(input: z.infer<typeof gradeSchema>): Promise<ActionResult> {
  try {
    const parsed = gradeSchema.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Điểm không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }

    // Chỉ chấm bài nộp thuộc bài tập của đúng lớp đang mở
    const { data: owned } = await auth.supabase
      .from('lms_submissions')
      .select('id, lms_assignments!inner(class_id)')
      .eq('id', parsed.data.submissionId)
      .eq('lms_assignments.class_id', parsed.data.classId)
      .maybeSingle()
    if (!owned) return { error: 'Bài nộp không thuộc lớp này.' }

    const { error } = await auth.supabase
      .from('lms_submissions')
      .update({
        score: parsed.data.score,
        feedback: parsed.data.feedback || null,
        graded_by: auth.user.id,
        graded_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.submissionId)
    if (error) return { error: 'Không lưu được điểm: ' + error.message }

    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi chấm bài.' }
  }
}

// ---------- 6. Quiz trắc nghiệm ----------
const quizQuestionSchema = z.object({
  question: z.string().trim().min(3, 'Câu hỏi tối thiểu 3 ký tự').max(2000),
  options: z.array(z.string().trim().min(1).max(500)).min(2, 'Tối thiểu 2 phương án').max(6),
  correctIndex: z.number().int().min(0),
  points: z.number().positive().max(100).default(1),
})

const quizSchema = z
  .object({
    id: z.string().uuid().optional(),
    classId: z.string().uuid(),
    title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(200),
    description: z.string().trim().max(1000).optional().default(''),
    durationMinutes: z.number().int().min(1).max(180),
    isPublished: z.boolean().default(false),
    questions: z.array(quizQuestionSchema).min(1, 'Cần ít nhất 1 câu hỏi').max(100),
  })
  .refine(
    (q) => q.questions.every((c) => c.correctIndex < c.options.length),
    { message: 'Đáp án đúng phải nằm trong danh sách phương án.' }
  )

export async function saveQuiz(input: z.infer<typeof quizSchema>): Promise<ActionResult> {
  try {
    const parsed = quizSchema.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu quiz không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, user, cls } = auth

    let quizId = parsed.data.id
    const quizPayload = {
      org_id: cls.org_id,
      class_id: cls.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      duration_minutes: parsed.data.durationMinutes,
      is_published: parsed.data.isPublished,
    }

    if (quizId) {
      // Xác nhận đề thuộc đúng lớp trước khi đụng câu hỏi / lượt làm
      const { data: existingQuiz } = await supabase
        .from('lms_quizzes')
        .select('id')
        .eq('id', quizId)
        .eq('class_id', cls.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (!existingQuiz) return { error: 'Đề không thuộc lớp này.' }

      // Đã có lượt làm bài -> không cho sửa câu hỏi (giữ công bằng)
      const { count } = await supabase
        .from('lms_quiz_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quizId)
      if ((count ?? 0) > 0)
        return { error: 'Đề đã có học viên làm bài, không thể sửa câu hỏi. Hãy tạo đề mới.' }

      const { error } = await supabase
        .from('lms_quizzes')
        .update(quizPayload)
        .eq('id', quizId)
        .eq('class_id', cls.id)
      if (error) return { error: error.message }
      await supabase.from('lms_quiz_questions').delete().eq('quiz_id', quizId)
    } else {
      const { data: created, error } = await supabase
        .from('lms_quizzes')
        .insert({ ...quizPayload, created_by: user.id })
        .select('id')
        .single()
      if (error || !created) return { error: error?.message ?? 'Không tạo được đề.' }
      quizId = created.id
    }

    const { error: qErr } = await supabase.from('lms_quiz_questions').insert(
      parsed.data.questions.map((q, i) => ({
        org_id: cls.org_id,
        quiz_id: quizId,
        question: q.question,
        options: q.options,
        correct_index: q.correctIndex,
        points: q.points,
        position: i,
      }))
    )
    if (qErr) return { error: 'Không lưu được câu hỏi: ' + qErr.message }

    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu đề kiểm tra.' }
  }
}

export async function setQuizPublished(
  classId: string,
  quizId: string,
  published: boolean
): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { error } = await auth.supabase
      .from('lms_quizzes')
      .update({ is_published: published })
      .eq('id', quizId)
      .eq('class_id', classId)
    if (error) return { error: error.message }
    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi cập nhật đề.' }
  }
}

export async function deleteQuiz(classId: string, quizId: string): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { error } = await auth.supabase
      .from('lms_quizzes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', quizId)
      .eq('class_id', classId)
    if (error) return { error: error.message }
    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa đề.' }
  }
}

export type QuizQuestionRow = {
  question: string
  options: string[]
  correct_index: number
  points: number
}

/** Câu hỏi của đề (chỉ GV/Staff - RLS chặn học viên) */
export async function getQuizQuestions(
  classId: string,
  quizId: string
): Promise<{ error: string } | { data: QuizQuestionRow[] }> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }

    const { data: quiz } = await auth.supabase
      .from('lms_quizzes')
      .select('id')
      .eq('id', quizId)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!quiz) return { error: 'Đề không thuộc lớp này.' }

    const { data, error } = await auth.supabase
      .from('lms_quiz_questions')
      .select('question, options, correct_index, points')
      .eq('quiz_id', quizId)
      .order('position')
    if (error) return { error: error.message }

    return {
      data: (data ?? []).map((q) => ({
        question: q.question,
        options: (q.options ?? []) as string[],
        correct_index: q.correct_index,
        points: Number(q.points),
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải câu hỏi.' }
  }
}

export type QuizResultRow = {
  student_id: string
  student_name: string
  score: number | null
  submitted_at: string | null
}

export async function getQuizResults(
  classId: string,
  quizId: string
): Promise<{ error: string } | { data: QuizResultRow[] }> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }

    const { data: quiz } = await auth.supabase
      .from('lms_quizzes')
      .select('id')
      .eq('id', quizId)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!quiz) return { error: 'Đề không thuộc lớp này.' }

    const { data, error } = await auth.supabase
      .from('lms_quiz_attempts')
      .select('student_id, score, submitted_at, profiles!lms_quiz_attempts_student_id_fkey(full_name)')
      .eq('quiz_id', quizId)
      .order('submitted_at', { ascending: false })
    if (error) return { error: error.message }

    return {
      data: (data ?? []).map((a) => ({
        student_id: a.student_id,
        student_name:
          (a.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Học viên',
        score: a.score === null ? null : Number(a.score),
        submitted_at: a.submitted_at,
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải kết quả.' }
  }
}

// ---------- 7. Đồng bộ điểm LMS -> Sổ điểm chính thức ----------
const syncSchema = z.object({
  classId: z.string().uuid(),
  source: z.enum(['assignment', 'quiz']),
  sourceId: z.string().uuid(),
  weight: z.number().min(0.05).max(1).default(0.1),
})

/**
 * Tạo cột điểm (assessments) mang tên bài tập/đề kiểm tra rồi upsert
 * điểm từ LMS vào bảng grades. Trigger chống sửa sổ đã khóa (migration
 * 008/023) vẫn có hiệu lực - nếu sổ đã chốt sẽ báo lỗi rõ ràng.
 */
export async function syncScoresToGradebook(
  input: z.infer<typeof syncSchema>
): Promise<ActionResult<{ synced: number }>> {
  try {
    const parsed = syncSchema.safeParse(input)
    if (!parsed.success) return { error: 'Tham số không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, cls } = auth

    // Lấy tên + danh sách điểm từ nguồn LMS
    let title = ''
    let scores: { student_id: string; score: number }[] = []

    if (parsed.data.source === 'assignment') {
      const { data: a } = await supabase
        .from('lms_assignments')
        .select('title')
        .eq('id', parsed.data.sourceId)
        .eq('class_id', cls.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (!a) return { error: 'Không tìm thấy bài tập.' }
      title = `BT: ${a.title}`

      const { data: subs } = await supabase
        .from('lms_submissions')
        .select('student_id, score')
        .eq('assignment_id', parsed.data.sourceId)
        .not('score', 'is', null)
        .is('deleted_at', null)
      scores = (subs ?? []).map((s) => ({ student_id: s.student_id, score: Number(s.score) }))
    } else {
      const { data: q } = await supabase
        .from('lms_quizzes')
        .select('title')
        .eq('id', parsed.data.sourceId)
        .eq('class_id', cls.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (!q) return { error: 'Không tìm thấy đề kiểm tra.' }
      title = `KT: ${q.title}`

      const { data: attempts } = await supabase
        .from('lms_quiz_attempts')
        .select('student_id, score')
        .eq('quiz_id', parsed.data.sourceId)
        .not('score', 'is', null)
        .not('submitted_at', 'is', null)
      scores = (attempts ?? []).map((a) => ({ student_id: a.student_id, score: Number(a.score) }))
    }

    if (scores.length === 0) return { error: 'Chưa có điểm nào để đồng bộ.' }

    // Tìm/tạo cột điểm cùng tên trong lớp (idempotent - sync lại sẽ ghi đè)
    const { data: existing } = await supabase
      .from('assessments')
      .select('id')
      .eq('class_id', cls.id)
      .eq('name', title)
      .is('deleted_at', null)
      .maybeSingle()

    let assessmentId = existing?.id
    if (!assessmentId) {
      const { data: created, error: aErr } = await supabase
        .from('assessments')
        .insert({
          org_id: cls.org_id,
          class_id: cls.id,
          name: title,
          weight: parsed.data.weight,
          max_score: 10,
        })
        .select('id')
        .single()
      if (aErr || !created) return { error: aErr?.message ?? 'Không tạo được cột điểm.' }
      assessmentId = created.id
    }

    const { error: gErr } = await supabase.from('grades').upsert(
      scores.map((s) => ({
        org_id: cls.org_id,
        assessment_id: assessmentId,
        student_id: s.student_id,
        score: s.score,
      })),
      { onConflict: 'assessment_id,student_id' }
    )
    if (gErr) {
      // Trigger khóa sổ ném lỗi -> dịch sang thông báo dễ hiểu
      return {
        error: gErr.message.includes('khóa') || gErr.message.includes('lock')
          ? 'Sổ điểm lớp này đã chốt - liên hệ phòng Khảo thí để mở lại.'
          : 'Không đồng bộ được điểm: ' + gErr.message,
      }
    }

    revalidatePath('/teacher/lms')
    return { data: { synced: scores.length } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi đồng bộ điểm.' }
  }
}
