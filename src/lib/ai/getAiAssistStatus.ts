'use server'

import { assertOrgAiReady, AI_NOT_ACTIVATED_MESSAGE } from '@/lib/ai/assertOrgAiReady'

export type AiAssistStatus = {
  ready: boolean
  message: string | null
  reason: 'ok' | 'disabled' | 'no_api' | 'bad_org'
}

/** Client gọi trước khi mở FAB / nút AI — không lộ API key. */
export async function getAiAssistStatus(orgId: string | null): Promise<AiAssistStatus> {
  const gate = await assertOrgAiReady(orgId)
  if (gate.ok) {
    return { ready: true, message: null, reason: 'ok' }
  }
  return {
    ready: false,
    message: gate.message || AI_NOT_ACTIVATED_MESSAGE,
    reason: gate.reason,
  }
}
