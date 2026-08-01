'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isRole, readClaimsFromAccessToken, type Role } from '@/lib/auth/roles'

// ============================================================
// useMyRole - xác định role của user hiện tại phía CLIENT.
// - Đọc nhanh từ JWT claims (custom_access_token_hook); fallback
//   query profiles (RLS cho phép xem chính mình).
// - Cache promise theo phiên trình duyệt: mọi component dùng chung
//   đúng 1 lần xác định role (RoleGuard, Sidebar menu...).
// LƯU Ý BẢO MẬT: chỉ dùng để ẨN/HIỆN UI. Middleware + Server
// Action + RLS mới là lớp chặn thật sự.
// ============================================================

let cachedRolePromise: Promise<Role | null> | null = null

async function resolveMyRole(): Promise<Role | null> {
  const supabase = createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return null

  const fromClaims = readClaimsFromAccessToken(session.access_token).role
  if (fromClaims) return fromClaims

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .is('deleted_at', null)
    .single()

  return isRole(profile?.role) ? profile.role : null
}

/** Promise role đã cache - dùng ngoài React (RoleGuard, handler...) */
export function getMyRole(): Promise<Role | null> {
  if (!cachedRolePromise) {
    cachedRolePromise = resolveMyRole().catch(() => {
      cachedRolePromise = null
      return null
    })
  }
  return cachedRolePromise
}

/**
 * Hook role hiện tại.
 * - `undefined` = đang xác định (chưa biết)
 * - `null` = chưa đăng nhập / không có role
 */
export function useMyRole(): Role | null | undefined {
  const [role, setRole] = useState<Role | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void getMyRole().then((value) => {
      if (!cancelled) setRole(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return role
}
