import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  getHomePathForRole,
  isRole,
  readClaimsFromAccessToken,
  type Role,
} from '@/lib/auth/roles'

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
    prefix: '/hr',
    allowedRoles: ['super_admin', 'campus_admin'],
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
]

/** Đường dẫn công khai — không bắt session */
const PUBLIC_EXACT = new Set([
  '/login',
  '/student/login',
  '/unauthorized',
  '/parent/login',
])
const PUBLIC_PREFIXES = ['/evaluations']

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

/** Khu vực Sổ Liên Lạc Phụ huynh (xác thực bằng cookie HMAC riêng) */
const PARENT_AREA_PREFIXES = ['/parent', '/dashboard']

function isParentArea(pathname: string): boolean {
  return PARENT_AREA_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

function loginPathFor(pathname: string): string {
  if (isParentArea(pathname)) return '/parent/login'
  return STUDENT_AREA_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
    ? '/student/login'
    : '/login'
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

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  return NextResponse.redirect(url)
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
      (pathname === '/login' || pathname === '/student/login' || pathname === '/')
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

  // ===== 2. / hoặc /login (login đã xử lý ở trên) — smart home =====
  if (pathname === '/' || pathname === '/login') {
    if (!session) {
      return redirectTo(request, '/login')
    }
    const role = await resolveRole()
    if (role) {
      return redirectTo(request, getHomePathForRole(role))
    }
    // Session hỏng → về /login; nhánh public ở trên sẽ dọn cookie.
    return redirectTo(request, '/login')
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
      return redirectTo(request, '/parent/login')
    }
    return redirectTo(request, loginPathFor(pathname))
  }

  // Đối tác doanh nghiệp chỉ được ở trong không gian /b2b
  const role = await resolveRole()
  if (role === 'enterprise_partner') {
    return redirectTo(request, '/b2b')
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
