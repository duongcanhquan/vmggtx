'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  isR2Configured,
  presignDownload,
} from '@/lib/storage/r2'
import type { AttachmentMeta } from './actions'

function migHint(msg: string): string {
  if (/lms_rubrics|lms_rubric_|lms_submission_grades|does not exist|schema cache/i.test(msg)) {
    return 'Database chưa có bảng rubric. Chạy supabase/migrations/065_lms_rubrics.sql trong SQL Editor.'
  }
  return msg
}

type AuthOk = {
  supabase: ReturnType<typeof createClient>
  userId: string
  orgId: string
  classId: string
  assignmentId: string
  maxScore: number
}

async function authorizeSubmission(
  submissionId: string
): Promise<{ error: string } | AuthOk> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const { data: sub, error } = await supabase
    .from('lms_submissions')
    .select(
      'id, org_id, assignment_id, lms_assignments!inner(id, class_id, max_score, classes!inner(id, teacher_id, org_id))'
    )
    .eq('id', submissionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!sub) return { error: 'Không tìm thấy bài nộp.' }

  const assignment = (
    Array.isArray(sub.lms_assignments) ? sub.lms_assignments[0] : sub.lms_assignments
  ) as {
    id: string
    class_id: string
    max_score: number
    classes:
      | { id: string; teacher_id: string | null; org_id: string }
      | { id: string; teacher_id: string | null; org_id: string }[]
  }

  const cls = Array.isArray(assignment.classes)
    ? assignment.classes[0]
    : assignment.classes

  let allowed = cls.teacher_id === user.id
  if (!allowed) {
    const { data: ct } = await supabase
      .from('class_teachers')
      .select('id')
      .eq('class_id', cls.id)
      .eq('teacher_id', user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    allowed = Boolean(ct)
  }
  if (!allowed) {
    const { data: staffOk } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: cls.org_id,
      p_required_role: 'academic_staff',
    })
    allowed = Boolean(staffOk)
  }
  if (!allowed) return { error: 'Bạn không có quyền chấm bài này.' }

  return {
    supabase,
    userId: user.id,
    orgId: sub.org_id as string,
    classId: cls.id,
    assignmentId: assignment.id,
    maxScore: Number(assignment.max_score) || 10,
  }
}

export type RubricLevel = {
  id: string
  label: string
  points: number
  sort_order: number
}

export type RubricCriterion = {
  id: string
  name: string
  description: string | null
  sort_order: number
  levels: RubricLevel[]
}

export type RubricBundle = {
  id: string
  title: string
  max_score: number
  criteria: RubricCriterion[]
}

export type GradeWorkspace = {
  submission: {
    id: string
    student_name: string
    content: string | null
    attachments: AttachmentMeta[]
    is_late: boolean
    submitted_at: string
    score: number | null
    feedback: string | null
  }
  classId: string
  assignmentId: string
  assignmentTitle: string
  maxScore: number
  rubric: RubricBundle | null
  grade: {
    selections: Record<string, string>
    computed_score: number | null
    feedback: string
    status: 'draft' | 'final'
    updated_at: string | null
  }
  siblingIds: string[]
  r2Ready: boolean
}

export async function getGradeWorkspace(
  submissionId: string
): Promise<{ error: string; data?: undefined } | { error?: undefined; data: GradeWorkspace }> {
  try {
    const auth = await authorizeSubmission(submissionId)
    if (!('supabase' in auth)) return { error: auth.error }

    const { data: sub, error: sErr } = await auth.supabase
      .from('lms_submissions')
      .select(
        'id, content, attachments, is_late, submitted_at, score, feedback, student_id, profiles!lms_submissions_student_id_fkey(full_name)'
      )
      .eq('id', submissionId)
      .maybeSingle()
    if (sErr || !sub) return { error: sErr?.message ?? 'Không tải được bài nộp.' }

    const { data: assignment } = await auth.supabase
      .from('lms_assignments')
      .select('id, title, max_score')
      .eq('id', auth.assignmentId)
      .maybeSingle()

    const { data: rubricRow, error: rErr } = await auth.supabase
      .from('lms_rubrics')
      .select('id, title, max_score')
      .eq('assignment_id', auth.assignmentId)
      .is('deleted_at', null)
      .maybeSingle()

    let rubric: RubricBundle | null = null
    if (rErr && /lms_rubrics|does not exist/i.test(rErr.message)) {
      return { error: migHint(rErr.message) }
    }
    if (rubricRow) {
      const { data: criteria } = await auth.supabase
        .from('lms_rubric_criteria')
        .select('id, name, description, sort_order')
        .eq('rubric_id', rubricRow.id)
        .is('deleted_at', null)
        .order('sort_order')

      const critIds = (criteria ?? []).map((c) => c.id as string)
      const { data: levels } = critIds.length
        ? await auth.supabase
            .from('lms_rubric_levels')
            .select('id, criterion_id, label, points, sort_order')
            .in('criterion_id', critIds)
            .is('deleted_at', null)
            .order('sort_order')
        : { data: [] }

      const levelsByCrit = new Map<string, RubricLevel[]>()
      for (const lv of levels ?? []) {
        const list = levelsByCrit.get(lv.criterion_id as string) ?? []
        list.push({
          id: lv.id as string,
          label: lv.label as string,
          points: Number(lv.points),
          sort_order: Number(lv.sort_order),
        })
        levelsByCrit.set(lv.criterion_id as string, list)
      }

      rubric = {
        id: rubricRow.id as string,
        title: rubricRow.title as string,
        max_score: Number(rubricRow.max_score),
        criteria: (criteria ?? []).map((c) => ({
          id: c.id as string,
          name: c.name as string,
          description: (c.description as string | null) ?? null,
          sort_order: Number(c.sort_order),
          levels: levelsByCrit.get(c.id as string) ?? [],
        })),
      }
    }

    const { data: gradeRow } = await auth.supabase
      .from('lms_submission_grades')
      .select('selections, computed_score, feedback, status, updated_at')
      .eq('submission_id', submissionId)
      .is('deleted_at', null)
      .maybeSingle()

    const { data: siblings } = await auth.supabase
      .from('lms_submissions')
      .select('id')
      .eq('assignment_id', auth.assignmentId)
      .is('deleted_at', null)
      .order('submitted_at')

    const profile = sub.profiles as { full_name?: string } | { full_name?: string }[] | null
    const studentName = Array.isArray(profile)
      ? profile[0]?.full_name ?? 'Học viên'
      : profile?.full_name ?? 'Học viên'

    return {
      data: {
        submission: {
          id: sub.id as string,
          student_name: studentName,
          content: (sub.content as string | null) ?? null,
          attachments: (sub.attachments ?? []) as AttachmentMeta[],
          is_late: Boolean(sub.is_late),
          submitted_at: String(sub.submitted_at),
          score: sub.score == null ? null : Number(sub.score),
          feedback: (sub.feedback as string | null) ?? null,
        },
        classId: auth.classId,
        assignmentId: auth.assignmentId,
        assignmentTitle: assignment?.title ?? 'Bài tập',
        maxScore: Number(assignment?.max_score ?? auth.maxScore),
        rubric,
        grade: {
          selections: (gradeRow?.selections as Record<string, string>) ?? {},
          computed_score:
            gradeRow?.computed_score == null
              ? null
              : Number(gradeRow.computed_score),
          feedback: (gradeRow?.feedback as string | null) ?? '',
          status: (gradeRow?.status as 'draft' | 'final') ?? 'draft',
          updated_at: (gradeRow?.updated_at as string | null) ?? null,
        },
        siblingIds: (siblings ?? []).map((s) => s.id as string),
        r2Ready: isR2Configured(),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tải workspace chấm.' }
  }
}

export async function getSignedSubmissionFileUrl(
  submissionId: string,
  key: string
): Promise<{ error: string } | { url: string }> {
  const auth = await authorizeSubmission(submissionId)
  if (!('supabase' in auth)) return { error: auth.error }
  if (!isR2Configured()) return { error: 'Chưa cấu hình R2.' }
  try {
    const url = await presignDownload(key)
    return { url }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không tạo được link tải.' }
  }
}

const draftSchema = z.object({
  submissionId: z.string().uuid(),
  selections: z.record(z.string().uuid()),
  feedback: z.string().max(2000).optional().default(''),
  computedScore: z.number().min(0).max(10),
})

export async function saveRubricDraft(
  input: z.infer<typeof draftSchema>
): Promise<{ error?: string; updatedAt?: string }> {
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

  try {
    const auth = await authorizeSubmission(parsed.data.submissionId)
    if (!('supabase' in auth)) return { error: auth.error }

    const payload = {
      org_id: auth.orgId,
      submission_id: parsed.data.submissionId,
      selections: parsed.data.selections,
      computed_score: parsed.data.computedScore,
      feedback: parsed.data.feedback?.trim() || null,
      status: 'draft' as const,
      graded_by: auth.userId,
      deleted_at: null,
    }

    const { data, error } = await auth.supabase
      .from('lms_submission_grades')
      .upsert(payload, { onConflict: 'submission_id' })
      .select('updated_at')
      .maybeSingle()

    if (error) return { error: migHint(error.message) }
    return { updatedAt: data?.updated_at as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu nháp.' }
  }
}

export async function finalizeRubricGrade(
  input: z.infer<typeof draftSchema>
): Promise<{ error?: string }> {
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ.' }

  try {
    const auth = await authorizeSubmission(parsed.data.submissionId)
    if (!('supabase' in auth)) return { error: auth.error }

    const score = Math.min(auth.maxScore, Math.max(0, parsed.data.computedScore))

    const { error: gErr } = await auth.supabase.from('lms_submission_grades').upsert(
      {
        org_id: auth.orgId,
        submission_id: parsed.data.submissionId,
        selections: parsed.data.selections,
        computed_score: score,
        feedback: parsed.data.feedback?.trim() || null,
        status: 'final',
        graded_by: auth.userId,
        deleted_at: null,
      },
      { onConflict: 'submission_id' }
    )
    if (gErr) return { error: migHint(gErr.message) }

    const { error: sErr } = await auth.supabase
      .from('lms_submissions')
      .update({
        score,
        feedback: parsed.data.feedback?.trim() || null,
        graded_by: auth.userId,
        graded_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.submissionId)
    if (sErr) return { error: sErr.message }

    revalidatePath('/teacher/lms')
    revalidatePath(`/teacher/lms/grade/${parsed.data.submissionId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi chốt điểm.' }
  }
}

const rubricSaveSchema = z.object({
  classId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  criteria: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional().default(''),
        levels: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(100),
              points: z.number().min(0).max(10),
            })
          )
          .min(1)
          .max(8),
      })
    )
    .min(1)
    .max(20),
})

/** Tạo/ghi đè rubric cho assignment (soft-delete criteria cũ rồi insert mới — MVP) */
export async function saveAssignmentRubric(
  input: z.infer<typeof rubricSaveSchema>
): Promise<{ error?: string }> {
  const parsed = rubricSaveSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Rubric không hợp lệ.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Chưa đăng nhập.' }

    const { data: assignment } = await supabase
      .from('lms_assignments')
      .select('id, org_id, class_id, max_score')
      .eq('id', parsed.data.assignmentId)
      .eq('class_id', parsed.data.classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assignment) return { error: 'Bài tập không tồn tại.' }

    const { data: cls } = await supabase
      .from('classes')
      .select('id, teacher_id, org_id')
      .eq('id', parsed.data.classId)
      .maybeSingle()
    if (!cls) return { error: 'Lớp không tồn tại.' }

    let allowed = cls.teacher_id === user.id
    if (!allowed) {
      const { data: ct } = await supabase
        .from('class_teachers')
        .select('id')
        .eq('class_id', cls.id)
        .eq('teacher_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
      allowed = Boolean(ct)
    }
    if (!allowed) {
      const { data: staffOk } = await supabase.rpc('is_authorized', {
        p_user_id: user.id,
        p_target_org_id: cls.org_id,
        p_required_role: 'academic_staff',
      })
      allowed = Boolean(staffOk)
    }
    if (!allowed) return { error: 'Không có quyền sửa rubric.' }

    const orgId = assignment.org_id as string
    const maxScore = Number(assignment.max_score) || 10

    const { data: existing } = await supabase
      .from('lms_rubrics')
      .select('id')
      .eq('assignment_id', parsed.data.assignmentId)
      .is('deleted_at', null)
      .maybeSingle()

    let rubricId = existing?.id as string | undefined
    if (rubricId) {
      await supabase
        .from('lms_rubrics')
        .update({ title: parsed.data.title, max_score: maxScore })
        .eq('id', rubricId)

      const { data: oldCrit } = await supabase
        .from('lms_rubric_criteria')
        .select('id')
        .eq('rubric_id', rubricId)
        .is('deleted_at', null)
      const oldIds = (oldCrit ?? []).map((c) => c.id as string)
      if (oldIds.length) {
        await supabase
          .from('lms_rubric_levels')
          .update({ deleted_at: new Date().toISOString() })
          .in('criterion_id', oldIds)
          .is('deleted_at', null)
        await supabase
          .from('lms_rubric_criteria')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', oldIds)
      }
    } else {
      const { data: created, error: cErr } = await supabase
        .from('lms_rubrics')
        .insert({
          org_id: orgId,
          assignment_id: parsed.data.assignmentId,
          title: parsed.data.title,
          max_score: maxScore,
          created_by: user.id,
        })
        .select('id')
        .maybeSingle()
      if (cErr) return { error: migHint(cErr.message) }
      rubricId = created?.id as string
    }

    for (let i = 0; i < parsed.data.criteria.length; i++) {
      const c = parsed.data.criteria[i]
      const { data: crit, error: critErr } = await supabase
        .from('lms_rubric_criteria')
        .insert({
          org_id: orgId,
          rubric_id: rubricId,
          sort_order: i,
          name: c.name,
          description: c.description || null,
        })
        .select('id')
        .maybeSingle()
      if (critErr) return { error: migHint(critErr.message) }

      const levelRows = c.levels.map((lv, j) => ({
        org_id: orgId,
        criterion_id: crit!.id,
        sort_order: j,
        label: lv.label,
        points: lv.points,
      }))
      const { error: lvErr } = await supabase.from('lms_rubric_levels').insert(levelRows)
      if (lvErr) return { error: migHint(lvErr.message) }
    }

    revalidatePath('/teacher/lms')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu rubric.' }
  }
}

export async function getAssignmentRubric(
  classId: string,
  assignmentId: string
): Promise<{ error?: string; data: RubricBundle | null }> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Chưa đăng nhập.' }

    const { data: assignment } = await supabase
      .from('lms_assignments')
      .select('id')
      .eq('id', assignmentId)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!assignment) return { data: null, error: 'Bài tập không thuộc lớp.' }

    const { data: rubricRow, error } = await supabase
      .from('lms_rubrics')
      .select('id, title, max_score')
      .eq('assignment_id', assignmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { data: null, error: migHint(error.message) }
    if (!rubricRow) return { data: null }

    const { data: criteria } = await supabase
      .from('lms_rubric_criteria')
      .select('id, name, description, sort_order')
      .eq('rubric_id', rubricRow.id)
      .is('deleted_at', null)
      .order('sort_order')

    const critIds = (criteria ?? []).map((c) => c.id as string)
    const { data: levels } = critIds.length
      ? await supabase
          .from('lms_rubric_levels')
          .select('id, criterion_id, label, points, sort_order')
          .in('criterion_id', critIds)
          .is('deleted_at', null)
          .order('sort_order')
      : { data: [] }

    const levelsByCrit = new Map<string, RubricLevel[]>()
    for (const lv of levels ?? []) {
      const list = levelsByCrit.get(lv.criterion_id as string) ?? []
      list.push({
        id: lv.id as string,
        label: lv.label as string,
        points: Number(lv.points),
        sort_order: Number(lv.sort_order),
      })
      levelsByCrit.set(lv.criterion_id as string, list)
    }

    return {
      data: {
        id: rubricRow.id as string,
        title: rubricRow.title as string,
        max_score: Number(rubricRow.max_score),
        criteria: (criteria ?? []).map((c) => ({
          id: c.id as string,
          name: c.name as string,
          description: (c.description as string | null) ?? null,
          sort_order: Number(c.sort_order),
          levels: levelsByCrit.get(c.id as string) ?? [],
        })),
      },
    }
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Lỗi tải rubric.',
    }
  }
}
