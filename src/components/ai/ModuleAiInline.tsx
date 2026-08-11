'use client'

import type { ModuleAiKey } from '@/lib/ai/moduleAssist'

/**
 * @deprecated D49 — không còn render khối AI trên trang.
 * Dùng nút nổi ModuleAskAi (DashboardShell / PortalShell) để tránh trùng UI.
 * Giữ export để không vỡ import cũ nếu còn sót.
 */
export function ModuleAiInline(_props: {
  moduleKey: ModuleAiKey
  defaultOpen?: boolean
}) {
  return null
}
