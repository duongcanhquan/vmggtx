import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSetting } from '@/lib/utils/settingsResolver'

// ============================================================
// Multi-tenant AI - Bộ chọn cấu hình AI theo tổ chức.
//
// Thứ tự ưu tiên (fallback dây chuyền lên CÂY TỔ CHỨC):
//   1. Key của chính org_id (org_ai_settings, is_active = true)
//   2. Key của org Mẹ -> Ông -> ... (leo đệ quy theo parent_id)
//   3. Key `openai_api_key` trong org_settings (settingsResolver -
//      SuperAdmin đặt ở HQ tại /admin/settings là tràn xuống toàn hệ thống)
//   4. Vẫn không có -> biến môi trường OPENAI_API_KEY
//
// BẢO MẬT:
// - File này là 'server-only': import nhầm vào Client Component
//   sẽ vỡ build ngay - api_key không bao giờ lọt xuống browser.
// - Dùng Supabase ADMIN client (Service Role) để đọc key của các
//   org TỔ TIÊN: RLS cố tình không cho user thường đọc bảng này;
//   tầng chạy AI (API routes / Server Actions) mới cần key thật.
// ============================================================

export type AIProviderName = 'openai' | 'anthropic' | 'google'

export type TenantAIConfig = {
  provider: AIProviderName
  apiKey: string
  model: string
  /** org thực sự sở hữu key (có thể là org cha khi kế thừa) */
  sourceOrgId: string | null
  /** 'own' = key của chính org, 'inherited' = key của org tổ tiên, 'env' = fallback cuối */
  source: 'own' | 'inherited' | 'env'
}

/** Chống vòng lặp nếu dữ liệu cây bị hỏng (parent trỏ ngược xuống con) */
const MAX_TREE_DEPTH = 10

function envFallback(): TenantAIConfig {
  return {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: 'gpt-4o-mini',
    sourceOrgId: null,
    source: 'env',
  }
}

/**
 * Lấy cấu hình AI hiệu lực cho một tổ chức.
 * KHÔNG BAO GIỜ ném exception: mọi lỗi (DB sập, thiếu Service Role...)
 * đều rơi về env fallback để tính năng AI không kéo sập trang.
 */
export async function getAIConfig(orgId: string | null): Promise<TenantAIConfig> {
  if (!orgId) return envFallback()

  try {
    const admin = createAdminClient()
    let currentOrgId: string | null = orgId

    for (let depth = 0; depth < MAX_TREE_DEPTH && currentOrgId; depth++) {
      // 1. Org hiện tại có key active không?
      const { data: settings, error: settingsError } = await admin
        .from('org_ai_settings')
        .select('ai_provider, api_key, default_model')
        .eq('org_id', currentOrgId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle()
      if (settingsError) return envFallback()

      if (settings?.api_key) {
        return {
          provider: settings.ai_provider as AIProviderName,
          apiKey: settings.api_key,
          model: settings.default_model,
          sourceOrgId: currentOrgId,
          source: currentOrgId === orgId ? 'own' : 'inherited',
        }
      }

      // 2. Không có -> leo lên org Mẹ
      const orgResult = await admin
        .from('organizations')
        .select('parent_id')
        .eq('id', currentOrgId)
        .is('deleted_at', null)
        .maybeSingle()
      const org = orgResult.data as { parent_id: string | null } | null
      if (orgResult.error || !org) return envFallback()

      currentOrgId = org.parent_id
    }

    // 3. Hết cây org_ai_settings -> thử key chung trong org_settings
    //    (kế thừa Cơ sở -> Cụm -> HQ qua settingsResolver)
    const sharedKey = await resolveSetting('openai_api_key', orgId)
    if (sharedKey.value) {
      return {
        provider: 'openai',
        apiKey: sharedKey.value,
        model: 'gpt-4o-mini',
        sourceOrgId: sharedKey.sourceOrgId,
        source: sharedKey.source === 'default' ? 'env' : 'inherited',
      }
    }

    // 4. Hết mọi tầng -> biến môi trường
    return envFallback()
  } catch {
    // Thiếu SUPABASE_SERVICE_ROLE_KEY hoặc lỗi kết nối
    return envFallback()
  }
}
