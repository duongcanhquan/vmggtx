'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

export type SubjectRow = {
  id: string
  org_id: string | null
  name: string
  code: string | null
  credits: number | null
  total_periods: number | null
  prerequisites: string[]
  learning_outcomes: string | null
  is_active: boolean
}

function migHint(msg: string): string {
  if (/code|credits|total_periods|prerequisites|learning_outcomes|schema cache|PGRST204/i.test(msg)) {
    return 'Database chưa có cột curriculum. Chạy supabase/migrations/061_curriculum_subjects.sql trong SQL Editor.'
  }
  return msg
}

async function requireSubjectsScope(orgId: string): Promise<
  | { error: string }
  | {
      error?: undefined
      supabase: ReturnType<typeof createClient>
      userId: string
      orgIds: string[]
    }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const auth = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
    p_menu_key: 'classes',
  })
  if (auth.error || auth.data !== true) {
    return { error: 'Bạn không có quyền quản lý môn học trong đơn vị này.' }
  }

  const orgIds = await getDescendantOrgIds(supabase, orgId)
  return {
    supabase,
    userId: user.id,
    orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
  }
}

function mapRow(r: Record<string, unknown>): SubjectRow {
  const prereq = r.prerequisites
  return {
    id: String(r.id),
    org_id: (r.org_id as string | null) ?? null,
    name: String(r.name),
    code: (r.code as string | null) ?? null,
    credits: r.credits == null ? null : Number(r.credits),
    total_periods: r.total_periods == null ? null : Number(r.total_periods),
    prerequisites: Array.isArray(prereq)
      ? (prereq as string[])
      : [],
    learning_outcomes: (r.learning_outcomes as string | null) ?? null,
    is_active: Boolean(r.is_active),
  }
}

export async function listSubjects(
  orgId: string | null
): Promise<{ data: SubjectRow[]; error?: string }> {
  if (!orgId) return { data: [], error: 'Chưa chọn tổ chức.' }
  try {
    const scope = await requireSubjectsScope(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('subjects')
      .select(
        'id, org_id, name, code, credits, total_periods, prerequisites, learning_outcomes, is_active'
      )
      .or(`org_id.is.null,org_id.in.(${scope.orgIds.join(',')})`)
      .is('deleted_at', null)
      .order('name')

    if (error) {
      // Fallback nếu 061 chưa chạy
      const fallback = await scope.supabase
        .from('subjects')
        .select('id, org_id, name, is_active')
        .or(`org_id.is.null,org_id.in.(${scope.orgIds.join(',')})`)
        .is('deleted_at', null)
        .order('name')
      if (fallback.error) {
        return { data: [], error: migHint(error.message) }
      }
      return {
        data: (fallback.data ?? []).map((r) =>
          mapRow({
            ...r,
            code: null,
            credits: null,
            total_periods: null,
            prerequisites: [],
            learning_outcomes: null,
          })
        ),
        error: migHint(error.message),
      }
    }

    return { data: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải môn học.',
    }
  }
}

export async function upsertSubject(
  orgId: string,
  input: {
    id?: string
    name: string
    code?: string
    credits?: number | null
    totalPeriods?: number | null
    prerequisites?: string[]
    learningOutcomes?: string
    isActive?: boolean
  }
): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Tên môn bắt buộc.' }
  if (name.length > 120) return { error: 'Tên môn tối đa 120 ký tự.' }

  try {
    const scope = await requireSubjectsScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const payload: Record<string, unknown> = {
      name,
      org_id: orgId,
      code: input.code?.trim() || null,
      credits:
        input.credits == null || Number.isNaN(input.credits)
          ? null
          : input.credits,
      total_periods:
        input.totalPeriods == null || Number.isNaN(input.totalPeriods)
          ? null
          : Math.round(input.totalPeriods),
      prerequisites: input.prerequisites ?? [],
      learning_outcomes: input.learningOutcomes?.trim() || null,
      is_active: input.isActive ?? true,
    }

    if (input.id) {
      const { error } = await scope.supabase
        .from('subjects')
        .update(payload)
        .eq('id', input.id)
        .is('deleted_at', null)
      if (error) return { error: migHint(error.message) }
    } else {
      const { error } = await scope.supabase.from('subjects').insert(payload)
      if (error) return { error: migHint(error.message) }
    }

    revalidatePath('/academic/subjects')
    revalidatePath('/classes')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu môn học.' }
  }
}

export async function softDeleteSubject(
  orgId: string,
  subjectId: string
): Promise<{ error?: string }> {
  if (!subjectId) return { error: 'Thiếu mã môn.' }
  try {
    const scope = await requireSubjectsScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await scope.supabase
      .from('subjects')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', subjectId)
      .is('deleted_at', null)

    if (error) return { error: migHint(error.message) }
    revalidatePath('/academic/subjects')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa môn.' }
  }
}
