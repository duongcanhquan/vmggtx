'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { requiredId, zodFail } from '@/lib/validation/schemas'

async function requireOfficer(orgId: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' as const }
  const { data: ok } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
  })
  if (ok !== true) return { error: 'Không có quyền quản lý lộ trình.' as const }
  const orgIds = await getDescendantOrgIds(supabase, orgId)
  return {
    userId: user.id,
    orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
    supabase,
  }
}

export type PathwayRow = {
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
  milestoneCount: number
  enrollmentCount: number
}

export async function listPathways(
  orgId: string
): Promise<{ data: PathwayRow[]; error?: string }> {
  const orgParsed = requiredId('Chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return { data: [], error: zodFail(orgParsed.error).error }
  try {
    const scope = await requireOfficer(orgParsed.data)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('learning_pathways')
      .select('id, name, code, description, is_active')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('name')
    if (error) {
      if (/learning_pathways|42P01|schema cache/i.test(error.message)) {
        return {
          data: [],
          error: 'Chưa chạy migration 075 — bảng lộ trình học tập chưa có.',
        }
      }
      return { data: [], error: error.message }
    }

    const ids = (data ?? []).map((p) => p.id)
    const milestoneCount = new Map<string, number>()
    const enrollmentCount = new Map<string, number>()
    if (ids.length > 0) {
      const [mRes, eRes] = await Promise.all([
        scope.supabase
          .from('learning_pathway_milestones')
          .select('pathway_id')
          .in('pathway_id', ids)
          .is('deleted_at', null),
        scope.supabase
          .from('student_pathway_enrollments')
          .select('pathway_id')
          .in('pathway_id', ids)
          .is('deleted_at', null),
      ])
      for (const row of mRes.data ?? []) {
        milestoneCount.set(row.pathway_id, (milestoneCount.get(row.pathway_id) ?? 0) + 1)
      }
      for (const row of eRes.data ?? []) {
        enrollmentCount.set(row.pathway_id, (enrollmentCount.get(row.pathway_id) ?? 0) + 1)
      }
    }

    return {
      data: (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        description: p.description,
        isActive: p.is_active,
        milestoneCount: milestoneCount.get(p.id) ?? 0,
        enrollmentCount: enrollmentCount.get(p.id) ?? 0,
      })),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải lộ trình.' }
  }
}

export async function createPathway(raw: unknown): Promise<{ error?: string }> {
  const schema = z.object({
    orgId: requiredId('Thiếu đơn vị.'),
    name: z.string().trim().min(2).max(160),
    code: z.string().trim().max(40).optional().or(z.literal('')),
    description: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data
  const scope = await requireOfficer(v.orgId)
  if ('error' in scope) return { error: scope.error }

  const { error } = await scope.supabase.from('learning_pathways').insert({
    org_id: v.orgId,
    name: v.name,
    code: v.code || null,
    description: v.description || null,
    created_by: scope.userId,
  })
  if (error) return { error: error.message }
  revalidatePath('/staff/learning-pathways')
  return {}
}

export async function addPathwayMilestone(raw: unknown): Promise<{ error?: string }> {
  const schema = z.object({
    orgId: requiredId('Thiếu đơn vị.'),
    pathwayId: requiredId('Thiếu lộ trình.'),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional().or(z.literal('')),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    minScore: z.coerce.number().min(0).max(100).optional().or(z.nan()).optional(),
  })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data
  const scope = await requireOfficer(v.orgId)
  if ('error' in scope) return { error: scope.error }

  const { error } = await scope.supabase.from('learning_pathway_milestones').insert({
    org_id: v.orgId,
    pathway_id: v.pathwayId,
    title: v.title,
    description: v.description || null,
    sort_order: v.sortOrder,
    min_score: typeof v.minScore === 'number' && !Number.isNaN(v.minScore) ? v.minScore : null,
  })
  if (error) return { error: error.message }
  revalidatePath('/staff/learning-pathways')
  return {}
}

export async function enrollStudentToPathway(raw: unknown): Promise<{ error?: string }> {
  const schema = z.object({
    orgId: requiredId('Thiếu đơn vị.'),
    pathwayId: requiredId('Thiếu lộ trình.'),
    studentId: requiredId('Thiếu học viên.'),
  })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data
  const scope = await requireOfficer(v.orgId)
  if ('error' in scope) return { error: scope.error }

  const { data: student } = await scope.supabase
    .from('profiles')
    .select('id, org_id, role')
    .eq('id', v.studentId)
    .eq('role', 'student')
    .is('deleted_at', null)
    .maybeSingle()
  if (!student || !scope.orgIds.includes(student.org_id)) {
    return { error: 'Học viên không thuộc phạm vi đơn vị.' }
  }

  const { error } = await scope.supabase.from('student_pathway_enrollments').upsert(
    {
      org_id: student.org_id,
      pathway_id: v.pathwayId,
      student_id: v.studentId,
      status: 'active',
      created_by: scope.userId,
      deleted_at: null,
    },
    { onConflict: 'pathway_id,student_id' }
  )
  if (error) return { error: error.message }
  revalidatePath('/staff/learning-pathways')
  return {}
}

export type PathwayDetail = {
  milestones: { id: string; title: string; description: string | null; sortOrder: number; minScore: number | null }[]
  enrollments: {
    id: string
    studentId: string
    studentName: string
    status: string
    progressDone: number
    progressTotal: number
    doneMilestoneIds: string[]
  }[]
}

export async function getPathwayDetail(
  pathwayId: string
): Promise<{ data: PathwayDetail | null; error?: string }> {
  const idParsed = requiredId('Thiếu lộ trình.').safeParse(pathwayId)
  if (!idParsed.success) return { data: null, error: zodFail(idParsed.error).error }
  try {
    const supabase = createClient()
    const { data: pathway } = await supabase
      .from('learning_pathways')
      .select('id, org_id')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!pathway) return { data: null, error: 'Không tìm thấy lộ trình.' }

    const scope = await requireOfficer(pathway.org_id)
    if ('error' in scope) return { data: null, error: scope.error }

    const [mRes, eRes] = await Promise.all([
      scope.supabase
        .from('learning_pathway_milestones')
        .select('id, title, description, sort_order, min_score')
        .eq('pathway_id', idParsed.data)
        .is('deleted_at', null)
        .order('sort_order'),
      scope.supabase
        .from('student_pathway_enrollments')
        .select('id, student_id, status, profiles(full_name)')
        .eq('pathway_id', idParsed.data)
        .is('deleted_at', null),
    ])

    const milestones = (mRes.data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      sortOrder: m.sort_order,
      minScore: m.min_score !== null ? Number(m.min_score) : null,
    }))

    const enrollIds = (eRes.data ?? []).map((e) => e.id)
    const doneIdsByEnroll = new Map<string, string[]>()
    if (enrollIds.length > 0) {
      const { data: progress } = await scope.supabase
        .from('student_pathway_progress')
        .select('enrollment_id, milestone_id, status')
        .in('enrollment_id', enrollIds)
        .eq('status', 'done')
        .is('deleted_at', null)
      for (const row of progress ?? []) {
        const list = doneIdsByEnroll.get(row.enrollment_id) ?? []
        list.push(row.milestone_id)
        doneIdsByEnroll.set(row.enrollment_id, list)
      }
    }

    return {
      data: {
        milestones,
        enrollments: (eRes.data ?? []).map((e) => {
          const profile = e.profiles as
            | { full_name: string }
            | { full_name: string }[]
            | null
          const name = Array.isArray(profile)
            ? profile[0]?.full_name
            : profile?.full_name
          const doneMilestoneIds = doneIdsByEnroll.get(e.id) ?? []
          return {
            id: e.id,
            studentId: e.student_id,
            studentName: name ?? '—',
            status: e.status,
            progressDone: doneMilestoneIds.length,
            progressTotal: milestones.length,
            doneMilestoneIds,
          }
        }),
      },
    }
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Không tải chi tiết lộ trình.',
    }
  }
}

export async function markMilestoneDone(raw: unknown): Promise<{ error?: string }> {
  const schema = z.object({
    orgId: requiredId('Thiếu đơn vị.'),
    enrollmentId: requiredId('Thiếu ghi danh lộ trình.'),
    milestoneId: requiredId('Thiếu mốc.'),
    score: z.coerce.number().min(0).max(100).optional(),
  })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data
  const scope = await requireOfficer(v.orgId)
  if ('error' in scope) return { error: scope.error }

  const { error } = await scope.supabase.from('student_pathway_progress').upsert(
    {
      org_id: v.orgId,
      enrollment_id: v.enrollmentId,
      milestone_id: v.milestoneId,
      status: 'done',
      score: v.score ?? null,
      completed_at: new Date().toISOString(),
      updated_by: scope.userId,
      deleted_at: null,
    },
    { onConflict: 'enrollment_id,milestone_id' }
  )
  if (error) return { error: error.message }
  revalidatePath('/staff/learning-pathways')
  return {}
}

export async function searchStudentsForPathway(
  orgId: string,
  query: string
): Promise<{ data: { id: string; name: string; code: string }[]; error?: string }> {
  const orgParsed = requiredId('').safeParse(orgId)
  if (!orgParsed.success) return { data: [], error: 'Thiếu đơn vị.' }
  const scope = await requireOfficer(orgParsed.data)
  if ('error' in scope) return { data: [], error: scope.error }
  const q = query.trim()
  if (q.length < 2) return { data: [] }

  const { data, error } = await scope.supabase
    .from('profiles')
    .select('id, full_name, "MaSV", student_code')
    .eq('role', 'student')
    .in('org_id', scope.orgIds)
    .is('deleted_at', null)
    .or(`full_name.ilike.%${q}%,MaSV.ilike.%${q}%,student_code.ilike.%${q}%`)
    .limit(20)

  if (error) return { data: [], error: error.message }

  return {
    data: (data ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      code: (p as { MaSV?: string }).MaSV || p.student_code || '',
    })),
  }
}
