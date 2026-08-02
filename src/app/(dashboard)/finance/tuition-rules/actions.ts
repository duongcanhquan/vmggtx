'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

export type BillingMode = 'flat' | 'per_credit' | 'monthly'

export type TuitionRuleRow = {
  id: string
  org_id: string
  name: string
  billing_mode: BillingMode
  amount: number
  subject_id: string | null
  class_id: string | null
  note: string | null
  is_active: boolean
}

function migHint(msg: string): string {
  if (/tuition_rules|does not exist|schema cache/i.test(msg)) {
    return 'Database chưa có bảng học phí. Chạy supabase/migrations/062_tuition_rules.sql trong SQL Editor.'
  }
  return msg
}

async function requireFinanceScope(orgId: string): Promise<
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
    p_menu_key: 'finance_invoices',
  })
  if (auth.error || auth.data !== true) {
    return { error: 'Bạn không có quyền quản lý công thức học phí.' }
  }

  const orgIds = await getDescendantOrgIds(supabase, orgId)
  return {
    supabase,
    userId: user.id,
    orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
  }
}

export async function listTuitionRules(
  orgId: string | null
): Promise<{ data: TuitionRuleRow[]; error?: string }> {
  if (!orgId) return { data: [], error: 'Chưa chọn tổ chức.' }
  try {
    const scope = await requireFinanceScope(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('tuition_rules')
      .select(
        'id, org_id, name, billing_mode, amount, subject_id, class_id, note, is_active'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('name')

    if (error) return { data: [], error: migHint(error.message) }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        name: r.name as string,
        billing_mode: r.billing_mode as BillingMode,
        amount: Number(r.amount),
        subject_id: (r.subject_id as string | null) ?? null,
        class_id: (r.class_id as string | null) ?? null,
        note: (r.note as string | null) ?? null,
        is_active: Boolean(r.is_active),
      })),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải công thức.',
    }
  }
}

export async function upsertTuitionRule(
  orgId: string,
  input: {
    id?: string
    name: string
    billingMode: BillingMode
    amount: number
    subjectId?: string | null
    classId?: string | null
    note?: string
    isActive?: boolean
  }
): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Tên công thức bắt buộc.' }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { error: 'Số tiền không hợp lệ.' }
  }

  try {
    const scope = await requireFinanceScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const payload = {
      org_id: orgId,
      name,
      billing_mode: input.billingMode,
      amount: input.amount,
      subject_id: input.subjectId || null,
      class_id: input.classId || null,
      note: input.note?.trim() || null,
      is_active: input.isActive ?? true,
      created_by: scope.userId,
    }

    if (input.id) {
      const { created_by: _c, ...updatePayload } = payload
      const { error } = await scope.supabase
        .from('tuition_rules')
        .update(updatePayload)
        .eq('id', input.id)
        .is('deleted_at', null)
      if (error) return { error: migHint(error.message) }
    } else {
      const { error } = await scope.supabase.from('tuition_rules').insert(payload)
      if (error) return { error: migHint(error.message) }
    }

    revalidatePath('/finance/tuition-rules')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu công thức.' }
  }
}

export async function softDeleteTuitionRule(
  orgId: string,
  ruleId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireFinanceScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await scope.supabase
      .from('tuition_rules')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', ruleId)
      .is('deleted_at', null)

    if (error) return { error: migHint(error.message) }
    revalidatePath('/finance/tuition-rules')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa công thức.' }
  }
}

/**
 * Sinh draft invoices (status pending) từ 1 rule cho danh sách HV.
 * Không sửa schema invoices cũ — chỉ insert bản ghi mới.
 */
export async function generateDraftInvoicesFromRule(
  orgId: string,
  input: {
    ruleId: string
    studentIds: string[]
    dueDate?: string | null
    noteSuffix?: string
  }
): Promise<{ error?: string; created?: number }> {
  if (!input.ruleId) return { error: 'Thiếu công thức.' }
  if (!input.studentIds.length) return { error: 'Chọn ít nhất một học viên.' }

  try {
    const scope = await requireFinanceScope(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { data: rule, error: rErr } = await scope.supabase
      .from('tuition_rules')
      .select('id, org_id, name, billing_mode, amount, subject_id, class_id, note, is_active')
      .eq('id', input.ruleId)
      .is('deleted_at', null)
      .maybeSingle()

    if (rErr) return { error: migHint(rErr.message) }
    if (!rule || !rule.is_active) return { error: 'Công thức không tồn tại hoặc đã tắt.' }
    if (!scope.orgIds.includes(rule.org_id as string)) {
      return { error: 'Công thức ngoài phạm vi đơn vị.' }
    }

    const { data: students, error: sErr } = await scope.supabase
      .from('profiles')
      .select('id, org_id, full_name')
      .in('id', input.studentIds)
      .eq('role', 'student')
      .is('deleted_at', null)

    if (sErr) return { error: sErr.message }
    if (!students?.length) return { error: 'Không tìm thấy học viên hợp lệ.' }

    let created = 0
    for (const st of students) {
      if (!scope.orgIds.includes(st.org_id as string)) {
        return { error: `Học viên ${st.full_name} ngoài phạm vi đơn vị.` }
      }

      let amount = Number(rule.amount)
      if (rule.billing_mode === 'per_credit' && rule.subject_id) {
        const { data: sub } = await scope.supabase
          .from('subjects')
          .select('credits')
          .eq('id', rule.subject_id)
          .is('deleted_at', null)
          .maybeSingle()
        const credits = Number(sub?.credits ?? 1) || 1
        amount = Number(rule.amount) * credits
      }

      const noteParts = [
        `Rule: ${rule.name}`,
        rule.note,
        input.noteSuffix?.trim(),
      ].filter(Boolean)

      const { error: iErr } = await scope.supabase.from('invoices').insert({
        org_id: st.org_id,
        student_id: st.id,
        amount,
        status: 'pending',
        due_date: input.dueDate || null,
        note: noteParts.join(' · ') || null,
      })
      if (iErr) return { error: `Không tạo HĐ cho ${st.full_name}: ${iErr.message}`, created }
      created += 1
    }

    revalidatePath('/finance/invoices')
    revalidatePath('/finance/tuition-rules')
    return { created }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi sinh hóa đơn.',
    }
  }
}

export async function listStudentsForTuition(
  orgId: string | null
): Promise<{ data: { id: string; full_name: string }[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireFinanceScope(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'student')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('full_name')
      .limit(500)

    if (error) return { data: [], error: error.message }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        full_name: r.full_name as string,
      })),
    }
  } catch {
    return { data: [] }
  }
}
