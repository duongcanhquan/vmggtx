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
const PUBLIC_EXACT = new Set(['/login', '/unauthorized', '/parent/login'])
const PUBLIC_PREFIXES = ['/evaluations']

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

  // ---- Trích xuất role (JWT claims → fallback profiles) ----
  async function resolveRole(): Promise<Role | null> {
    if (!session) return null
    let role: Role | null = readClaimsFromAccessToken(session.access_token).role
    if (!role) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .is('deleted_at', null)
        .maybeSingle()
      role = isRole(profile?.role) ? profile.role : null
    }
    return role
  }

  // ===== 1. Public paths =====
  if (isPublicPath(pathname)) {
    // Đã đăng nhập mà vào /login → đẩy về portal đúng role
    if (session && (pathname === '/login' || pathname === '/')) {
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
      return redirectTo(request, '/login')
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
  // /finance, /portal, /dashboard parent…). Chưa login → /login.
  if (!session) {
    return redirectTo(request, '/login')
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
