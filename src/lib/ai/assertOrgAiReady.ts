import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ORG_CONFIG, orgConfigSchema } from '@/lib/validation/schemas'
import { getAIConfig, type TenantAIConfig } from '@/lib/ai/getTenantAIConfig'
import { AI_NOT_ACTIVATED_MESSAGE } from '@/lib/ai/aiMessages'

export { AI_NOT_ACTIVATED_MESSAGE }

export type AiAssistGate =
  | { ok: true; config: TenantAIConfig }
  | { ok: false; message: string; reason: 'disabled' | 'no_api' | 'bad_org' }

/**
 * Kiểm tra admin cơ sở đã bật AI + có API key hiệu lực (org / cha / env).
 */
export async function assertOrgAiReady(orgId: string | null | undefined): Promise<AiAssistGate> {
  if (!orgId) {
    return { ok: false, message: AI_NOT_ACTIVATED_MESSAGE, reason: 'bad_org' }
  }

  try {
    const supabase = createClient()
    const { data: eff } = await supabase.rpc('get_org_effective_config', {
      p_org_id: orgId,
    })
    const parsed = orgConfigSchema.safeParse(eff ?? {})
    const cfg = parsed.success ? parsed.data : DEFAULT_ORG_CONFIG

    if (cfg.ai_assist_enabled === false) {
      return { ok: false, message: AI_NOT_ACTIVATED_MESSAGE, reason: 'disabled' }
    }

    const config = await getAIConfig(orgId)
    if (!config.apiKey?.trim()) {
      return { ok: false, message: AI_NOT_ACTIVATED_MESSAGE, reason: 'no_api' }
    }

    return { ok: true, config }
  } catch {
    return { ok: false, message: AI_NOT_ACTIVATED_MESSAGE, reason: 'no_api' }
  }
}
