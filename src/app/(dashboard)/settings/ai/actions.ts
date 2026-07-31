'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  aiSettingsSchema,
  requiredId,
  zodFail,
  type AIProvider,
} from '@/lib/validation/schemas'

// ============================================================
// Cấu hình AI theo tổ chức (Multi-tenant AI)
//
// NGUYÊN TẮC TỐI MẬT: api_key KHÔNG BAO GIỜ được trả về client.
// - getAISettings chỉ trả provider/model/is_active + 4 ký tự cuối
//   của key (keyPreview) để hiển thị "đã cấu hình".
// - RLS (migration 017) chỉ cho super_admin / campus_admin đúng
//   subtree đọc-ghi; Server Action double-check bằng is_authorized.
// ============================================================

export type AISettingsView = {
  /** true = org này đã có record cấu hình riêng */
  configured: boolean
  aiProvider: AIProvider
  defaultModel: string
  isActive: boolean
  /** 4 ký tự cuối của key (VD "•••• 3fKq") - '' nếu chưa có */
  keyPreview: string
  demo: boolean
}

const DEFAULT_VIEW: AISettingsView = {
  configured: false,
  aiProvider: 'openai',
  defaultModel: 'gpt-4o-mini',
  isActive: true,
  keyPreview: '',
  demo: false,
}

type ActionResult = { error: string } | { error?: undefined }

/** Cấu hình AI của org đang chọn - KHÔNG kèm api_key đầy đủ. */
export async function getAISettings(orgId: string): Promise<AISettingsView> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('org_ai_settings')
      .select('ai_provider, default_model, is_active, api_key')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) return DEFAULT_VIEW

    return {
      configured: true,
      aiProvider: data.ai_provider as AIProvider,
      defaultModel: data.default_model,
      isActive: data.is_active,
      keyPreview: data.api_key ? data.api_key.slice(-4) : '',
      demo: false,
    }
  } catch {
    return { ...DEFAULT_VIEW, demo: true }
  }
}

/**
 * Lưu cấu hình AI cho org đang chọn.
 *
 * BẢO MẬT: Zod validate -> đăng nhập -> is_authorized(campus_admin, org)
 * -> upsert qua SSR client (RLS migration 017 chặn thêm tầng DB).
 * apiKey để trống = giữ nguyên key cũ (chỉ đổi provider/model/is_active).
 */
export async function saveAISettings(
  orgId: string,
  rawValues: unknown
): Promise<ActionResult> {
  const orgParsed = requiredId('Thiếu org_id: vui lòng chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  const parsed = aiSettingsSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

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

    // Key để trống -> bắt buộc org phải ĐÃ có key (chỉ update metadata)
    const { data: existing } = await supabase
      .from('org_ai_settings')
      .select('id')
      .eq('org_id', orgParsed.data)
      .is('deleted_at', null)
      .maybeSingle()

    if (!values.apiKey && !existing) {
      return { error: 'Vui lòng nhập API Key (cơ sở này chưa có key nào được lưu).' }
    }

    if (existing) {
      const patch: Record<string, unknown> = {
        ai_provider: values.aiProvider,
        default_model: values.defaultModel,
        is_active: values.isActive,
      }
      if (values.apiKey) patch.api_key = values.apiKey

      const { error } = await supabase
        .from('org_ai_settings')
        .update(patch)
        .eq('org_id', orgParsed.data)
      if (error) return { error: `Không thể cập nhật cấu hình AI: ${error.message}` }
    } else {
      const { error } = await supabase.from('org_ai_settings').insert({
        org_id: orgParsed.data,
        ai_provider: values.aiProvider,
        default_model: values.defaultModel,
        api_key: values.apiKey,
        is_active: values.isActive,
      })
      if (error) return { error: `Không thể lưu cấu hình AI: ${error.message}` }
    }

    revalidatePath('/settings/ai')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Lỗi không xác định khi lưu cấu hình AI.',
    }
  }
}
