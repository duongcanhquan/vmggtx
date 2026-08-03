// ============================================================
// GHI NHỚ CỔNG ĐĂNG NHẬP (login_portal cookie)
// Nhân sự/HV đăng nhập qua /{slug}/login — khi ĐĂNG XUẤT hoặc HẾT PHIÊN
// phải quay về ĐÚNG cổng login cơ sở đó (không về landing /login).
// Cookie sống 180 ngày, chỉ dùng để ĐIỀU HƯỚNG (không mang quyền).
// ============================================================

export const LOGIN_PORTAL_COOKIE = 'login_portal'

/** Chỉ chấp nhận đường dẫn nội bộ (chống open-redirect qua cookie) */
export function isSafeLoginPath(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    value.length < 200
  )
}

/**
 * Chuẩn hóa cổng login:
 * - /coso/{slug}/login… → /{slug}/login… (tương thích cookie cũ)
 * - /{slug}/login… giữ nguyên
 * - /login/admin | /student/login | /parent/login giữ nguyên
 */
export function normalizeLoginPortal(path: string): string | null {
  if (!isSafeLoginPath(path)) return null

  const [pathname, query = ''] = path.split('?')
  const q = query ? `?${query}` : ''

  const legacy = pathname.match(
    /^\/coso\/([a-z0-9][a-z0-9-]{0,46}[a-z0-9]|[a-z0-9])(?:\/(login|student\/login|parent\/login))?\/?$/
  )
  if (legacy) {
    const slug = legacy[1]
    const rest = legacy[2]
    if (!rest || rest === 'login') return `/${slug}/login${q}`
    if (rest === 'student/login') return `/${slug}/login?tab=family`
    if (rest === 'parent/login') return `/${slug}/login?tab=family&who=parent`
  }

  if (
    /^\/[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?\/login\/?$/.test(pathname) ||
    pathname === '/login/admin' ||
    pathname === '/student/login' ||
    pathname === '/parent/login'
  ) {
    return `${pathname.replace(/\/$/, '')}${q}`
  }

  return null
}

/** Lưu cổng đăng nhập vừa dùng (gọi ngay sau khi login thành công) */
export function rememberLoginPortal(path: string): void {
  if (typeof document === 'undefined') return
  const normalized = normalizeLoginPortal(path)
  if (!normalized) return
  document.cookie = `${LOGIN_PORTAL_COOKIE}=${encodeURIComponent(normalized)}; path=/; max-age=15552000; samesite=lax`
}

/** Đọc cổng đăng nhập đã lưu (null nếu chưa có / không hợp lệ) */
export function readLoginPortal(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOGIN_PORTAL_COOKIE}=([^;]+)`)
  )
  if (!match) return null
  try {
    return normalizeLoginPortal(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}
