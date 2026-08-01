'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildObjectKey,
  isAllowedMimeType,
  isR2Configured,
  MAX_FILE_SIZE_BYTES,
  presignDownload,
  presignUpload,
} from '@/lib/storage/r2'

// ============================================================
// LMS - phía HỌC VIÊN: học bài giảng, nộp bài tập, làm kiểm tra.
//
// - Bài giảng/bài tập: session client, RLS đảm bảo chỉ thấy lớp
//   mình ghi danh và bài đã phát hành.
// - Quiz: câu hỏi KHÔNG có policy SELECT cho học viên (bảo mật
//   đáp án). Nhận đề + nộp bài qua Service Role sau khi server
//   xác thực ghi danh. Chấm điểm hoàn toàn server-side.
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

export type LearnLesson = {
  id: string
  title: string
  description: string | null
  content: string | null
  video_url: string | null
  attachments: AttachmentMeta[]
  created_at: string
}

export type LearnAssignment = {
  id: string
  title: string
  instructions: string | null
  attachments: AttachmentMeta[]
  due_at: string | null
  allow_late: boolean
  mySubmission: {
    id: string
    content: string | null
    attachments: AttachmentMeta[]
    submitted_at: string
    is_late: boolean
    score: number | null
    feedback: string | null
  } | null
}

export type LearnQuiz = {
  id: string
  title: string
  description: string | null
  duration_minutes: number
  myAttempt: { score: number | null; submitted_at: string | null } | null
}

export type LearnClass = {
  classId: string
  className: string
  lessons: LearnLesson[]
  assignments: LearnAssignment[]
  quizzes: LearnQuiz[]
}

export type LearnData = { r2Ready: boolean; classes: LearnClass[] }

// ---------- 1. Toàn bộ dữ liệu học tập của tôi ----------
export async function getMyLearnData(): Promise<LearnData | { error: string }> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn cần đăng nhập.' }

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('class_id, classes(id, name)')
      .eq('student_id', user.id)
      .is('deleted_at', null)

    const classRows = (enrollments ?? [])
      .map((e) => e.classes as unknown as { id: string; name: string } | null)
      .filter((c): c is { id: string; name: string } => Boolean(c))
    if (classRows.length === 0) return { r2Ready: isR2Configured(), classes: [] }

    const classIds = classRows.map((c) => c.id)

    // RLS: chỉ trả bài PUBLISHED của lớp ghi danh + bài nộp/lượt làm CỦA TÔI
    const [lessonsRes, assignmentsRes, submissionsRes, quizzesRes, attemptsRes] =
      await Promise.all([
        supabase
          .from('lms_lessons')
          .select('id, class_id, title, description, content, video_url, attachments, created_at')
          .in('class_id', classIds)
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('lms_assignments')
          .select('id, class_id, title, instructions, attachments, due_at, allow_late')
          .in('class_id', classIds)
          .is('deleted_at', null)
          .order('due_at', { ascending: true, nullsFirst: false }),
        supabase
          .from('lms_submissions')
          .select('id, assignment_id, content, attachments, submitted_at, is_late, score, feedback')
          .eq('student_id', user.id)
          .is('deleted_at', null),
        supabase
          .from('lms_quizzes')
          .select('id, class_id, title, description, duration_minutes')
          .in('class_id', classIds)
          .eq('is_published', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('lms_quiz_attempts')
          .select('quiz_id, score, submitted_at')
          .eq('student_id', user.id),
      ])

    const submissionByAssignment = new Map(
      (submissionsRes.data ?? []).map((s) => [s.assignment_id, s])
    )
    const attemptByQuiz = new Map((attemptsRes.data ?? []).map((a) => [a.quiz_id, a]))

    return {
      r2Ready: isR2Configured(),
      classes: classRows.map((cls) => ({
        classId: cls.id,
        className: cls.name,
        lessons: (lessonsRes.data ?? [])
          .filter((l) => l.class_id === cls.id)
          .map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            content: l.content,
            video_url: l.video_url,
            attachments: (l.attachments ?? []) as AttachmentMeta[],
            created_at: l.created_at,
          })),
        assignments: (assignmentsRes.data ?? [])
          .filter((a) => a.class_id === cls.id)
          .map((a) => {
            const sub = submissionByAssignment.get(a.id)
            return {
              id: a.id,
              title: a.title,
              instructions: a.instructions,
              attachments: (a.attachments ?? []) as AttachmentMeta[],
              due_at: a.due_at,
              allow_late: a.allow_late,
              mySubmission: sub
                ? {
                    id: sub.id,
                    content: sub.content,
                    attachments: (sub.attachments ?? []) as AttachmentMeta[],
                    submitted_at: sub.submitted_at,
                    is_late: sub.is_late,
                    score: sub.score === null ? null : Number(sub.score),
                    feedback: sub.feedback,
                  }
                : null,
            }
          }),
        quizzes: (quizzesRes.data ?? [])
          .filter((q) => q.class_id === cls.id)
          .map((q) => {
            const attempt = attemptByQuiz.get(q.id)
            return {
              id: q.id,
              title: q.title,
              description: q.description,
              duration_minutes: q.duration_minutes,
              myAttempt: attempt
                ? {
                    score: attempt.score === null ? null : Number(attempt.score),
                    submitted_at: attempt.submitted_at,
                  }
                : null,
            }
          }),
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải dữ liệu học tập.' }
  }
}

// ---------- 2. Upload file bài nộp ----------
const presignSchema = z.object({
  assignmentId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(150),
  fileSize: z.number().int().positive(),
})

export async function presignSubmissionUpload(
  input: z.infer<typeof presignSchema>
): Promise<{ error: string } | { url: string; key: string }> {
  try {
    const parsed = presignSchema.safeParse(input)
    if (!parsed.success) return { error: 'Thông tin file không hợp lệ.' }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn cần đăng nhập.' }

    // RLS: chỉ đọc được bài tập của lớp mình ghi danh -> đây chính là check quyền
    const { data: assignment } = await supabase
      .from('lms_assignments')
      .select('id, org_id')
      .eq('id', parsed.data.assignmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assignment) return { error: 'Không tìm thấy bài tập hoặc bạn không thuộc lớp này.' }

    if (!isR2Configured()) return { error: 'Hệ thống chưa cấu hình lưu trữ file.' }
    if (parsed.data.fileSize > MAX_FILE_SIZE_BYTES) return { error: 'File vượt quá 50MB.' }
    if (!isAllowedMimeType(parsed.data.fileType))
      return { error: 'Định dạng file không được hỗ trợ.' }

    const key = buildObjectKey(
      assignment.org_id,
      `lms-submissions/${assignment.id}/${user.id}`,
      parsed.data.fileName
    )
    return await presignUpload(key, parsed.data.fileType)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không tạo được link upload.' }
  }
}

// ---------- 3. Nộp bài tập ----------
const submitSchema = z
  .object({
    assignmentId: z.string().uuid(),
    content: z.string().trim().max(20000).default(''),
    attachments: z.array(attachmentSchema).max(5).default([]),
  })
  .refine((v) => v.content.length > 0 || v.attachments.length > 0, {
    message: 'Cần nhập nội dung hoặc đính kèm file.',
  })

export async function submitAssignment(
  input: z.infer<typeof submitSchema>
): Promise<{ error: string } | { error?: undefined }> {
  try {
    const parsed = submitSchema.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn cần đăng nhập.' }

    const { data: assignment } = await supabase
      .from('lms_assignments')
      .select('id, org_id, due_at, allow_late')
      .eq('id', parsed.data.assignmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assignment) return { error: 'Không tìm thấy bài tập hoặc bạn không thuộc lớp này.' }

    const isLate = Boolean(assignment.due_at && new Date(assignment.due_at) < new Date())
    if (isLate && !assignment.allow_late)
      return { error: 'Đã quá hạn nộp và giáo viên không cho phép nộp muộn.' }

    // Đã có bài nộp -> cập nhật (RLS chặn nếu đã chấm điểm)
    const { data: existing } = await supabase
      .from('lms_submissions')
      .select('id, score')
      .eq('assignment_id', assignment.id)
      .eq('student_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      if (existing.score !== null)
        return { error: 'Bài đã được chấm điểm, không thể nộp lại.' }
      const { error } = await supabase
        .from('lms_submissions')
        .update({
          content: parsed.data.content || null,
          attachments: parsed.data.attachments,
          is_late: isLate,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) return { error: 'Không nộp lại được bài: ' + error.message }
    } else {
      const { error } = await supabase.from('lms_submissions').insert({
        org_id: assignment.org_id,
        assignment_id: assignment.id,
        student_id: user.id,
        content: parsed.data.content || null,
        attachments: parsed.data.attachments,
        is_late: isLate,
      })
      if (error) return { error: 'Không nộp được bài: ' + error.message }
    }

    revalidatePath('/learn')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi nộp bài.' }
  }
}

// ---------- 4. Tải file (bài giảng / đề bài / bài nộp của tôi) ----------
export async function getLearnDownloadUrl(input: {
  kind: 'lesson' | 'assignment' | 'my-submission'
  recordId: string
  key: string
  fileName: string
}): Promise<{ error: string } | { url: string }> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn cần đăng nhập.' }

    // Session client + RLS: chỉ đọc được bản ghi mình có quyền xem
    let attachments: AttachmentMeta[] = []
    if (input.kind === 'lesson') {
      const { data } = await supabase
        .from('lms_lessons')
        .select('attachments')
        .eq('id', input.recordId)
        .maybeSingle()
      attachments = (data?.attachments ?? []) as AttachmentMeta[]
    } else if (input.kind === 'assignment') {
      const { data } = await supabase
        .from('lms_assignments')
        .select('attachments')
        .eq('id', input.recordId)
        .maybeSingle()
      attachments = (data?.attachments ?? []) as AttachmentMeta[]
    } else {
      const { data } = await supabase
        .from('lms_submissions')
        .select('attachments')
        .eq('id', input.recordId)
        .eq('student_id', user.id)
        .maybeSingle()
      attachments = (data?.attachments ?? []) as AttachmentMeta[]
    }

    if (!attachments.some((f) => f.key === input.key))
      return { error: 'Không có quyền tải file này.' }

    return { url: await presignDownload(input.key, input.fileName) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không tạo được link tải.' }
  }
}

// ---------- 5. Làm kiểm tra trắc nghiệm ----------
export type TakingQuestion = {
  id: string
  question: string
  options: string[]
  points: number
}

export type QuizTakingState =
  | { error: string }
  | {
      mode: 'result'
      score: number | null
      submitted_at: string | null
    }
  | {
      mode: 'taking'
      title: string
      durationMinutes: number
      /** ISO - hạn nộp = started_at + duration */
      deadline: string
      questions: TakingQuestion[]
    }

/** Grace 3 phút bù trễ mạng/đồng hồ trước khi từ chối bài nộp */
const QUIZ_GRACE_MS = 3 * 60 * 1000

/**
 * Bắt đầu (hoặc tiếp tục) làm bài. Lượt làm được tạo NGAY khi mở đề
 * -> đồng hồ chạy từ lúc mở, không reset khi refresh trang.
 * Câu hỏi trả về ĐÃ CẮT correct_index.
 */
export async function getQuizForTaking(quizId: string): Promise<QuizTakingState> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn cần đăng nhập.' }

    // RLS: học viên chỉ đọc được quiz PUBLISHED của lớp mình ghi danh
    const { data: quiz } = await supabase
      .from('lms_quizzes')
      .select('id, org_id, title, duration_minutes')
      .eq('id', quizId)
      .maybeSingle()
    if (!quiz) return { error: 'Đề kiểm tra không tồn tại hoặc chưa mở.' }

    const admin = createAdminClient()

    // Lượt làm hiện có?
    const { data: attempt } = await admin
      .from('lms_quiz_attempts')
      .select('id, score, started_at, submitted_at')
      .eq('quiz_id', quizId)
      .eq('student_id', user.id)
      .maybeSingle()

    if (attempt?.submitted_at) {
      return {
        mode: 'result',
        score: attempt.score === null ? null : Number(attempt.score),
        submitted_at: attempt.submitted_at,
      }
    }

    let startedAt = attempt?.started_at
    if (!attempt) {
      const { data: created, error } = await admin
        .from('lms_quiz_attempts')
        .insert({ org_id: quiz.org_id, quiz_id: quizId, student_id: user.id })
        .select('started_at')
        .single()
      if (error || !created) return { error: 'Không bắt đầu được bài làm.' }
      startedAt = created.started_at
    }

    const deadline = new Date(
      new Date(startedAt!).getTime() + quiz.duration_minutes * 60 * 1000
    )

    // Hết giờ từ trước (mở đề rồi bỏ đó) -> tự nộp 0 điểm
    if (Date.now() > deadline.getTime() + QUIZ_GRACE_MS) {
      await admin
        .from('lms_quiz_attempts')
        .update({ score: 0, total_points: 0, submitted_at: new Date().toISOString() })
        .eq('quiz_id', quizId)
        .eq('student_id', user.id)
        .is('submitted_at', null)
      return { mode: 'result', score: 0, submitted_at: new Date().toISOString() }
    }

    const { data: questions } = await admin
      .from('lms_quiz_questions')
      .select('id, question, options, points')
      .eq('quiz_id', quizId)
      .order('position')

    return {
      mode: 'taking',
      title: quiz.title,
      durationMinutes: quiz.duration_minutes,
      deadline: deadline.toISOString(),
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        question: q.question,
        options: (q.options ?? []) as string[],
        points: Number(q.points),
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi mở đề kiểm tra.' }
  }
}

const submitQuizSchema = z.object({
  quizId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.number().int().min(0).max(9)),
})

/** Nộp bài - server tự chấm, thang 0-10. */
export async function submitQuiz(
  input: z.infer<typeof submitQuizSchema>
): Promise<{ error: string } | { score: number }> {
  try {
    const parsed = submitQuizSchema.safeParse(input)
    if (!parsed.success) return { error: 'Bài làm không hợp lệ.' }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn cần đăng nhập.' }

    const admin = createAdminClient()

    const { data: attempt } = await admin
      .from('lms_quiz_attempts')
      .select('id, started_at, submitted_at')
      .eq('quiz_id', parsed.data.quizId)
      .eq('student_id', user.id)
      .maybeSingle()
    if (!attempt) return { error: 'Chưa bắt đầu làm bài.' }
    if (attempt.submitted_at) return { error: 'Bài đã nộp trước đó.' }

    const { data: quiz } = await admin
      .from('lms_quizzes')
      .select('duration_minutes, is_published')
      .eq('id', parsed.data.quizId)
      .maybeSingle()
    if (!quiz) return { error: 'Đề không tồn tại.' }

    // Hết giờ (quá grace) -> nộp 0 điểm
    const deadline =
      new Date(attempt.started_at).getTime() + quiz.duration_minutes * 60 * 1000
    const overtime = Date.now() > deadline + QUIZ_GRACE_MS

    const { data: questions } = await admin
      .from('lms_quiz_questions')
      .select('id, correct_index, points')
      .eq('quiz_id', parsed.data.quizId)
    if (!questions || questions.length === 0) return { error: 'Đề không có câu hỏi.' }

    let earned = 0
    let total = 0
    for (const q of questions) {
      const pts = Number(q.points)
      total += pts
      if (!overtime && parsed.data.answers[q.id] === q.correct_index) earned += pts
    }
    const score = total > 0 ? Math.round((earned / total) * 10 * 100) / 100 : 0

    const { error } = await admin
      .from('lms_quiz_attempts')
      .update({
        answers: parsed.data.answers,
        score,
        total_points: total,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)
      .is('submitted_at', null) // chống nộp 2 lần song song
    if (error) return { error: 'Không nộp được bài: ' + error.message }

    revalidatePath('/learn')
    if (overtime) return { error: 'Quá thời gian làm bài - lượt làm bị tính 0 điểm.' }
    return { score }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi nộp bài kiểm tra.' }
  }
}
