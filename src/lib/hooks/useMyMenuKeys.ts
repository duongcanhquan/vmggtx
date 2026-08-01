'use client'

import { useEffect, useState } from 'react'
import { getMyMenuKeys } from '@/app/(dashboard)/menu-actions'
import type { MenuKey } from '@/lib/auth/menuRegistry'

// ============================================================
// useMyMenuKeys - bộ menu key được cấp cho user hiện tại.
// Cache promise theo phiên trình duyệt (giống useMyRole).
// - undefined = đang tải
// - null      = không có ghi đè -> dùng ma trận mặc định
// - MenuKey[] = chỉ được thấy các key này
// ============================================================

let cachedKeysPromise: Promise<MenuKey[] | null> | null = null

function fetchKeys(): Promise<MenuKey[] | null> {
  if (!cachedKeysPromise) {
    cachedKeysPromise = getMyMenuKeys().catch(() => {
      cachedKeysPromise = null
      return null
    })
  }
  return cachedKeysPromise
}

export function useMyMenuKeys(): MenuKey[] | null | undefined {
  const [keys, setKeys] = useState<MenuKey[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetchKeys().then((value) => {
      if (!cancelled) setKeys(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return keys
}
