import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  getHomePathForRole,
  isRole,
  readClaimsFromAccessToken,
  type Role,
} from '@/lib/auth/roles'
import { menuKeyForPath } from '@/lib/auth/menuRegistry'

// ============================================================
// SMART AUTH ROUTING + Matrix RBAC
//
// 1. Chưa đăng nhập vào khu vực bảo vệ → /login
// 2. Đã đăng nhập vào / hoặc /login → redirect theo role
// 3. Sai role trên route bảo vệ → /unauthorized (hoặc home portal)
//
// Prefix cụ thể hơn đặt TRƯỚC (find trả về rule đầu tiên khớp).
// Route group (dashboard)/(portals) KHÔNG xuất hiện trong URL.
// ============================================================

const ROUTE_RULES: { prefix: string; allowedRoles: Role[] }[] = [
  // --- Super-admin only ---
  {
    prefix: '/admin/settings',
    allowedRoles: ['super_admin'],
  },
  {
    // Tầng License - bán account cơ sở (044)
    prefix: '/admin/licenses',
    allowedRoles: ['super_admin'],
  },
  {
    prefix: '/dashboard/admin',
    allowedRoles: ['super_admin'],
  },
  {
    prefix: '/dashboard/super-admin',
    allowedRoles: ['super_admin'],
  },
  {
    prefix: '/super-admin',
    allowedRoles: ['super_admin'],
  },

  // --- Portal homes (Smart Auth) ---
  {
    // Cổng dịch vụ E-Ticketing (032): giáo vụ cũng được duyệt đơn
    prefix: '/admin/requests',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff'],
  },
  {
    prefix: '/admin',
    allowedRoles: ['super_admin', 'campus_admin'],
  },
  {
    prefix: '/staff',
    allowedRoles: [
      'super_admin',
      'campus_admin',
      'academic_staff',
      'admission_staff',
      'accountant',
    ],
  },
  {
    prefix: '/teacher',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'teacher'],
  },
  {
    prefix: '/student',
    allowedRoles: ['super_admin', 'campus_admin', 'student'],
  },
  {
    // B2B Portal - doanh nghiệp liên kết quản lý thực tập sinh (037)
    prefix: '/b2b',
    allowedRoles: ['super_admin', 'enterprise_partner'],
  },

  // --- Module routes (giữ luật cũ) ---
  {
    prefix: '/dashboard/campus-admin',
    allowedRoles: ['super_admin', 'campus_admin'],
  },
  {
    prefix: '/campus-admin',
    allowedRoles: ['super_admin', 'campus_admin'],
  },
  {
    // Sổ tài sản & khấu hao (041) - nhân sự quản lý/kế toán
    prefix: '/assets',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'accountant'],
  },
  {
    prefix: '/dashboard/hr',
    allowedRoles: ['super_admin', 'campus_admin'],
  },
  {
    // Lương & Hợp đồng (gộp tab với /finance/payroll) - kế toán được xem
    prefix: '/hr',
    allowedRoles: ['super_admin', 'campus_admin', 'accountant'],
  },
  {
    prefix: '/dashboard/academic',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff'],
  },
  {
    prefix: '/academic',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff'],
  },
  {
    prefix: '/dashboard/crm',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'admission_staff'],
  },
  {
    prefix: '/crm',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'admission_staff'],
  },
  {
    prefix: '/dashboard/settings',
    allowedRoles: ['super_admin', 'campus_admin'],
  },
  {
    prefix: '/settings',
    allowedRoles: ['super_admin', 'campus_admin'],
  },
  {
    prefix: '/dashboard/ai',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'teacher'],
  },
  {
    prefix: '/ai',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'teacher'],
  },

  // --- Ma trận phân quyền theo nhóm menu (đồng bộ DashboardShell) ---
  {
    // Kỳ tính lương: chỉ quản lý + kế toán (đặt TRƯỚC /finance chung)
    prefix: '/finance/payroll',
    allowedRoles: ['super_admin', 'campus_admin', 'accountant'],
  },
  {
    // Học phí & Công nợ: giáo vụ được thao tác thu/nhắc phí
    prefix: '/finance',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff', 'accountant'],
  },
  {
    // Hồ sơ học sinh: mọi nhân sự văn phòng (Staff Portal cũng link tới)
    prefix: '/students',
    allowedRoles: [
      'super_admin',
      'campus_admin',
      'academic_staff',
      'admission_staff',
      'accountant',
    ],
  },
  {
    // Điểm danh: nhân sự văn phòng + giáo viên (điểm danh lớp mình)
    prefix: '/attendance',
    allowedRoles: [
      'super_admin',
      'campus_admin',
      'academic_staff',
      'admission_staff',
      'accountant',
      'teacher',
    ],
  },
  {
    // Quản lý lớp học. LƯU Ý: /classes/[id]/tutor (Gia sư AI) được cả
    // giáo viên VÀ học viên dùng (link từ trang /learn) -> phải có student.
    prefix: '/classes',
    allowedRoles: [
      'super_admin',
      'campus_admin',
      'academic_staff',
      'teacher',
      'student',
    ],
  },
  {
    // Thông báo toàn cơ sở
    prefix: '/announcements',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff'],
  },
]

/** Đường dẫn công khai — không bắt session */
const PUBLIC_EXACT = new Set([
  '/login',
  '/student/login',
  '/unauthorized',
  '/parent/login',
  '/license-expired',
])
/** /coso/[slug] landing + login 3 cổng theo cơ sở (path-based tenant) */
const PUBLIC_PREFIXES = ['/evaluations', '/hdsd', '/coso']

/**
 * TÁCH CỔNG ĐĂNG NHẬP (mỗi cổng sẵn sàng chạy tên miền riêng):
 * khu vực học viên → /student/login; còn lại → /login (quản lý).
 * (Phụ huynh dùng cookie HMAC riêng, các trang parent tự xử lý.)
 */
const STUDENT_AREA_PREFIXES = [
  '/student',
  '/portal',
  '/learn',
  '/grades',
  '/schedule',
  '/tuition',
  '/assistant',
]

/** Khu vực Sổ Liên Lạc Phụ huynh (xác thực bằng cookie HMAC riêng).
 *  Chỉ exact `/dashboard` (trang chủ phụ huynh) — KHÔNG nuốt `/dashboard/hr`… */
function isParentArea(pathname: string): boolean {
  return matchesPrefix(pathname, '/parent') || pathname === '/dashboard'
}

/** Trích slug từ /coso/{slug}/... — null nếu không phải cổng cơ sở */
function campusSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/coso\/([a-z0-9][a-z0-9-]{0,46}[a-z0-9]|[a-z0-9])(?:\/|$)/)
  return m?.[1] ?? null
}

function loginPathFor(pathname: string): string {
  const slug = campusSlugFromPath(pathname)
  if (slug) {
    if (matchesPrefix(pathname, `/coso/${slug}/parent`)) {
      return `/coso/${slug}/parent/login`
    }
    if (matchesPrefix(pathname, `/coso/${slug}/student`)) {
      return `/coso/${slug}/student/login`
    }
    return `/coso/${slug}/login`
  }
  if (isParentArea(pathname)) return '/parent/login'
  return STUDENT_AREA_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
    ? '/student/login'
    : '/login'
}

function isCampusLoginPath(pathname: string): boolean {
  return (
    /^\/coso\/[^/]+\/login\/?$/.test(pathname) ||
    /^\/coso\/[^/]+\/student\/login\/?$/.test(pathname) ||
    /^\/coso\/[^/]+\/parent\/login\/?$/.test(pathname)
  )
}

/**
 * So khớp prefix THEO SEGMENT: '/student' khớp '/student' và '/student/...'
 * nhưng KHÔNG khớp '/students' (trang quản lý học viên của Staff).
 */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

function redirectTo(
  request: NextRequest,
  pathname: string,
  /** Mang theo cookie đã set trên response hiện tại (role_hint/license_hint…) */
  carry?: NextResponse
) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const redirect = NextResponse.redirect(url)
  if (carry) {
    for (const cookie of carry.cookies.getAll()) {
      redirect.cookies.set(cookie.name, cookie.value)
    }
  }
  return redirect
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static / API AI chat không đi qua matcher này (xem config)

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Hỗ trợ cả hệ key cũ (anon) lẫn mới (publishable)
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // ---- Trích xuất role (JWT claims → cookie hint → fallback profiles) ----
  // TỐI ƯU TỐC ĐỘ: nếu JWT chưa gắn custom claims (hook chưa bật), tránh
  // query DB trên MỖI lần chuyển trang bằng cookie `role_hint` (TTL 10 phút,
  // gắn theo user id). Cookie chỉ dùng cho ĐIỀU HƯỚNG — mọi thao tác dữ liệu
  // vẫn bị RLS + kiểm tra role server-side chặn (cùng mức tin cậy với việc
  // decode JWT không verify chữ ký phía trên).
  const ROLE_HINT_COOKIE = 'role_hint'

  async function resolveRole(): Promise<Role | null> {
    if (!session) return null
    let role: Role | null = readClaimsFromAccessToken(session.access_token).role
    if (role) return role

    // Cache hint: "userId:role"
    const hint = request.cookies.get(ROLE_HINT_COOKIE)?.value
    if (hint) {
      const [hintUserId, hintRole] = hint.split(':')
      if (hintUserId === session.user.id && isRole(hintRole)) {
        return hintRole
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    role = isRole(profile?.role) ? profile.role : null

    if (role) {
      response.cookies.set(ROLE_HINT_COOKIE, `${session.user.id}:${role}`, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      })
    }
    return role
  }

  // ===== 1. Public paths =====
  if (isPublicPath(pathname)) {
    // Đã đăng nhập mà vào trang login → đẩy về portal đúng role
    if (
      session &&
      (pathname === '/login' ||
        pathname === '/student/login' ||
        pathname === '/' ||
        isCampusLoginPath(pathname))
    ) {
      const role = await resolveRole()
      if (role) {
        return redirectTo(request, getHomePathForRole(role))
      }
      // Session "mồ côi" (user đã bị xóa / không có profile):
      // KHÔNG redirect (tránh ERR_TOO_MANY_REDIRECTS) — xóa cookie
      // phiên hỏng rồi cho ở lại trang login.
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        /* refresh token đã chết — bỏ qua */
      }
      return response
    }
    return response
  }

  // ===== 2. Trang Tổng quan "/" — KHÔNG redirect (trước đây đá sang /admin|/staff
  // khiến DashboardShell "Tổng quan" và báo cáo biểu đồ thành trang mồ côi).
  // Teacher/student/B2B vẫn về portal riêng; manager & staff ở lại xem overview.
  if (pathname === '/') {
    if (!session) return redirectTo(request, '/login')
    const role = await resolveRole()
    if (!role) return redirectTo(request, '/login')
    if (
      role === 'teacher' ||
      role === 'student' ||
      role === 'enterprise_partner'
    ) {
      return redirectTo(request, getHomePathForRole(role))
    }
    // license + menu matrix được kiểm ở cuối hàm (cùng flow catch-all)
  }

  // ---- MA TRẬN PHÂN QUYỀN ĐỘNG (menu_permissions - migration 043) ----
  // LUÔN gọi RPC (không cache "được phép" bằng cookie — cookie Client có thể
  // giả mạo qua header Cookie). FAIL-OPEN khi RPC lỗi / migration chưa chạy.
  async function enforceMenuMatrix(role: Role): Promise<boolean> {
    if (
      role === 'super_admin' ||
      role === 'student' ||
      role === 'enterprise_partner'
    ) {
      return true
    }
    const menuKey = menuKeyForPath(pathname)
    if (!menuKey) return true
    try {
      const { data, error } = await supabase.rpc('get_my_menu_keys')
      if (error) return true
      // null = không có ghi đè -> ma trận mặc định (ROUTE_RULES + leaf.roles chặn nền)
      if (!Array.isArray(data)) return true
      return data.includes(menuKey)
    } catch {
      return true
    }
  }

  // ---- TẦNG LICENSE (tenant_licenses - migration 044) ----
  // Chỉ cache verdict "blocked" (forge blocked chỉ tự hại). Verdict "ok"
  // LUÔN verify lại bằng RPC — chống giả mạo cookie license_hint=ok.
  const LICENSE_HINT_COOKIE = 'license_hint'

  async function enforceLicense(role: Role): Promise<boolean> {
    if (role === 'super_admin' || !session) return true

    const hint = request.cookies.get(LICENSE_HINT_COOKIE)?.value
    if (hint) {
      const [hintUserId, verdict] = hint.split(':')
      if (hintUserId === session.user.id && verdict === 'blocked') return false
    }

    let allowed = true
    try {
      const { data, error } = await supabase.rpc('get_my_license')
      if (!error && data && typeof data === 'object') {
        const license = data as { status?: string; valid_until?: string | null }
        if (license.status === 'suspended') allowed = false
        if (allowed && license.valid_until) {
          const today = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
          })
          if (license.valid_until < today) allowed = false
        }
      }
    } catch {
      /* fail-open */
    }

    if (!allowed) {
      response.cookies.set(LICENSE_HINT_COOKIE, `${session.user.id}:blocked`, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      })
    }
    return allowed
  }

  // ===== 3. Khu vực có ROUTE_RULES =====
  const rule = ROUTE_RULES.find((r) => matchesPrefix(pathname, r.prefix))
  if (rule) {
    if (!session) {
      return redirectTo(request, loginPathFor(pathname))
    }
    const role = await resolveRole()
    if (!role || !rule.allowedRoles.includes(role)) {
      // Sai role: về /unauthorized (và vẫn có thể tự về home từ trang đó)
      return redirectTo(request, '/unauthorized')
    }
    if (!(await enforceLicense(role))) {
      return redirectTo(request, '/license-expired', response)
    }
    if (!(await enforceMenuMatrix(role))) {
      return redirectTo(request, '/unauthorized', response)
    }
    return response
  }

  // ===== 4. Các trang app còn lại (dashboard modules…) — chỉ cần session =====
  // Không trong PUBLIC và không khớp rule cụ thể (vd: /classes, /students,
  // /finance, /portal, /dashboard parent…). Chưa login → đúng cổng khu vực.
  if (!session) {
    // Phụ huynh KHÔNG có session Supabase - xác thực bằng cookie HMAC
    // `parent_session` (server component tự verify chữ ký). Có cookie
    // -> cho qua; không có -> về cổng đăng nhập phụ huynh.
    if (isParentArea(pathname)) {
      if (request.cookies.get('parent_session')?.value) {
        return response
      }
      return redirectTo(request, '/parent/login', response)
    }
    return redirectTo(request, loginPathFor(pathname), response)
  }

  // Đối tác doanh nghiệp chỉ được ở trong không gian /b2b
  const role = await resolveRole()
  if (role === 'enterprise_partner') {
    return redirectTo(request, '/b2b', response)
  }
  if (role && !(await enforceLicense(role))) {
    return redirectTo(request, '/license-expired', response)
  }
  if (role && !(await enforceMenuMatrix(role))) {
    return redirectTo(request, '/unauthorized', response)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Chạy trên mọi route app trừ:
     * - _next/static, _next/image, favicon, file tĩnh
     * - /api/* (API tự check session riêng)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
