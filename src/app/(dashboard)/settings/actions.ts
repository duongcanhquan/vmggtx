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
import {
  ALLOWED_LOGO_MIMES,
  MAX_LOGO_BYTES,
  buildObjectKey,
  isAllowedLogoMime,
  isR2Configured,
  publicUrlForKey,
  putObjectBytes,
} from '@/lib/storage/r2'

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

// ---------- Logo thương hiệu ----------

export type OrgLogoResult = {
  logoUrl: string | null
  demo: boolean
  r2Ready: boolean
}

async function assertCampusAdminOnOrg(orgId: string): Promise<
  { error: string } | { error?: undefined; userId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }
  const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'campus_admin',
  })
  if (authzError) return { error: `Lỗi phân quyền: ${authzError.message}` }
  if (authorized !== true) {
    return { error: 'Chỉ quản trị cơ sở mới được đổi logo.' }
  }
  return { userId: user.id }
}

export async function getOrgLogo(orgId: string): Promise<OrgLogoResult> {
  const parsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!parsed.success) return { logoUrl: null, demo: false, r2Ready: isR2Configured() }
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('organizations')
      .select('logo_url, logo_key')
      .eq('id', parsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) return { logoUrl: null, demo: false, r2Ready: isR2Configured() }
    const logoUrl =
      data.logo_url ||
      (data.logo_key ? `/api/org-logo/${parsed.data}` : null)
    return { logoUrl, demo: false, r2Ready: isR2Configured() }
  } catch {
    return { logoUrl: null, demo: true, r2Ready: isR2Configured() }
  }
}

/**
 * Upload logo (FormData: orgId, file).
 * R2 nếu đã cấu hình; không thì lưu data URL (≤ 200KB) vào logo_url.
 */
export async function uploadOrgLogo(
  formData: FormData
): Promise<{ error: string } | { error?: undefined; logoUrl: string }> {
  const orgParsed = requiredId('Thiếu org_id.').safeParse(String(formData.get('orgId') ?? ''))
  if (!orgParsed.success) return zodFail(orgParsed.error)
  const gate = await assertCampusAdminOnOrg(orgParsed.data)
  if (gate.error !== undefined) return { error: gate.error }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Vui lòng chọn file ảnh logo.' }
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: 'Logo tối đa 2MB.' }
  }
  const mime = file.type || 'application/octet-stream'
  if (!isAllowedLogoMime(mime)) {
    return {
      error: `Định dạng không hỗ trợ. Cho phép: ${ALLOWED_LOGO_MIMES.join(', ')}`,
    }
  }

  try {
    const admin = createAdminClient()
    const bytes = Buffer.from(await file.arrayBuffer())

    if (isR2Configured()) {
      const key = buildObjectKey(orgParsed.data, 'branding', file.name || 'logo.png')
      await putObjectBytes(key, bytes, mime)
      const publicUrl = publicUrlForKey(key)
      const logoUrl = publicUrl ?? `/api/org-logo/${orgParsed.data}`
      const { error } = await admin
        .from('organizations')
        .update({
          logo_url: logoUrl,
          logo_key: key,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgParsed.data)
      if (error) {
        if (/logo_url|logo_key|42703/i.test(error.message)) {
          return {
            error: 'Thiếu cột logo (chạy migration 051_org_logo.sql trên Supabase).',
          }
        }
        return { error: `Không lưu logo: ${error.message}` }
      }
      revalidatePath('/settings')
      revalidatePath('/coso')
      return { logoUrl: `${logoUrl}?v=${Date.now()}` }
    }

    // Fallback không R2: data URL nhỏ
    if (bytes.length > 200 * 1024) {
      return {
        error:
          'Chưa cấu hình R2 — logo tạm tối đa 200KB. Cấu hình R2 hoặc nén ảnh nhỏ hơn.',
      }
    }
    const b64 = bytes.toString('base64')
    const dataUrl = `data:${mime};base64,${b64}`
    const { error } = await admin
      .from('organizations')
      .update({
        logo_url: dataUrl,
        logo_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgParsed.data)
    if (error) {
      if (/logo_url|42703/i.test(error.message)) {
        return {
          error: 'Thiếu cột logo (chạy migration 051_org_logo.sql trên Supabase).',
        }
      }
      return { error: `Không lưu logo: ${error.message}` }
    }
    revalidatePath('/settings')
    return { logoUrl: dataUrl }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi upload logo.',
    }
  }
}

export async function clearOrgLogo(
  orgId: string
): Promise<{ error: string } | { error?: undefined }> {
  const orgParsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)
  const gate = await assertCampusAdminOnOrg(orgParsed.data)
  if (gate.error !== undefined) return { error: gate.error }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('organizations')
      .update({
        logo_url: null,
        logo_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgParsed.data)
    if (error) return { error: error.message }
    revalidatePath('/settings')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi xóa logo.',
    }
  }
}
