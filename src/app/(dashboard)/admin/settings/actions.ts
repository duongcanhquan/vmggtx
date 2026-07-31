'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  globalSettingsSchema,
  zodFail,
  type ActionResult,
  type GlobalSettingsValues,
} from '@/lib/validation/schemas'
import { SETTING_DEFAULTS } from '@/lib/utils/settingsResolver'

// ============================================================
// Cài đặt TOÀN CỤC của SuperAdmin (/admin/settings).
//
// Giá trị được lưu vào org_settings của HQ (org gốc, parent_id
// = null). Nhờ settingsResolver kế thừa từ trên xuống, mọi cơ sở
// con CHƯA tự ghi đè sẽ tự động nhận giá trị mới - "tràn" toàn
// hệ thống chỉ với 1 lần lưu.
// ============================================================

export type GlobalSettingsResult = {
  rootOrgId: string | null
  rootOrgName: string
  values: GlobalSettingsValues
  /** true = key đã có trong config của HQ; false = đang dùng default trong code */
  hasApiKey: boolean
  /** Số org con đã tự ghi đè config riêng (có record org_settings) */
  overrideCount: number
  demo: boolean
}

const FALLBACK_VALUES: GlobalSettingsValues = {
  openai_api_key: '',
  allow_late_checkin_minutes: SETTING_DEFAULTS.allow_late_checkin_minutes,
  tax_rate_default: SETTING_DEFAULTS.tax_rate_default,
}

/** Chốt cửa: chỉ super_admin được vào (middleware chặn thêm ở tầng route) */
async function assertSuperAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (profile?.role !== 'super_admin') {
    return { error: 'TỪ CHỐI: Chỉ Super Admin được truy cập Cài đặt toàn cục.' }
  }
  return { userId: user.id }
}

/** Đọc config hiện tại của HQ (org gốc) + thống kê ghi đè */
export async function getGlobalSettings(): Promise<GlobalSettingsResult> {
  try {
    const auth = await assertSuperAdmin()
    if ('error' in auth) {
      return {
        rootOrgId: null,
        rootOrgName: 'Tổng công ty (HQ)',
        values: FALLBACK_VALUES,
        hasApiKey: false,
        overrideCount: 0,
        demo: true,
      }
    }

    const supabase = createClient()

    const { data: rootOrg } = await supabase
      .from('organizations')
      .select('id, name')
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (!rootOrg) {
      return {
        rootOrgId: null,
        rootOrgName: 'Tổng công ty (HQ)',
        values: FALLBACK_VALUES,
        hasApiKey: false,
        overrideCount: 0,
        demo: true,
      }
    }

    const [settingsResult, overridesResult] = await Promise.all([
      supabase
        .from('org_settings')
        .select('config')
        .eq('org_id', rootOrg.id)
        .maybeSingle(),
      supabase
        .from('org_settings')
        .select('id', { count: 'exact', head: true })
        .neq('org_id', rootOrg.id),
    ])

    const config = (settingsResult.data?.config as Record<string, unknown>) ?? {}
    const values: GlobalSettingsValues = {
      // API key không trả nguyên văn xuống client - chỉ báo ĐÃ/CHƯA đặt
      openai_api_key: '',
      allow_late_checkin_minutes:
        typeof config.allow_late_checkin_minutes === 'number'
          ? config.allow_late_checkin_minutes
          : SETTING_DEFAULTS.allow_late_checkin_minutes,
      tax_rate_default:
        typeof config.tax_rate_default === 'number'
          ? config.tax_rate_default
          : SETTING_DEFAULTS.tax_rate_default,
    }

    return {
      rootOrgId: rootOrg.id,
      rootOrgName: rootOrg.name,
      values,
      hasApiKey:
        typeof config.openai_api_key === 'string' && config.openai_api_key.length > 0,
      overrideCount: overridesResult.count ?? 0,
      demo: false,
    }
  } catch {
    return {
      rootOrgId: null,
      rootOrgName: 'Tổng công ty (HQ)',
      values: FALLBACK_VALUES,
      hasApiKey: false,
      overrideCount: 0,
      demo: true,
    }
  }
}

/**
 * Lưu cài đặt toàn cục vào org_settings của HQ (merge, không ghi đè
 * các key khác như auto_attendance_sms đã đặt từ /settings).
 */
export async function saveGlobalSettings(rawValues: unknown): Promise<ActionResult> {
  const parsed = globalSettingsSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const auth = await assertSuperAdmin()
    if ('error' in auth) return { error: auth.error }

    // Admin client: đảm bảo ghi được record HQ kể cả khi RLS coi HQ
    // nằm ngoài subtree cụ thể - đã qua cửa super_admin ở trên.
    const admin = createAdminClient()

    const { data: rootOrg } = await admin
      .from('organizations')
      .select('id')
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (!rootOrg) return { error: 'Không tìm thấy tổ chức gốc (HQ) trong hệ thống.' }

    const { data: existing } = await admin
      .from('org_settings')
      .select('config')
      .eq('org_id', rootOrg.id)
      .maybeSingle()
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {}

    const mergedConfig: Record<string, unknown> = {
      ...existingConfig,
      allow_late_checkin_minutes: values.allow_late_checkin_minutes,
      tax_rate_default: values.tax_rate_default,
    }
    // API key: chỉ ghi đè khi nhập mới; bỏ trống = GIỮ key hiện tại
    if (values.openai_api_key) {
      mergedConfig.openai_api_key = values.openai_api_key
    }

    const { error } = await admin.from('org_settings').upsert(
      {
        org_id: rootOrg.id,
        config: mergedConfig,
        updated_by: auth.userId,
      },
      { onConflict: 'org_id' }
    )
    if (error) return { error: `Không thể lưu cài đặt toàn cục: ${error.message}` }

    revalidatePath('/admin/settings')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Lỗi không xác định khi lưu cài đặt toàn cục.',
    }
  }
}

/** Xóa key OpenAI dùng chung khỏi HQ (quay về dùng biến môi trường) */
export async function clearGlobalApiKey(): Promise<ActionResult> {
  try {
    const auth = await assertSuperAdmin()
    if ('error' in auth) return { error: auth.error }

    const admin = createAdminClient()
    const { data: rootOrg } = await admin
      .from('organizations')
      .select('id')
      .is('parent_id', null)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (!rootOrg) return { error: 'Không tìm thấy tổ chức gốc (HQ).' }

    const { data: existing } = await admin
      .from('org_settings')
      .select('config')
      .eq('org_id', rootOrg.id)
      .maybeSingle()
    if (!existing) return {}

    const config = { ...((existing.config as Record<string, unknown>) ?? {}) }
    delete config.openai_api_key

    const { error } = await admin
      .from('org_settings')
      .update({ config, updated_by: auth.userId })
      .eq('org_id', rootOrg.id)
    if (error) return { error: `Không thể xóa API key: ${error.message}` }

    revalidatePath('/admin/settings')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi xóa API key.',
    }
  }
}
