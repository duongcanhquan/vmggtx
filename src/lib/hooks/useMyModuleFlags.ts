'use client'

import { useEffect, useState } from 'react'
import { getMyModuleFlags, type MyModuleFlags } from '@/app/(dashboard)/menu-actions'

// ============================================================
// useMyModuleFlags - module/feature bị Super Admin TẮT với user
// hiện tại (module_flags - 046). Cache promise theo phiên trình
// duyệt giống useMyRole/useMyMenuKeys.
// - undefined = đang tải (tạm coi như bật hết để tránh giật menu)
// ============================================================

let cachedFlagsPromise: Promise<MyModuleFlags> | null = null

function fetchFlags(): Promise<MyModuleFlags> {
  if (!cachedFlagsPromise) {
    cachedFlagsPromise = getMyModuleFlags().catch(() => {
      cachedFlagsPromise = null
      return { modules: [], features: [] }
    })
  }
  return cachedFlagsPromise
}

export function useMyModuleFlags(): MyModuleFlags | undefined {
  const [flags, setFlags] = useState<MyModuleFlags | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetchFlags().then((value) => {
      if (!cancelled) setFlags(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return flags
}
