'use client'

import { useEffect, useState } from 'react'
import { getClientAccessState } from '@/lib/hooks/accessState'
import type { MenuKey } from '@/lib/auth/menuRegistry'

// ============================================================
// useMyMenuKeys - bộ menu key được cấp cho user hiện tại.
// Đọc từ accessState dùng chung (1 RPC gộp với module flags).
// - undefined = đang tải
// - null      = không có ghi đè -> dùng ma trận mặc định
// - MenuKey[] = chỉ được thấy các key này
// ============================================================

export function useMyMenuKeys(): MenuKey[] | null | undefined {
  const [keys, setKeys] = useState<MenuKey[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void getClientAccessState().then((state) => {
      if (!cancelled) setKeys(state.menuKeys as MenuKey[] | null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return keys
}
