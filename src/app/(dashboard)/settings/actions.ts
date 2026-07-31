'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_ORG_CONFIG,
  orgConfigSchema,
  requiredId,
  zodFail,
  type OrgConfig,
} from '@/lib/validation/schemas'

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
}

type ActionResult = { error: string } | { error?: undefined }

/** Config hiệu lực của org (default -> HQ -> Region -> chính org) */
export async function getOrgSettings(orgId: string): Promise<SettingsResult> {
  try {
    const supabase = createClient()

    // [SECURITY AUDIT] Chỉ user đăng nhập, org đích trong subtree (trừ super_admin)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { config: DEFAULT_ORG_CONFIG, hasOwnRecord: false, demo: true }
    }
    const [{ data: inScope }, { data: profile }] = await Promise.all([
      supabase.rpc('is_org_in_my_subtree', { p_target_org_id: orgId }),
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    ])
    if (profile?.role !== 'super_admin' && inScope !== true) {
      return { config: DEFAULT_ORG_CONFIG, hasOwnRecord: false, demo: true }
    }

    const [effectiveResult, ownResult] = await Promise.all([
      supabase.rpc('get_org_effective_config', { p_org_id: orgId }),
      supabase
        .from('org_settings')
        .select('id')
        .eq('org_id', orgId)
        .maybeSingle(),
    ])
    if (effectiveResult.error) throw effectiveResult.error

    // Hàm SQL luôn trả đủ key nhờ default; parse lại cho chắc kiểu
    const parsed = orgConfigSchema.safeParse(effectiveResult.data)
    return {
      config: parsed.success ? parsed.data : DEFAULT_ORG_CONFIG,
      hasOwnRecord: ownResult.data !== null,
      demo: false,
    }
  } catch {
    return { config: DEFAULT_ORG_CONFIG, hasOwnRecord: false, demo: true }
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
