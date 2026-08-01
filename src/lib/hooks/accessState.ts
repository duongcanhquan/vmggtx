'use client'

import { createClient } from '@/lib/supabase/client'
import {
  getMyMenuKeys,
  getMyModuleFlags,
} from '@/app/(dashboard)/menu-actions'

// ============================================================
// accessState - 1 lần gọi RPC get_my_access_state (047) trực tiếp
// từ trình duyệt tới Supabase lấy CẢ menu keys + module flags.
// Trước đây là 2 server action POST riêng (2 vòng qua Vercel
// serverless) -> giờ 1 round-trip thẳng tới database.
// Cache promise theo phiên trình duyệt (giống useMyRole).
// Fallback: nếu RPC chưa có (047 chưa chạy) -> gọi 2 action cũ.
// ============================================================

export type ClientAccessState = {
  /** null = không có ghi đè -> dùng ma trận mặc định */
  menuKeys: string[] | null
  /** Quyền kiêm nhiệm gán theo TỪNG user (049) - CỘNG THÊM vào quyền vai trò */
  menuGrants: string[]
  offModules: string[]
  offFeatures: string[]
}

const OPEN_STATE: ClientAccessState = {
  menuKeys: null,
  menuGrants: [],
  offModules: [],
  offFeatures: [],
}

let cachedStatePromise: Promise<ClientAccessState> | null = null

async function fetchState(): Promise<ClientAccessState> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_my_access_state')
  if (!error && data && typeof data === 'object') {
    const raw = data as {
      menu_keys?: unknown
      menu_grants?: unknown
      off_modules?: unknown
      off_features?: unknown
    }
    return {
      menuKeys: Array.isArray(raw.menu_keys)
        ? (raw.menu_keys as string[])
        : null,
      menuGrants: Array.isArray(raw.menu_grants)
        ? (raw.menu_grants as string[])
        : [],
      offModules: Array.isArray(raw.off_modules)
        ? (raw.off_modules as string[])
        : [],
      offFeatures: Array.isArray(raw.off_features)
        ? (raw.off_features as string[])
        : [],
    }
  }

  // RPC 047 chưa có -> đường cũ (2 server action song song)
  const [keys, flags] = await Promise.all([
    getMyMenuKeys().catch(() => null),
    getMyModuleFlags().catch(() => ({ modules: [], features: [] })),
  ])
  return {
    menuKeys: keys,
    menuGrants: [],
    offModules: flags.modules,
    offFeatures: flags.features,
  }
}

export function getClientAccessState(): Promise<ClientAccessState> {
  if (!cachedStatePromise) {
    cachedStatePromise = fetchState().catch(() => {
      cachedStatePromise = null
      return OPEN_STATE
    })
  }
  return cachedStatePromise
}
