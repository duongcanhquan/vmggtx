'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSetting } from '@/lib/utils/settingsResolver'
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

export type LessonStatus = 'draft' | 'pending_review' | 'published' | 'rejected'

export type LmsLesson = {
  id: string
  title: string
  description: string | null
  content: string | null
  video_url: string | null
  attachments: AttachmentMeta[]
  status: LessonStatus
  created_at: string
  submitted_at?: string | null
  reviewed_at?: string | null
  review_note?: string | null
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
  /** Org setting: bắt buộc gửi duyệt trước khi HV thấy */
  requireApproval: boolean
  /** GVCN không tự publish khi requireApproval; Giáo vụ+ thì được */
  canDirectPublish: boolean
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

async function isAcademicStaffOnOrg(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase.rpc('is_authorized', {
    p_user_id: userId,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
  })
  return data === true
}

// ---------- 1. Danh sách lớp + dữ liệu LMS ----------
export async function getClassLmsData(classId: string): Promise<ClassLmsData | { error: string }> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, cls, user } = auth

    const { value: requireApproval } = await resolveSetting(
      'require_lesson_approval',
      cls.org_id
    )
    const staffOk = await isAcademicStaffOnOrg(supabase, user.id, cls.org_id)

    // Cột duyệt (054) có thể chưa migrate -> fallback select cơ bản
    let lessons: LmsLesson[] = []
    const fullLessons = await supabase
      .from('lms_lessons')
      .select(
        'id, title, description, content, video_url, attachments, status, created_at, submitted_at, reviewed_at, review_note'
      )
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (fullLessons.error) {
      const basic = await supabase
        .from('lms_lessons')
        .select('id, title, description, content, video_url, attachments, status, created_at')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (basic.error) return { error: `Không tải bài giảng: ${basic.error.message}` }
      lessons = (basic.data ?? []).map((row) => ({
        ...(row as LmsLesson),
        status: (row.status as LessonStatus) ?? 'draft',
      }))
    } else {
      lessons = (fullLessons.data ?? []) as LmsLesson[]
    }

    const [assignmentsRes, quizzesRes] = await Promise.all([
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
      requireApproval: Boolean(requireApproval),
      canDirectPublish: !requireApproval || staffOk,
      lessons,
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
        .is('deleted_at', null)
        .maybeSingle()
      attachments = (row?.attachments ?? []) as AttachmentMeta[]
    } else {
      const { data: row } = await supabase
        .from('lms_submissions')
        .select('attachments, lms_assignments!inner(class_id, deleted_at)')
        .eq('id', input.recordId)
        .eq('lms_assignments.class_id', input.classId)
        .is('deleted_at', null)
        .is('lms_assignments.deleted_at', null)
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
  status: z
    .enum(['draft', 'pending_review', 'published', 'rejected'])
    .default('draft'),
})

export async function saveLesson(input: z.infer<typeof lessonSchema>): Promise<ActionResult> {
  try {
    const parsed = lessonSchema.safeParse(input)
    if (!parsed.success)
      return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

    const auth = await authorizeClass(parsed.data.classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, user, cls } = auth

    const { value: requireApproval } = await resolveSetting(
      'require_lesson_approval',
      cls.org_id
    )
    const staffOk = await isAcademicStaffOnOrg(supabase, user.id, cls.org_id)

    let status = parsed.data.status
    // GV không được tự publish khi org bắt buộc duyệt
    if (status === 'published' && requireApproval && !staffOk) {
      return {
        error:
          'Cơ sở yêu cầu Giáo vụ duyệt bài giảng. Hãy bấm «Gửi duyệt» thay vì phát hành trực tiếp.',
      }
    }
    if (status === 'pending_review' && !parsed.data.id) {
      // tạo mới: lưu draft trước, gửi duyệt riêng
      status = 'draft'
    }

    const payload: Record<string, unknown> = {
      org_id: cls.org_id,
      class_id: cls.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content || null,
      video_url: parsed.data.videoUrl || null,
      attachments: parsed.data.attachments,
      status,
    }

    const { error } = parsed.data.id
      ? await supabase
          .from('lms_lessons')
          .update(payload)
          .eq('id', parsed.data.id)
          .eq('class_id', cls.id)
          .is('deleted_at', null)
      : await supabase.from('lms_lessons').insert({ ...payload, created_by: user.id })
    if (error) {
      // DB chưa 054: status pending_review/rejected bị check constraint
      if (/lms_lessons_status_check|pending_review|rejected/i.test(error.message)) {
        return {
          error:
            'CSDL chưa hỗ trợ duyệt bài giảng — chạy migration 054_lms_lesson_approval.sql.',
        }
      }
      return { error: 'Không lưu được bài giảng: ' + error.message }
    }

    revalidatePath('/teacher/lms')
    revalidatePath('/staff/lms-approval')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu bài giảng.' }
  }
}

/** GV gửi bài giảng lên hàng chờ Giáo vụ duyệt */
export async function submitLessonForReview(
  classId: string,
  lessonId: string
): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, cls } = auth

    const { data: lesson } = await supabase
      .from('lms_lessons')
      .select('id, status, title, content')
      .eq('id', lessonId)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lesson) return { error: 'Không tìm thấy bài giảng.' }
    if (lesson.status === 'published') {
      return { error: 'Bài đã phát hành — không cần gửi duyệt.' }
    }
    if (lesson.status === 'pending_review') {
      return { error: 'Bài đang chờ duyệt.' }
    }
    if (!(lesson.content ?? '').trim() && !(lesson.title ?? '').trim()) {
      return { error: 'Bài giảng trống — hãy soạn nội dung trước khi gửi duyệt.' }
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('lms_lessons')
      .update({
        status: 'pending_review',
        submitted_at: now,
        review_note: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq('id', lessonId)
      .eq('class_id', cls.id)
    if (error) {
      if (/lms_lessons_status_check|pending_review|column/i.test(error.message)) {
        return {
          error:
            'CSDL chưa hỗ trợ duyệt bài giảng — chạy migration 054_lms_lesson_approval.sql.',
        }
      }
      return { error: error.message }
    }

    revalidatePath('/teacher/lms')
    revalidatePath('/staff/lms-approval')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi gửi duyệt.' }
  }
}

/** Giáo vụ duyệt → published (+ optional auto RAG index không block) */
export async function approveLesson(
  classId: string,
  lessonId: string,
  note?: string
): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, user, cls } = auth
    const staffOk = await isAcademicStaffOnOrg(supabase, user.id, cls.org_id)
    if (!staffOk) return { error: 'Chỉ Giáo vụ / Admin được duyệt bài giảng.' }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('lms_lessons')
      .update({
        status: 'published',
        reviewed_by: user.id,
        reviewed_at: now,
        review_note: (note ?? '').trim().slice(0, 500) || null,
      })
      .eq('id', lessonId)
      .eq('class_id', classId)
      .is('deleted_at', null)
    if (error) return { error: error.message }

    revalidatePath('/teacher/lms')
    revalidatePath('/staff/lms-approval')
    revalidatePath('/learn')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi duyệt bài giảng.' }
  }
}

export async function rejectLesson(
  classId: string,
  lessonId: string,
  note: string
): Promise<ActionResult> {
  const reason = note.trim()
  if (reason.length < 3) return { error: 'Vui lòng ghi lý do từ chối (ít nhất 3 ký tự).' }
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase, user, cls } = auth
    const staffOk = await isAcademicStaffOnOrg(supabase, user.id, cls.org_id)
    if (!staffOk) return { error: 'Chỉ Giáo vụ / Admin được từ chối bài giảng.' }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('lms_lessons')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: now,
        review_note: reason.slice(0, 500),
      })
      .eq('id', lessonId)
      .eq('class_id', classId)
      .is('deleted_at', null)
    if (error) return { error: error.message }

    revalidatePath('/teacher/lms')
    revalidatePath('/staff/lms-approval')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi từ chối bài giảng.' }
  }
}

export async function deleteLesson(classId: string, lessonId: string): Promise<ActionResult> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const now = new Date().toISOString()
    const { error } = await auth.supabase
      .from('lms_lessons')
      .update({ deleted_at: now })
      .eq('id', lessonId)
      .eq('class_id', classId)
    if (error) return { error: error.message }

    // Soft-delete RAG chunks gắn bài
    try {
      const admin = createAdminClient()
      await admin
        .from('lesson_materials')
        .update({ deleted_at: now })
        .eq('org_id', auth.cls.org_id)
        .eq('class_id', classId)
        .eq('metadata->>lesson_id', lessonId)
        .is('deleted_at', null)
    } catch {
      // bỏ qua nếu admin/RAG chưa sẵn
    }

    revalidatePath('/teacher/lms')
    revalidatePath('/staff/lms-approval')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa bài giảng.' }
  }
}

/** Hàng chờ duyệt cho Giáo vụ (subtree org đang chọn) */
export async function getPendingLessonsForOrg(orgId: string): Promise<{
  data: {
    id: string
    title: string
    class_id: string
    class_name: string
    org_id: string
    teacher_name: string
    submitted_at: string | null
    created_at: string
  }[]
  loadError?: string | null
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], loadError: 'Bạn chưa đăng nhập.' }

    const staffOk = await isAcademicStaffOnOrg(supabase, user.id, orgId)
    if (!staffOk) {
      return { data: [], loadError: 'Chỉ Giáo vụ / Admin xem hàng chờ duyệt.' }
    }

    const { data: orgIds } = await supabase.rpc('get_descendant_org_ids', {
      root_id: orgId,
    })
    const ids: string[] = orgIds ?? [orgId]

    const { data, error } = await supabase
      .from('lms_lessons')
      .select('id, title, class_id, org_id, submitted_at, created_at, classes(name, teacher_id)')
      .in('org_id', ids)
      .eq('status', 'pending_review')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true, nullsFirst: false })

    if (error) {
      if (/pending_review|submitted_at|status/i.test(error.message)) {
        return {
          data: [],
          loadError:
            'CSDL chưa có quy trình duyệt — chạy migration 054_lms_lesson_approval.sql.',
        }
      }
      return { data: [], loadError: error.message }
    }

    const teacherIds = [
      ...new Set(
        (data ?? [])
          .map((row) => {
            const cls = row.classes as
              | { name?: string; teacher_id?: string | null }
              | { name?: string; teacher_id?: string | null }[]
              | null
            const c = Array.isArray(cls) ? cls[0] : cls
            return c?.teacher_id ?? null
          })
          .filter((id): id is string => Boolean(id))
      ),
    ]
    const teacherNames = new Map<string, string>()
    if (teacherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds)
        .is('deleted_at', null)
      for (const p of profiles ?? []) {
        teacherNames.set(p.id, p.full_name)
      }
    }

    return {
      data: (data ?? []).map((row) => {
        const cls = row.classes as
          | { name?: string; teacher_id?: string | null }
          | { name?: string; teacher_id?: string | null }[]
          | null
        const c = Array.isArray(cls) ? cls[0] : cls
        const tid = c?.teacher_id ?? null
        return {
          id: row.id,
          title: row.title,
          class_id: row.class_id,
          class_name: c?.name ?? '—',
          org_id: row.org_id,
          teacher_name: (tid && teacherNames.get(tid)) || '—',
          submitted_at: row.submitted_at,
          created_at: row.created_at,
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      loadError: e instanceof Error ? e.message : 'Lỗi tải hàng chờ duyệt.',
    }
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

// ---------- 8. Theo dõi học tập (ai học / ai không học) ----------
export type StudentProgressRow = {
  studentId: string
  studentName: string
  /** lessonId -> { viewCount, completed } */
  lessons: Record<string, { viewCount: number; completed: boolean }>
  /** assignmentId -> { submitted, score } */
  assignments: Record<string, { submitted: boolean; score: number | null }>
  /** quizId -> { done, score } */
  quizzes: Record<string, { done: boolean; score: number | null }>
  lessonsViewed: number
  assignmentsSubmitted: number
  quizzesDone: number
  /** % hoạt động tổng (0-100) */
  engagement: number
}

export type ClassProgress = {
  progressAvailable: boolean
  lessons: { id: string; title: string }[]
  assignments: { id: string; title: string }[]
  quizzes: { id: string; title: string }[]
  students: StudentProgressRow[]
}

/**
 * Ma trận theo dõi học tập: mỗi học viên đã XEM bài giảng nào, NỘP
 * bài tập nào, LÀM đề nào. Học viên không có hoạt động nào -> giáo
 * viên nhìn thấy ngay để nhắc nhở (kiểm soát học / không học).
 */
export async function getClassProgress(
  classId: string
): Promise<{ error: string } | ClassProgress> {
  try {
    const auth = await authorizeClass(classId)
    if (auth.error !== undefined) return { error: auth.error }
    const { supabase } = auth

    const [enrollRes, lessonsRes, assignmentsRes, quizzesRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('student_id, profiles!enrollments_student_id_fkey(full_name)')
        .eq('class_id', classId)
        .eq('status', 'active')
        .is('deleted_at', null),
      supabase
        .from('lms_lessons')
        .select('id, title')
        .eq('class_id', classId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .order('created_at'),
      supabase
        .from('lms_assignments')
        .select('id, title')
        .eq('class_id', classId)
        .is('deleted_at', null)
        .order('created_at'),
      supabase
        .from('lms_quizzes')
        .select('id, title')
        .eq('class_id', classId)
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('created_at'),
    ])

    const lessons = (lessonsRes.data ?? []).map((l) => ({ id: l.id, title: l.title }))
    const assignments = (assignmentsRes.data ?? []).map((a) => ({ id: a.id, title: a.title }))
    const quizzes = (quizzesRes.data ?? []).map((q) => ({ id: q.id, title: q.title }))
    const lessonIds = lessons.map((l) => l.id)
    const assignmentIds = assignments.map((a) => a.id)
    const quizIds = quizzes.map((q) => q.id)

    // Tiến độ xem bài (migration 039 có thể chưa chạy -> báo mềm)
    let progressAvailable = true
    let progressRows: { lesson_id: string; student_id: string; view_count: number; completed_at: string | null }[] = []
    if (lessonIds.length > 0) {
      const { data, error } = await supabase
        .from('lms_lesson_progress')
        .select('lesson_id, student_id, view_count, completed_at')
        .in('lesson_id', lessonIds)
      if (error) progressAvailable = false
      else progressRows = data ?? []
    }

    const [subsRes, attemptsRes] = await Promise.all([
      assignmentIds.length > 0
        ? supabase
            .from('lms_submissions')
            .select('assignment_id, student_id, score')
            .in('assignment_id', assignmentIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] as { assignment_id: string; student_id: string; score: number | null }[] }),
      quizIds.length > 0
        ? supabase
            .from('lms_quiz_attempts')
            .select('quiz_id, student_id, score, submitted_at')
            .in('quiz_id', quizIds)
        : Promise.resolve({ data: [] as { quiz_id: string; student_id: string; score: number | null; submitted_at: string | null }[] }),
    ])

    const totalItems = lessons.length + assignments.length + quizzes.length

    const students: StudentProgressRow[] = (enrollRes.data ?? []).map((e) => {
      const name =
        (e.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Học viên'
      const lessonMap: StudentProgressRow['lessons'] = {}
      for (const p of progressRows) {
        if (p.student_id === e.student_id) {
          lessonMap[p.lesson_id] = { viewCount: p.view_count, completed: p.completed_at !== null }
        }
      }
      const assignmentMap: StudentProgressRow['assignments'] = {}
      for (const s of subsRes.data ?? []) {
        if (s.student_id === e.student_id) {
          assignmentMap[s.assignment_id] = {
            submitted: true,
            score: s.score === null ? null : Number(s.score),
          }
        }
      }
      const quizMap: StudentProgressRow['quizzes'] = {}
      for (const a of attemptsRes.data ?? []) {
        if (a.student_id === e.student_id) {
          quizMap[a.quiz_id] = {
            done: a.submitted_at !== null,
            score: a.score === null ? null : Number(a.score),
          }
        }
      }

      const lessonsViewed = Object.keys(lessonMap).length
      const assignmentsSubmitted = Object.keys(assignmentMap).length
      const quizzesDone = Object.values(quizMap).filter((q) => q.done).length
      const engagement =
        totalItems === 0
          ? 0
          : Math.round(((lessonsViewed + assignmentsSubmitted + quizzesDone) / totalItems) * 100)

      return {
        studentId: e.student_id,
        studentName: name,
        lessons: lessonMap,
        assignments: assignmentMap,
        quizzes: quizMap,
        lessonsViewed,
        assignmentsSubmitted,
        quizzesDone,
        engagement,
      }
    })

    // Học viên ít hoạt động nhất lên đầu để GV nhắc nhở ngay
    students.sort((a, b) => a.engagement - b.engagement)

    return { progressAvailable, lessons, assignments, quizzes, students }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải dữ liệu theo dõi.' }
  }
}
