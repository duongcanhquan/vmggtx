'use client'

import { useEffect, useState } from 'react'
import { getClientAccessState } from '@/lib/hooks/accessState'
import type { MenuKey } from '@/lib/auth/menuRegistry'

// ============================================================
// useMyMenuGrants - quyền KIÊM NHIỆM gán theo từng user (049).
// Là quyền BỔ SUNG: menu có key nằm trong grants luôn hiện ra,
// bất kể vai trò mặc định hay ma trận role có cho phép không.
// - undefined = đang tải (tạm coi như chưa có grant)
// ============================================================

export function useMyMenuGrants(): MenuKey[] | undefined {
  const [grants, setGrants] = useState<MenuKey[] | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void getClientAccessState().then((state) => {
      if (!cancelled) setGrants(state.menuGrants as MenuKey[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  return grants
}
