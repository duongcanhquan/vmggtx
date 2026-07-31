'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  customFieldSchema,
  requiredId,
  zodFail,
  type ActionResult,
} from '@/lib/validation/schemas'
import type { CustomFieldDef, CustomFieldEntity } from '@/lib/customFields'

// ============================================================
// CRUD định nghĩa Trường dữ liệu động (org_custom_fields).
// - Đọc: mọi thành viên của org (form Thêm học sinh cần render).
// - Ghi/Xóa: chỉ campus_admin của subtree (double-check is_authorized,
//   RLS migration 019 chặn thêm tầng DB).
// ============================================================

type FieldRow = {
  id: string
  entity_type: CustomFieldEntity
  field_name: string
  field_label: string
  field_type: CustomFieldDef['fieldType']
  options: unknown
  is_required: boolean
}

function toDef(row: FieldRow): CustomFieldDef {
  return {
    id: row.id,
    entityType: row.entity_type,
    fieldName: row.field_name,
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    isRequired: row.is_required,
  }
}

/** Định nghĩa trường động của 1 org (tùy chọn lọc theo entity). */
export async function getCustomFields(
  orgId: string,
  entityType?: CustomFieldEntity
): Promise<{ data: CustomFieldDef[]; demo: boolean }> {
  try {
    const supabase = createClient()
    let query = supabase
      .from('org_custom_fields')
      .select('id, entity_type, field_name, field_label, field_type, options, is_required')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at')
    if (entityType) query = query.eq('entity_type', entityType)

    const { data, error } = await query
    if (error) throw error
    return { data: (data as FieldRow[]).map(toDef), demo: false }
  } catch {
    return { data: [], demo: true }
  }
}

/** Chốt cửa phân quyền chung cho các thao tác ghi */
async function assertCampusAdmin(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'Bạn chưa đăng nhập. Chức năng này yêu cầu quyền Campus Admin.'

  const { data: authorized, error } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'campus_admin',
  })
  if (error) return `Lỗi kiểm tra phân quyền: ${error.message}`
  if (authorized !== true) {
    return 'TỪ CHỐI: Bạn không phải Campus Admin, hoặc cơ sở này không thuộc quyền quản lý của bạn.'
  }
  return null
}

/** Tạo mới hoặc cập nhật 1 định nghĩa trường động. */
export async function saveCustomField(
  orgId: string,
  fieldId: string | null,
  rawValues: unknown
): Promise<ActionResult> {
  const orgParsed = requiredId('Thiếu org_id: vui lòng chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  const parsed = customFieldSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  const options =
    values.fieldType === 'select'
      ? values.optionsText.split(',').map((s) => s.trim()).filter(Boolean)
      : []

  try {
    const supabase = createClient()
    const authError = await assertCampusAdmin(supabase, orgParsed.data)
    if (authError) return { error: authError }

    const payload = {
      entity_type: values.entityType,
      field_name: values.fieldName,
      field_label: values.fieldLabel,
      field_type: values.fieldType,
      options,
      is_required: values.isRequired,
    }

    if (fieldId) {
      const { error } = await supabase
        .from('org_custom_fields')
        .update(payload)
        .eq('id', fieldId)
        .eq('org_id', orgParsed.data)
      if (error) {
        return { error: `Không thể cập nhật trường: ${error.message}` }
      }
    } else {
      const { error } = await supabase
        .from('org_custom_fields')
        .insert({ ...payload, org_id: orgParsed.data })
      if (error) {
        if (error.code === '23505') {
          return {
            error: `Tên biến "${values.fieldName}" đã tồn tại cho đối tượng này. Chọn tên khác.`,
          }
        }
        return { error: `Không thể tạo trường: ${error.message}` }
      }
    }

    revalidatePath('/settings/custom-fields')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi lưu trường động.',
    }
  }
}

/** Xóa mềm 1 định nghĩa trường động (giá trị đã lưu trong custom_metadata giữ nguyên). */
export async function deleteCustomField(fieldId: string): Promise<ActionResult> {
  const idParsed = requiredId('Thiếu ID trường cần xóa.').safeParse(fieldId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()

    const { data: field } = await supabase
      .from('org_custom_fields')
      .select('id, org_id')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!field) return { error: 'Trường không tồn tại hoặc đã bị xóa.' }

    const authError = await assertCampusAdmin(supabase, field.org_id)
    if (authError) return { error: authError }

    const { error } = await supabase
      .from('org_custom_fields')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', idParsed.data)
    if (error) return { error: `Không thể xóa trường: ${error.message}` }

    revalidatePath('/settings/custom-fields')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi xóa trường động.',
    }
  }
}
