// ============================================================
// GHI NHỚ CỔNG ĐĂNG NHẬP (login_portal cookie)
// Vấn đề: nhân sự/học viên đăng nhập qua cổng cơ sở /coso/[slug]/login
// nhưng khi ĐĂNG XUẤT hoặc HẾT PHIÊN lại bị đẩy về /login chung của
// hệ thống (cổng super admin) -> mất ngữ cảnh cơ sở.
// Giải pháp: sau khi đăng nhập THÀNH CÔNG, lưu cookie `login_portal`
// = đường dẫn cổng đã dùng. Đăng xuất / hết phiên -> quay đúng cổng đó.
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

/** Lưu cổng đăng nhập vừa dùng (gọi ngay sau khi login thành công) */
export function rememberLoginPortal(path: string): void {
  if (typeof document === 'undefined' || !isSafeLoginPath(path)) return
  document.cookie = `${LOGIN_PORTAL_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=15552000; samesite=lax`
}

/** Đọc cổng đăng nhập đã lưu (null nếu chưa có / không hợp lệ) */
export function readLoginPortal(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOGIN_PORTAL_COOKIE}=([^;]+)`)
  )
  if (!match) return null
  try {
    const value = decodeURIComponent(match[1])
    return isSafeLoginPath(value) ? value : null
  } catch {
    return null
  }
}
