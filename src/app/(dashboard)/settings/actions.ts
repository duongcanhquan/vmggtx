'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_ORG_CONFIG,
  orgConfigSchema,
  requiredId,
  zodFail,
  type OrgConfig,
} from '@/lib/validation/schemas'
import {
  SETTING_GROUPS,
  isOverridePolicy,
  parseOverridePolicies,
  type OverridePolicies,
  type SettingGroupKey,
} from '@/lib/settings/settingsPolicy'

// ============================================================
// Cấu hình động theo tổ chức (/settings)
//
// - getOrgSettings(orgId): trả về config HIỆU LỰC (đã kế thừa từ
//   cấp cha qua hàm SQL get_org_effective_config) + cờ hasOwnRecord
//   cho biết org này có record riêng hay đang thừa hưởng hoàn toàn.
// - saveOrgSettings: upsert config JSONB cho CHÍNH org đang chọn
//   (các org con không có record riêng sẽ tự kế thừa giá trị mới).
// ============================================================

export type SettingsResult = {
  config: OrgConfig
  /** true = org này có record riêng trong org_settings */
  hasOwnRecord: boolean
  demo: boolean
  /** [G5] Chính sách ghi đè do Đơn vị gốc đặt (mặc định = inherit) */
  policies: OverridePolicies
  /** true = org đang chọn CHÍNH LÀ Đơn vị gốc (được sửa chính sách) */
  isUnitRoot: boolean
  /** Tên Đơn vị gốc (hiển thị "Bị khóa bởi …" / "Kế thừa từ …") */
  unitName: string | null
}

type ActionResult = { error: string } | { error?: undefined }

/**
 * [G5] Tìm ĐƠN VỊ gốc (org type='campus') của một org: chính nó nếu là
 * campus, hoặc tổ tiên campus gần nhất. null = org nằm ngoài mọi Đơn vị
 * (hq/region di sản). Dùng admin client vì RLS không cho đọc org cấp trên.
 */
async function findUnitRoot(
  orgId: string
): Promise<{ id: string; name: string } | null> {
  const admin = createAdminClient()
  let cursorId: string | null = orgId
  for (let i = 0; i < 6 && cursorId; i++) {
    const { data } = await admin
      .from('organizations')
      .select('id, name, type, parent_id')
      .eq('id', cursorId)
      .is('deleted_at', null)
      .maybeSingle()
    const org = data as
      | { id: string; name: string; type: string; parent_id: string | null }
      | null
    if (!org) return null
    if (org.type === 'campus') return { id: org.id, name: org.name }
    cursorId = org.parent_id ?? null
  }
  return null
}

/** [G5] Đọc chính sách ghi đè từ org_settings của Đơn vị gốc */
async function getUnitPolicies(unitId: string): Promise<OverridePolicies> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('org_settings')
    .select('config')
    .eq('org_id', unitId)
    .maybeSingle()
  const config = (data?.config ?? {}) as Record<string, unknown>
  return parseOverridePolicies(config['override_policies'])
}

const EMPTY_POLICY_STATE = {
  policies: {} as OverridePolicies,
  isUnitRoot: false,
  unitName: null as string | null,
}

/** Config hiệu lực của org (default -> HQ -> Region -> chính org) */
export async function getOrgSettings(orgId: string): Promise<SettingsResult> {
  try {
    const supabase = createClient()

    // [SECURITY AUDIT] Chỉ user đăng nhập, org đích trong subtree (trừ super_admin)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { config: DEFAULT_ORG_CONFIG, hasOwnRecord: false, demo: true, ...EMPTY_POLICY_STATE }
    }
    const [{ data: inScope }, { data: profile }] = await Promise.all([
      supabase.rpc('is_org_in_my_subtree', { p_target_org_id: orgId }),
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    ])
    if (profile?.role !== 'super_admin' && inScope !== true) {
      return { config: DEFAULT_ORG_CONFIG, hasOwnRecord: false, demo: true, ...EMPTY_POLICY_STATE }
    }

    const [effectiveResult, ownResult, unitRoot] = await Promise.all([
      supabase.rpc('get_org_effective_config', { p_org_id: orgId }),
      supabase
        .from('org_settings')
        .select('id')
        .eq('org_id', orgId)
        .maybeSingle(),
      findUnitRoot(orgId),
    ])
    if (effectiveResult.error) throw effectiveResult.error

    const policies = unitRoot ? await getUnitPolicies(unitRoot.id) : {}

    // Hàm SQL luôn trả đủ key nhờ default; parse lại cho chắc kiểu
    const parsed = orgConfigSchema.safeParse(effectiveResult.data)
    return {
      config: parsed.success ? parsed.data : DEFAULT_ORG_CONFIG,
      hasOwnRecord: ownResult.data !== null,
      demo: false,
      policies,
      isUnitRoot: unitRoot !== null && unitRoot.id === orgId,
      unitName: unitRoot?.name ?? null,
    }
  } catch {
    return { config: DEFAULT_ORG_CONFIG, hasOwnRecord: false, demo: true, ...EMPTY_POLICY_STATE }
  }
}

/**
 * Lưu config cho org đang chọn.
 *
 * BẢO MẬT: Zod validate -> đăng nhập -> is_authorized(campus_admin, org).
 * Upsert theo unique(org_id); RLS (016) chặn thêm lần 2 ở tầng DB.
 */
export async function saveOrgSettings(
  orgId: string,
  rawConfig: unknown
): Promise<ActionResult> {
  const orgParsed = requiredId('Thiếu org_id: vui lòng chọn cấp quản lý.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  const configParsed = orgConfigSchema.safeParse(rawConfig)
  if (!configParsed.success) return zodFail(configParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) {
      return { error: 'Bạn chưa đăng nhập. Chức năng này yêu cầu quyền Campus Admin.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgParsed.data,
      p_required_role: 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return {
        error:
          'TỪ CHỐI: Bạn không phải Campus Admin, hoặc cơ sở này không thuộc quyền quản lý của bạn.',
      }
    }

    // [G5 - KHÓA CỨNG] Nếu org đích KHÔNG phải Đơn vị gốc: nhóm quy định
    // bị Đơn vị khóa thì cơ sở không được đổi khác giá trị chung.
    const unitRoot = await findUnitRoot(orgParsed.data)
    if (unitRoot && unitRoot.id !== orgParsed.data) {
      const policies = await getUnitPolicies(unitRoot.id)
      const lockedGroups = SETTING_GROUPS.filter(
        (group) => policies[group.key] === 'locked'
      )
      if (lockedGroups.length > 0) {
        const admin = createAdminClient()
        const { data: unitEffective } = await admin.rpc('get_org_effective_config', {
          p_org_id: unitRoot.id,
        })
        const unitParsed = orgConfigSchema.safeParse(unitEffective)
        const unitConfig = unitParsed.success ? unitParsed.data : DEFAULT_ORG_CONFIG
        for (const group of lockedGroups) {
          const changed = group.fields.some(
            (field) =>
              JSON.stringify(configParsed.data[field]) !==
              JSON.stringify(unitConfig[field])
          )
          if (changed) {
            return {
              error: `Mục "${group.label}" đã bị "${unitRoot.name}" KHÓA CỨNG toàn Đơn vị — cơ sở không được tự thay đổi. Liên hệ Admin Đơn vị nếu cần điều chỉnh.`,
            }
          }
        }
      }
    }

    // MERGE với config hiện có: record org_settings có thể chứa thêm
    // các key toàn cục (openai_api_key, tax_rate_default... đặt từ
    // /admin/settings) - ghi đè cả cục sẽ làm mất chúng.
    const { data: existing } = await supabase
      .from('org_settings')
      .select('config')
      .eq('org_id', orgParsed.data)
      .maybeSingle()
    const mergedConfig = {
      ...((existing?.config as Record<string, unknown>) ?? {}),
      ...configParsed.data,
    }

    const { error } = await supabase.from('org_settings').upsert(
      {
        org_id: orgParsed.data,
        config: mergedConfig,
        updated_by: currentUser.id,
      },
      { onConflict: 'org_id' }
    )
    if (error) return { error: `Không thể lưu cấu hình: ${error.message}` }

    revalidatePath('/settings')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi lưu cấu hình.',
    }
  }
}

/**
 * [G5] Lưu chính sách ghi đè cho các Cơ sở bên dưới — CHỈ Admin của
 * CHÍNH Đơn vị gốc (hoặc Super Admin) được đặt.
 */
export async function saveSettingsPolicies(
  orgId: string,
  groupKey: SettingGroupKey,
  policy: string
): Promise<ActionResult> {
  const orgParsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)
  if (!SETTING_GROUPS.some((g) => g.key === groupKey)) {
    return { error: 'Nhóm cài đặt không hợp lệ.' }
  }
  if (!isOverridePolicy(policy)) return { error: 'Chính sách không hợp lệ.' }

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgParsed.data,
      p_required_role: 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền với Đơn vị này.' }
    }

    // Chính sách chỉ đặt trên CHÍNH Đơn vị gốc (type='campus')
    const unitRoot = await findUnitRoot(orgParsed.data)
    if (!unitRoot || unitRoot.id !== orgParsed.data) {
      return {
        error: 'Chính sách ghi đè chỉ đặt được trên chính Đơn vị (Trường) gốc.',
      }
    }

    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('org_settings')
      .select('config')
      .eq('org_id', orgParsed.data)
      .maybeSingle()
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {}
    const currentPolicies = parseOverridePolicies(existingConfig['override_policies'])
    const mergedConfig = {
      ...existingConfig,
      override_policies: { ...currentPolicies, [groupKey]: policy },
    }

    const { error } = await admin.from('org_settings').upsert(
      {
        org_id: orgParsed.data,
        config: mergedConfig,
        updated_by: currentUser.id,
      },
      { onConflict: 'org_id' }
    )
    if (error) return { error: `Không lưu được chính sách: ${error.message}` }

    revalidatePath('/settings')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
