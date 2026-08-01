'use client'

import { useEffect, useState } from 'react'
import { getClientAccessState } from '@/lib/hooks/accessState'
import type { MyModuleFlags } from '@/app/(dashboard)/menu-actions'

// ============================================================
// useMyModuleFlags - module/feature bị Super Admin TẮT với user
// hiện tại (module_flags - 046). Đọc từ accessState dùng chung
// (1 RPC gộp với menu keys).
// - undefined = đang tải (tạm coi như bật hết để tránh giật menu)
// ============================================================

export function useMyModuleFlags(): MyModuleFlags | undefined {
  const [flags, setFlags] = useState<MyModuleFlags | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void getClientAccessState().then((state) => {
      if (!cancelled)
        setFlags({ modules: state.offModules, features: state.offFeatures })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return flags
}
