'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// Quản lý điểm khảo thí: tạo cột, công bố / thu hồi công bố.
// ============================================================

async function requireExamOfficer(orgId: string): Promise<
  { error: string } | { error?: undefined; userId: string; orgIds: string[] }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: authorized, error } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
  })
  if (error) return { error: error.message }
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Chỉ Giáo vụ / Quản lý được kiểm soát điểm khảo thí.' }
  }
  const orgIds = await getDescendantOrgIds(supabase, orgId)
  return { userId: user.id, orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds] }
}

export type ExamClassGradeRow = {
  classId: string
  className: string
  orgId: string
  assessmentCount: number
  lockStatus: 'open' | 'review' | 'locked'
  isPublished: boolean
  publishedAt: string | null
  studentCount: number
}

export async function listExamGradeClasses(
  orgId: string
): Promise<{ data: ExamClassGradeRow[]; error?: string }> {
  const orgParsed = requiredId('Chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return { data: [], error: zodFail(orgParsed.error).error }

  try {
    const scope = await requireExamOfficer(orgParsed.data)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const supabase = createClient()
    const { data: classes, error } = await supabase
      .from('classes')
      .select('id, name, org_id')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('name')
      .limit(500)
    if (error) return { data: [], error: error.message }

    const classIds = (classes ?? []).map((c) => c.id)
    if (classIds.length === 0) return { data: [] }

    const [assessRes, resultsRes, enrollRes] = await Promise.all([
      supabase
        .from('assessments')
        .select('class_id')
        .in('class_id', classIds)
        .is('deleted_at', null),
      supabase
        .from('class_results')
        .select('class_id, lock_status, is_published, published_at')
        .in('class_id', classIds)
        .is('deleted_at', null),
      supabase
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'active')
        .is('deleted_at', null),
    ])

    let resultsWarn: string | undefined
    let resultRows = resultsRes.data ?? []
    if (resultsRes.error) {
      if (/is_published|42703|schema cache/i.test(resultsRes.error.message)) {
        const fallback = await supabase
          .from('class_results')
          .select('class_id, lock_status')
          .in('class_id', classIds)
          .is('deleted_at', null)
        resultRows = (fallback.data ?? []).map((row) => ({
          ...row,
          is_published: false,
          published_at: null as string | null,
        }))
        resultsWarn =
          'DB chưa có cột công bố điểm (migration 075). Trạng thái công bố tạm ẩn — chạy SQL 075.'
      } else {
        return { data: [], error: resultsRes.error.message }
      }
    }

    const assessCount = new Map<string, number>()
    for (const row of assessRes.data ?? []) {
      assessCount.set(row.class_id, (assessCount.get(row.class_id) ?? 0) + 1)
    }
    const resultByClass = new Map<
      string,
      { lock_status: string; is_published: boolean; published_at: string | null }
    >()
    for (const row of resultRows) {
      resultByClass.set(row.class_id, {
        lock_status: row.lock_status,
        is_published: Boolean(row.is_published),
        published_at: row.published_at ?? null,
      })
    }
    const enrollCount = new Map<string, number>()
    for (const row of enrollRes.data ?? []) {
      enrollCount.set(row.class_id, (enrollCount.get(row.class_id) ?? 0) + 1)
    }

    return {
      data: (classes ?? []).map((cls) => {
        const result = resultByClass.get(cls.id)
        return {
          classId: cls.id,
          className: cls.name,
          orgId: cls.org_id,
          assessmentCount: assessCount.get(cls.id) ?? 0,
          lockStatus: (result?.lock_status as ExamClassGradeRow['lockStatus']) ?? 'open',
          isPublished: result?.is_published ?? false,
          publishedAt: result?.published_at ?? null,
          studentCount: enrollCount.get(cls.id) ?? 0,
        }
      }),
      ...(resultsWarn ? { error: resultsWarn } : {}),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Không tải danh sách lớp.',
    }
  }
}

const createAssessmentSchema = z.object({
  classId: requiredId('Thiếu lớp.'),
  name: z.string().trim().min(2, 'Tên cột điểm tối thiểu 2 ký tự.').max(120),
  weight: z.coerce.number().positive('Hệ số phải > 0').max(100),
  maxScore: z.coerce.number().positive('Điểm tối đa phải > 0').max(100),
  isOfficialExam: z.boolean().default(true),
  examCode: z.string().trim().max(40).optional().nullable(),
  gradingDeadline: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Hạn chấm phải dạng YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
})

export async function createExamAssessment(
  raw: unknown
): Promise<{ error?: string; id?: string }> {
  const parsed = createAssessmentSchema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const supabase = createClient()
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id, org_id')
      .eq('id', values.classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (clsErr || !cls) return { error: 'Lớp không tồn tại.' }

    const scope = await requireExamOfficer(cls.org_id)
    if (scope.error !== undefined) return { error: scope.error }

    const payload: Record<string, unknown> = {
      org_id: cls.org_id,
      class_id: values.classId,
      name: values.name,
      weight: values.weight,
      max_score: values.maxScore,
      is_official_exam: values.isOfficialExam,
      exam_code: values.examCode || null,
      grading_deadline: values.gradingDeadline
        ? new Date(`${values.gradingDeadline}T23:59:59`).toISOString()
        : null,
    }

    const { data, error } = await supabase
      .from('assessments')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      if (/is_official_exam|exam_code|schema cache|42703/i.test(error.message)) {
        delete payload.is_official_exam
        delete payload.exam_code
        const retry = await supabase.from('assessments').insert(payload).select('id').single()
        if (retry.error) return { error: retry.error.message }
        revalidatePath('/staff/exam-grades')
        return { id: retry.data.id }
      }
      return { error: error.message }
    }

    revalidatePath('/staff/exam-grades')
    revalidatePath('/staff/exams')
    revalidatePath(`/teacher/grades/${values.classId}`)
    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không tạo được cột điểm.' }
  }
}

export async function setClassGradesPublished(
  classId: string,
  publish: boolean
): Promise<{ error?: string }> {
  const idParsed = requiredId('Thiếu lớp.').safeParse(classId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const { data: cls } = await supabase
      .from('classes')
      .select('id, org_id')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls) return { error: 'Lớp không tồn tại.' }

    const scope = await requireExamOfficer(cls.org_id)
    if (scope.error !== undefined) return { error: scope.error }

    const patch: Record<string, unknown> = publish
      ? {
          is_published: true,
          published_at: new Date().toISOString(),
          published_by: scope.userId,
        }
      : {
          is_published: false,
          published_at: null,
          published_by: null,
        }

    const { data: existing } = await supabase
      .from('class_results')
      .select('id')
      .eq('class_id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('class_results')
        .update(patch)
        .eq('id', existing.id)
      if (error) {
        if (/is_published|42703|schema cache/i.test(error.message)) {
          return {
            error:
              'DB chưa có cột công bố điểm — chạy migration 075_exam_module_publish_pathways.sql.',
          }
        }
        return { error: error.message }
      }
    } else {
      const { error } = await supabase.from('class_results').insert({
        org_id: cls.org_id,
        class_id: idParsed.data,
        lock_status: 'open',
        ...patch,
      })
      if (error) {
        if (/is_published|42703|schema cache/i.test(error.message)) {
          return {
            error:
              'DB chưa có cột công bố điểm — chạy migration 075_exam_module_publish_pathways.sql.',
          }
        }
        return { error: error.message }
      }
    }

    revalidatePath('/staff/exam-grades')
    revalidatePath('/grades')
    revalidatePath('/parent/grades')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không cập nhật công bố điểm.' }
  }
}

export async function releaseExamPaper(raw: unknown): Promise<{ error?: string }> {
  const schema = z.object({
    orgId: requiredId('Thiếu đơn vị.'),
    assessmentId: requiredId('Thiếu bài thi.'),
    title: z.string().trim().min(2).max(200),
    paperUrl: z.string().trim().url('URL đề không hợp lệ.').optional().or(z.literal('')),
    paperBody: z.string().trim().max(20000).optional().or(z.literal('')),
    variantCode: z.string().trim().max(40).optional().or(z.literal('')),
    examScheduleId: z.string().uuid().optional().or(z.literal('')),
  })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data
  if (!v.paperUrl && !v.paperBody) {
    return { error: 'Cần nhập URL đề hoặc nội dung đề.' }
  }

  try {
    const scope = await requireExamOfficer(v.orgId)
    if (scope.error !== undefined) return { error: scope.error }
    const supabase = createClient()

    const { error } = await supabase.from('exam_paper_releases').insert({
      org_id: v.orgId,
      assessment_id: v.assessmentId,
      exam_schedule_id: v.examScheduleId || null,
      title: v.title,
      paper_url: v.paperUrl || null,
      paper_body: v.paperBody || null,
      variant_code: v.variantCode || null,
      released_by: scope.userId,
      visible_from: new Date().toISOString(),
    })
    if (error) {
      if (/exam_paper_releases|schema cache|42P01/i.test(error.message)) {
        return { error: 'Chưa chạy migration 075 — bảng phát đề chưa có.' }
      }
      return { error: error.message }
    }
    revalidatePath('/staff/exam-grades')
    revalidatePath('/staff/exam-bank')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không phát được đề.' }
  }
}
