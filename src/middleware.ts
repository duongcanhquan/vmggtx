import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  getHomePathForRole,
  isRole,
  readClaimsFromAccessToken,
  type Role,
} from '@/lib/auth/roles'
import { menuKeyForPath } from '@/lib/auth/menuRegistry'
import { FEATURE_ROUTES } from '@/lib/licensing/moduleCatalog'

// ============================================================
// CACHE TRẠNG THÁI TRUY CẬP (license + menu + module flags)
// - 1 RPC get_my_access_state (047) thay cho 3 RPC tuần tự cũ.
// - Cache trong BỘ NHỚ server (per isolate) TTL 60s: các cú click
//   liên tiếp không tốn round-trip database nào -> điều hướng tức thì.
// - Server-side nên client không thể giả mạo; thu hồi quyền/license
//   có hiệu lực trong tối đa 60 giây.
// ============================================================

type AccessState = {
  licenseOk: boolean
  /** null = không có ghi đè -> dùng ma trận mặc định */
  menuKeys: string[] | null
  /** Quyền kiêm nhiệm gán theo TỪNG user (049) - bổ sung vào quyền role */
  menuGrants: string[]
  offModules: string[]
  offFeatures: string[]
}

const ACCESS_STATE_OK: AccessState = {
  licenseOk: true,
  menuKeys: null,
  menuGrants: [],
  offModules: [],
  offFeatures: [],
}

const ACCESS_CACHE = new Map<string, { state: AccessState; expires: number }>()
const ACCESS_TTL_MS = 60_000
const ACCESS_CACHE_MAX = 500

type SupabaseRpcClient = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>
}

async function getAccessState(
  supabase: SupabaseRpcClient,
  userId: string
): Promise<AccessState> {
  const cached = ACCESS_CACHE.get(userId)
  if (cached && cached.expires > Date.now()) return cached.state

  let state = ACCESS_STATE_OK
  try {
    const { data, error } = await supabase.rpc('get_my_access_state')
    if (!error && data && typeof data === 'object') {
      const raw = data as {
        license_ok?: unknown
        menu_keys?: unknown
        menu_grants?: unknown
        off_modules?: unknown
        off_features?: unknown
      }
      state = {
        licenseOk: raw.license_ok !== false,
        menuKeys: Array.isArray(raw.menu_keys)
          ? (raw.menu_keys as string[])
          : null,
        menuGrants: Array.isArray(raw.menu_grants)
          ? (raw.menu_grants as string[])
          : [],
        offModules: Array.isArray(raw.off_modules)
          ? (raw.off_modules as string[])
          : [],
        offFeatures: Array.isArray(raw.off_features)
          ? (raw.off_features as string[])
          : [],
      }
    } else if (error) {
      // 047 chưa chạy -> fallback giữ enforcement license cũ (1 RPC),
      // menu/module fail-open như trước.
      state = { ...ACCESS_STATE_OK, licenseOk: await checkLicenseOnly(supabase) }
    }
  } catch {
    /* fail-open */
  }

  if (ACCESS_CACHE.size >= ACCESS_CACHE_MAX) ACCESS_CACHE.clear()
  ACCESS_CACHE.set(userId, { state, expires: Date.now() + ACCESS_TTL_MS })
  return state
}

async function checkLicenseOnly(supabase: SupabaseRpcClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('get_my_license')
    if (error || !data || typeof data !== 'object') return true
    const license = data as { status?: string; valid_until?: string | null }
    if (license.status === 'suspended') return false
    if (license.valid_until) {
      const today = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
      })
      if (license.valid_until < today) return false
    }
    return true
  } catch {
    return true
  }
}

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
    // Trung tâm Module - theo dõi + bật/tắt module/feature (046)
    prefix: '/admin/modules',
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
    // Danh bạ giảng viên + gán lớp (admin-side). LƯU Ý: khớp theo
    // segment nên KHÔNG đụng /teacher (portal của giáo viên).
    prefix: '/teachers',
    allowedRoles: ['super_admin', 'campus_admin', 'academic_staff'],
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
    // 1 cổng login duy nhất/cơ sở — tab Gia đình cho khu vực HV/PH
    if (matchesPrefix(pathname, `/coso/${slug}/parent`)) {
      return `/coso/${slug}/login?tab=family&who=parent`
    }
    if (matchesPrefix(pathname, `/coso/${slug}/student`)) {
      return `/coso/${slug}/login?tab=family`
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

  // ============================================================
  // [TÊN MIỀN KHÁCH HÀNG] khachhang.abzxyz.com -> /coso/khachhang
  // Bật bằng env NEXT_PUBLIC_ROOT_DOMAIN=abzxyz.com (chưa đặt = tắt).
  // Chỉ rewrite TRANG GỐC '/' của subdomain về landing của Đơn vị đó;
  // các đường dẫn khác (login, dashboard…) hoạt động bình thường trên
  // chính subdomain vì cookie phiên gắn theo host.
  // ============================================================
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (rootDomain && pathname === '/') {
    const host = (request.headers.get('host') ?? '').split(':')[0]
    if (host.endsWith(`.${rootDomain}`)) {
      const sub = host.slice(0, -(rootDomain.length + 1))
      if (sub && sub !== 'www' && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) {
        const url = request.nextUrl.clone()
        url.pathname = `/coso/${sub}`
        return NextResponse.rewrite(url)
      }
    }
  }

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
      role === 'super_admin' ||
      role === 'teacher' ||
      role === 'student' ||
      role === 'enterprise_partner'
    ) {
      // super_admin: chỉ quản lý cơ sở + license, không xem overview vận hành
      return redirectTo(request, getHomePathForRole(role))
    }
    // license + menu matrix được kiểm ở cuối hàm (cùng flow catch-all)
  }

  // ---- KIỂM TRA TRUY CẬP GỘP: license (044) + ma trận menu (043) +
  // công tắc module (046) trong 1 RPC get_my_access_state (047).
  // Trước đây 3 RPC TUẦN TỰ mỗi lần chuyển trang -> chậm rõ rệt.
  // Thêm cache BỘ NHỚ theo user (TTL 60s, per isolate) -> đa số cú
  // click KHÔNG tốn round-trip database nào. Cache nằm server-side,
  // client không giả mạo được; đổi quyền/license có hiệu lực <=60s.
  async function enforceAccess(role: Role): Promise<'ok' | 'license' | 'denied'> {
    if (role === 'super_admin' || !session) return 'ok'

    // campus_admin = TOÀN QUYỀN trong subtree: bỏ qua ma trận menu
    // (ma trận chỉ ràng buộc role cấp dưới). Tránh việc bản ghi override
    // cũ trong DB che mất menu MỚI thêm khỏi chính Quản lý cơ sở.
    const skipMenuMatrix =
      role === 'campus_admin' ||
      role === 'student' ||
      role === 'enterprise_partner'
    const menuKey = menuKeyForPath(pathname)
    const featureRoute = FEATURE_ROUTES.find((f) =>
      matchesPrefix(pathname, f.routePrefix)
    )

    const state = await getAccessState(supabase, session.user.id)

    if (!state.licenseOk) return 'license'
    if (
      !skipMenuMatrix &&
      menuKey &&
      state.menuKeys !== null &&
      !state.menuKeys.includes(menuKey) &&
      // Quyền kiêm nhiệm theo user (049) CỘNG THÊM vào ma trận role
      !state.menuGrants.includes(menuKey)
    ) {
      return 'denied'
    }
    if (menuKey && state.offModules.includes(menuKey)) return 'denied'
    if (featureRoute && state.offFeatures.includes(featureRoute.flag)) {
      return 'denied'
    }
    return 'ok'
  }

  // ===== 3. Khu vực có ROUTE_RULES =====
  const rule = ROUTE_RULES.find((r) => matchesPrefix(pathname, r.prefix))
  if (rule) {
    if (!session) {
      return redirectTo(request, loginPathFor(pathname))
    }
    const role = await resolveRole()
    if (!role) {
      return redirectTo(request, '/unauthorized')
    }
    if (!rule.allowedRoles.includes(role)) {
      // KIÊM NHIỆM (049): role tĩnh không cho phép, nhưng nếu user được
      // GÁN RIÊNG hạng mục menu của trang này thì vẫn cho vào.
      const menuKey = menuKeyForPath(pathname)
      const state = await getAccessState(supabase, session.user.id)
      if (!menuKey || !state.menuGrants.includes(menuKey)) {
        return redirectTo(request, '/unauthorized')
      }
    }
    const access = await enforceAccess(role)
    if (access === 'license') {
      return redirectTo(request, '/license-expired', response)
    }
    if (access === 'denied') {
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
  if (role) {
    const access = await enforceAccess(role)
    if (access === 'license') {
      return redirectTo(request, '/license-expired', response)
    }
    if (access === 'denied') {
      return redirectTo(request, '/unauthorized', response)
    }
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
