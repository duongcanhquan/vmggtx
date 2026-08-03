'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  aiSettingsSchema,
  requiredId,
  zodFail,
  type AIProvider,
} from '@/lib/validation/schemas'

// ============================================================
// Super Admin — phân bổ API AI theo Đơn vị (/admin/ai)
// Key không bao giờ trả full về client (chỉ 4 ký tự cuối).
// ============================================================

async function requireSuper(): Promise<
  { error: string } | { error?: undefined; userId: string }
> {
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
    return { error: 'TỪ CHỐI: Chỉ Super Admin được phân bổ API theo đơn vị.' }
  }
  return { userId: user.id }
}

export type OrgAIRow = {
  orgId: string
  orgName: string
  orgType: string
  parentId: string | null
  /** Đơn vị cấp 1 (con trực tiếp của HQ) — ưu tiên phân bổ */
  isLevel1: boolean
  configured: boolean
  aiProvider: AIProvider
  defaultModel: string
  isActive: boolean
  keyPreview: string
  /** Nguồn key hiệu lực khi không có key riêng */
  effectiveSource: 'own' | 'inherited' | 'hq' | 'env'
  effectiveHint: string
}

export type OrgAICenterData =
  | { error: string }
  | {
      error?: undefined
      rows: OrgAIRow[]
      hqKeyConfigured: boolean
      envKeyConfigured: boolean
    }

function previewKey(key: string | null | undefined): string {
  if (!key) return ''
  return key.slice(-4)
}

export async function getOrgAICenterData(): Promise<OrgAICenterData> {
  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const admin = createAdminClient()
    const [orgsRes, aiRes, rootsRes] = await Promise.all([
      admin
        .from('organizations')
        .select('id, name, type, parent_id')
        .is('deleted_at', null)
        .order('name'),
      admin
        .from('org_ai_settings')
        .select('org_id, ai_provider, default_model, is_active, api_key')
        .is('deleted_at', null),
      admin
        .from('organizations')
        .select('id')
        .is('parent_id', null)
        .is('deleted_at', null),
    ])

    if (orgsRes.error) {
      return { error: `Không tải đơn vị: ${orgsRes.error.message}` }
    }

    if (aiRes.error) {
      if (/org_ai_settings|42P01|schema cache/i.test(aiRes.error.message)) {
        return {
          error:
            'Chưa có bảng org_ai_settings (migration 017). Chạy SQL rồi tải lại trang Cài đặt chung.',
        }
      }
      return { error: `Không tải cấu hình API: ${aiRes.error.message}` }
    }

    const allOrgs = orgsRes.data ?? []
    const rootIds = new Set(allOrgs.filter((o) => !o.parent_id).map((o) => o.id))
    const byId = new Map(allOrgs.map((o) => [o.id, o]))

    const aiByOrg = new Map<
      string,
      {
        ai_provider: string
        default_model: string
        is_active: boolean
        api_key: string | null
      }
    >()
    for (const row of aiRes.data ?? []) {
      aiByOrg.set(row.org_id, {
        ai_provider: row.ai_provider,
        default_model: row.default_model,
        is_active: row.is_active,
        api_key: row.api_key,
      })
    }

    let hqKeyConfigured = false
    const rootOrgIds = (rootsRes.data ?? []).map((r) => r.id)
    if (rootOrgIds.length > 0) {
      const { data: hqSettings } = await admin
        .from('org_settings')
        .select('config')
        .in('org_id', rootOrgIds)
      for (const row of hqSettings ?? []) {
        const config = row.config as Record<string, unknown> | null
        if (config && typeof config.openai_api_key === 'string' && config.openai_api_key) {
          hqKeyConfigured = true
          break
        }
      }
    }

    const envKeyConfigured = Boolean(process.env.OPENAI_API_KEY)

    function resolveEffective(orgId: string): {
      source: OrgAIRow['effectiveSource']
      hint: string
    } {
      let current: string | null = orgId
      for (let d = 0; d < 10 && current; d++) {
        const own = aiByOrg.get(current)
        if (own?.is_active && own.api_key) {
          if (current === orgId) {
            return { source: 'own', hint: 'Dùng key riêng của đơn vị này' }
          }
          const parentName = byId.get(current)?.name ?? 'đơn vị cha'
          return { source: 'inherited', hint: `Kế thừa từ ${parentName}` }
        }
        current = byId.get(current)?.parent_id ?? null
      }
      if (hqKeyConfigured) {
        return { source: 'hq', hint: 'Key toàn cục HQ (/admin/settings)' }
      }
      if (envKeyConfigured) {
        return { source: 'env', hint: 'Biến môi trường OPENAI_API_KEY' }
      }
      return { source: 'env', hint: 'Chưa có key — AI sẽ không chạy' }
    }

    const rows: OrgAIRow[] = allOrgs
      .filter((o) => o.parent_id !== null)
      .map((org) => {
        const ai = aiByOrg.get(org.id)
        const effective = resolveEffective(org.id)
        return {
          orgId: org.id,
          orgName: org.name,
          orgType: org.type,
          parentId: org.parent_id,
          isLevel1: org.parent_id !== null && rootIds.has(org.parent_id),
          configured: Boolean(ai),
          aiProvider: (ai?.ai_provider as AIProvider) ?? 'openai',
          defaultModel: ai?.default_model ?? 'gpt-4o-mini',
          isActive: ai?.is_active ?? true,
          keyPreview: previewKey(ai?.api_key),
          effectiveSource: effective.source,
          effectiveHint: effective.hint,
        }
      })
      .sort((a, b) => {
        if (a.isLevel1 !== b.isLevel1) return a.isLevel1 ? -1 : 1
        return a.orgName.localeCompare(b.orgName, 'vi')
      })

    return {
      rows,
      hqKeyConfigured,
      envKeyConfigured,
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Không tải được danh sách API đơn vị.',
    }
  }
}

export async function saveOrgAISettings(
  orgId: string,
  rawValues: unknown
): Promise<{ error?: string }> {
  const orgParsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  const parsed = aiSettingsSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id')
      .eq('id', orgParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!org) return { error: 'Đơn vị không tồn tại.' }

    const { data: existing } = await admin
      .from('org_ai_settings')
      .select('id')
      .eq('org_id', orgParsed.data)
      .is('deleted_at', null)
      .maybeSingle()

    if (!values.apiKey && !existing) {
      return { error: 'Vui lòng nhập API Key (đơn vị này chưa có key).' }
    }

    if (existing) {
      const patch: Record<string, unknown> = {
        ai_provider: values.aiProvider,
        default_model: values.defaultModel,
        is_active: values.isActive,
        updated_at: new Date().toISOString(),
      }
      if (values.apiKey) patch.api_key = values.apiKey
      const { error } = await admin
        .from('org_ai_settings')
        .update(patch)
        .eq('org_id', orgParsed.data)
      if (error) return { error: `Không lưu được: ${error.message}` }
    } else {
      const { error } = await admin.from('org_ai_settings').insert({
        org_id: orgParsed.data,
        ai_provider: values.aiProvider,
        default_model: values.defaultModel,
        api_key: values.apiKey,
        is_active: values.isActive,
      })
      if (error) return { error: `Không tạo được: ${error.message}` }
    }

    revalidatePath('/admin/ai')
    revalidatePath('/admin/settings')
    revalidatePath('/settings/ai')
    return {}
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi không xác định khi lưu API.',
    }
  }
}

/** Soft-delete cấu hình riêng → đơn vị quay về kế thừa HQ/env. */
export async function clearOrgAISettings(
  orgId: string
): Promise<{ error?: string }> {
  const orgParsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const admin = createAdminClient()
    const { error } = await admin
      .from('org_ai_settings')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('org_id', orgParsed.data)
      .is('deleted_at', null)

    if (error) return { error: `Không xóa được: ${error.message}` }
    revalidatePath('/admin/ai')
    revalidatePath('/admin/settings')
    return {}
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi khi gỡ API đơn vị.',
    }
  }
}
