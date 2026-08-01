// Bộ role của Ma trận Phân quyền (Matrix RBAC) - khớp migration 005.
// Dùng chung cho middleware, RoleGuard và Server Actions.
//
// Lưu ý: 'accountant' chưa có trong CHECK constraint DB — middleware
// map tạm sang portal /staff khi JWT/profile trả về chuỗi này (chuẩn
// bị cho migration HR sau).

export type Role =
  | 'super_admin'
  | 'campus_admin'
  | 'academic_staff'
  | 'admission_staff'
  | 'accountant'
  | 'teacher'
  | 'student'
  | 'enterprise_partner'

export const ALL_ROLES: Role[] = [
  'super_admin',
  'campus_admin',
  'academic_staff',
  'admission_staff',
  'accountant',
  'teacher',
  'student',
  'enterprise_partner',
]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value)
}

/**
 * Trang chủ mặc định theo role (Smart Auth Routing).
 * - super_admin / campus_admin → /admin
 * - academic_staff / accountant / admission_staff → /staff
 * - teacher → /teacher
 * - student → /student
 */
export function getHomePathForRole(role: Role | null | undefined): string {
  switch (role) {
    case 'super_admin':
    case 'campus_admin':
      return '/admin'
    case 'academic_staff':
    case 'admission_staff':
    case 'accountant':
      return '/staff'
    case 'teacher':
      return '/teacher'
    case 'student':
      return '/student'
    case 'enterprise_partner':
      return '/b2b'
    default:
      return '/login'
  }
}

/**
 * Đọc custom claims (user_role, user_org_id) từ access token của Supabase.
 * Claims được gắn bởi custom_access_token_hook (migration 006) — giúp
 * middleware biết role mà KHÔNG cần query DB. Trả về null nếu hook chưa bật.
 *
 * Chỉ decode payload (không verify chữ ký) — đủ an toàn cho việc ĐIỀU HƯỚNG
 * ở middleware vì token đã được Supabase xác thực; mọi thao tác dữ liệu
 * vẫn bị RLS + is_authorized chặn ở tầng DB.
 */
export function readClaimsFromAccessToken(accessToken: string): {
  role: Role | null
  orgId: string | null
} {
  try {
    const payloadPart = accessToken.split('.')[1]
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as Record<string, unknown>
    return {
      role: isRole(payload.user_role) ? payload.user_role : null,
      orgId: typeof payload.user_org_id === 'string' ? payload.user_org_id : null,
    }
  } catch {
    return { role: null, orgId: null }
  }
}
