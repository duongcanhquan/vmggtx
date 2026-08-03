import type { Role } from '@/lib/auth/roles'

/**
 * D10 / D36 — Tách cổng đăng nhập & vận hành:
 * Super Admin CHỈ kiến trúc hệ thống (/admin/*), KHÔNG vào cổng vận hành trường.
 * Cơ sở / GV / HV / PH / B2B mỗi bên một cổng riêng.
 */

/** Prefix Super Admin được phép (kèm exact /admin). */
export const SUPER_ADMIN_ALLOWED_PREFIXES = [
  '/admin',
  '/login/admin',
  '/unauthorized',
  '/license-expired',
] as const

export function isSuperAdminAllowedPath(pathname: string): boolean {
  for (const prefix of SUPER_ADMIN_ALLOWED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true
  }
  return false
}

/** Role thuộc đội vận hành cơ sở (không phải super / HV / B2B / PH). */
export function isCampusOperatorRole(role: Role | null | undefined): boolean {
  return (
    role === 'campus_admin' ||
    role === 'academic_staff' ||
    role === 'admission_staff' ||
    role === 'accountant' ||
    role === 'teacher'
  )
}

export const SUPER_ADMIN_CAMPUS_BLOCK_MESSAGE =
  'Super Admin chỉ quản trị hệ thống tại /login/admin và /admin. Không vào cổng vận hành cơ sở.'

export const CAMPUS_LOGIN_ONLY_MESSAGE =
  'Cổng này chỉ dành cho nhân sự / giảng viên của cơ sở. Super Admin dùng /login/admin.'
