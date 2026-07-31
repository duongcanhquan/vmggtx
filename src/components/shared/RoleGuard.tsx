'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  isRole,
  readClaimsFromAccessToken,
  type Role,
} from '@/lib/auth/roles'

// ============================================================
// RoleGuard - Ẩn/hiện UI theo Ma trận Phân quyền.
//
// <RoleGuard allowedRoles={['super_admin', 'campus_admin']}>
//   <button>Xóa lớp học</button>
// </RoleGuard>
//
// <RoleGuard allowedRoles={['campus_admin']} targetOrgId={cls.org_id}>
//   <button>Sửa lớp của chi nhánh này</button>
// </RoleGuard>
//
// LƯU Ý BẢO MẬT: đây chỉ là lớp che UI. Server Action tương ứng
// vẫn PHẢI gọi rpc is_authorized + dựa vào RLS để chặn thật sự.
// ============================================================

interface RoleGuardProps {
  /** Các role được phép nhìn thấy children */
  allowedRoles: Role[]
  /**
   * Tùy chọn: org đích của thao tác. Nếu truyền, user (trừ super_admin)
   * phải có org đích nằm trong nhánh tổ chức của mình
   * (check qua RPC is_org_in_my_subtree - migration 005).
   */
  targetOrgId?: string
  /** Hiển thị khi KHÔNG đủ quyền (mặc định: null - ẩn hoàn toàn) */
  fallback?: ReactNode
  children: ReactNode
}

// Cache role theo phiên trình duyệt: nhiều RoleGuard trên cùng một trang
// chỉ tốn đúng 1 lần xác định role.
let cachedRolePromise: Promise<Role | null> | null = null

async function resolveMyRole(): Promise<Role | null> {
  const supabase = createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return null

  // Nhanh: đọc từ JWT claims (custom_access_token_hook - migration 006)
  const fromClaims = readClaimsFromAccessToken(session.access_token).role
  if (fromClaims) return fromClaims

  // Fallback: hook chưa bật -> đọc từ profiles (RLS cho phép xem chính mình)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .is('deleted_at', null)
    .single()

  return isRole(profile?.role) ? profile.role : null
}

function getMyRole(): Promise<Role | null> {
  if (!cachedRolePromise) {
    cachedRolePromise = resolveMyRole().catch(() => {
      cachedRolePromise = null
      return null
    })
  }
  return cachedRolePromise
}

export function RoleGuard({
  allowedRoles,
  targetOrgId,
  fallback = null,
  children,
}: RoleGuardProps) {
  // null = đang kiểm tra -> không render gì để tránh "lóe" UI bị cấm
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const role = await getMyRole()

      if (!role || !allowedRoles.includes(role)) {
        if (!cancelled) setAllowed(false)
        return
      }

      // super_admin thao tác mọi org; role khác phải nằm trong subtree
      if (targetOrgId && role !== 'super_admin') {
        const supabase = createClient()
        const { data: inSubtree } = await supabase.rpc(
          'is_org_in_my_subtree',
          { p_target_org_id: targetOrgId }
        )
        if (!cancelled) setAllowed(inSubtree === true)
        return
      }

      if (!cancelled) setAllowed(true)
    }

    check()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedRoles.join(','), targetOrgId])

  if (allowed !== true) {
    return allowed === false ? <>{fallback}</> : null
  }

  return <>{children}</>
}
