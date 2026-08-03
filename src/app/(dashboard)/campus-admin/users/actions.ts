'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  zodFail,
} from '@/lib/validation/schemas'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import {
  defaultKeysForRole,
  isMenuKey,
  type MenuKey,
} from '@/lib/auth/menuRegistry'
import type { Role } from '@/lib/auth/roles'

// ============================================================
// Module Quản lý Nhân sự (Campus Admin)
// - Đọc danh sách: dùng SSR client -> RLS (migration 005) tự cắt
//   dữ liệu theo subtree của user đang đăng nhập.
// - Tạo tài khoản: dùng Admin client (Service Role) NHƯNG bắt buộc
//   qua cửa kiểm tra rpc is_authorized trước (chống hack org_id).
// ============================================================

/** Các role Campus Admin được phép gán. TUYỆT ĐỐI không có super_admin / student. */
export type AssignableRole =
  | 'campus_admin'
  | 'academic_staff'
  | 'admission_staff'
  | 'accountant'
  | 'teacher'

// Danh sách role được phép gán nay nằm trong createUserSchema (zod enum)
// tại src/lib/validation/schemas.ts - enum KHÔNG chứa super_admin.

export type ManagedOrg = {
  id: string
  name: string
  type: string
}

export type StaffRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  org_id: string | null
  org_name: string
  created_at: string
  job_title_id: string | null
  job_title_name: string | null
  can_view_financials: boolean
}

export type UsersActionResult = { error: string } | { error?: undefined }

// ---------- MOCK cho chế độ demo (chưa đăng nhập / DB trống) ----------
const MOCK_MANAGED_ORGS: ManagedOrg[] = [
  { id: 'org-cs-hn1', name: 'Cơ sở Hà Nội 1', type: 'campus' },
  { id: 'org-cn-caugiay', name: 'Chi nhánh Cầu Giấy', type: 'branch' },
  { id: 'org-cn-dongda', name: 'Chi nhánh Đống Đa', type: 'branch' },
]

const MOCK_USERS: StaffRow[] = [
  {
    id: 'mock-u1',
    full_name: 'Trần Thị Hồng Nhung',
    email: 'nhung.tran@gdtx.edu.vn',
    phone: '0912000001',
    role: 'academic_staff',
    org_id: 'org-cs-hn1',
    org_name: 'Cơ sở Hà Nội 1',
    created_at: '2026-05-12T08:00:00Z',
    job_title_id: null,
    job_title_name: null,
    can_view_financials: false,
  },
  {
    id: 'mock-u2',
    full_name: 'Phạm Quang Huy',
    email: 'huy.pham@gdtx.edu.vn',
    phone: '0912000002',
    role: 'teacher',
    org_id: 'org-cn-caugiay',
    org_name: 'Chi nhánh Cầu Giấy',
    created_at: '2026-06-02T08:00:00Z',
    job_title_id: null,
    job_title_name: null,
    can_view_financials: false,
  },
  {
    id: 'mock-u3',
    full_name: 'Lê Minh Anh',
    email: 'anh.le@gdtx.edu.vn',
    phone: null,
    role: 'teacher',
    org_id: 'org-cn-dongda',
    org_name: 'Chi nhánh Đống Đa',
    created_at: '2026-06-20T08:00:00Z',
    job_title_id: null,
    job_title_name: null,
    can_view_financials: false,
  },
  {
    id: 'mock-u4',
    full_name: 'Vũ Thị Mai',
    email: 'mai.vu@gdtx.edu.vn',
    phone: '0912000004',
    role: 'accountant',
    org_id: 'org-cs-hn1',
    org_name: 'Cơ sở Hà Nội 1',
    created_at: '2026-07-01T08:00:00Z',
    job_title_id: null,
    job_title_name: null,
    can_view_financials: true,
  },
]

/**
 * Scope tổ chức của user đang đăng nhập (dùng để lọc org_id TƯỜNG MINH,
 * không phó mặc hoàn toàn cho RLS - defense in depth):
 * - super_admin -> null (không giới hạn)
 * - role khác   -> danh sách org trong subtree của họ (get_descendant_org_ids)
 * - chưa đăng nhập / chưa gán org -> ném lỗi để caller rơi về chế độ demo
 */
async function getMyScopeOrgIds(
  supabase: ReturnType<typeof createClient>
): Promise<string[] | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthenticated')

  const { data: me } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!me) throw new Error('profile-not-found')
  if (me.role === 'super_admin') return null
  if (!me.org_id) throw new Error('no-org-assigned')

  return await getDescendantOrgIds(supabase, me.org_id)
}

/**
 * Danh sách tổ chức thuộc quyền quản lý của user đang đăng nhập
 * (org của họ + chi nhánh con). Lọc subtree tường minh, RLS trên
 * organizations cắt tỉa thêm lần 2. Fallback mock khi chưa đăng nhập/DB trống.
 */
export async function getManagedOrgs(): Promise<{
  data: ManagedOrg[]
  demo: boolean
}> {
  try {
    const supabase = createClient()
    const scope = await getMyScopeOrgIds(supabase)

    let query = supabase
      .from('organizations')
      .select('id, name, type')
      .is('deleted_at', null)
      .order('name')
    if (scope) query = query.in('id', scope)

    const { data, error } = await query
    // CHỈ rơi về mock khi LỖI thật sự — danh sách rỗng là dữ liệu thật,
    // không được thay bằng dữ liệu demo gây nhầm lẫn.
    if (error || !data) {
      return { data: MOCK_MANAGED_ORGS, demo: true }
    }
    return { data: data as ManagedOrg[], demo: false }
  } catch {
    return { data: MOCK_MANAGED_ORGS, demo: true }
  }
}

/**
 * Danh sách nhân sự trong phạm vi quản lý. Lọc org_id tường minh theo
 * subtree của user (RLS migration 005 vẫn giới hạn thêm lần 2).
 */
export async function getUsersInScope(filters: {
  role?: string
  orgId?: string
  /** Tìm theo tên hoặc email (không phân biệt hoa thường) */
  search?: string
}): Promise<{ data: StaffRow[]; demo: boolean; error?: string }> {
  try {
    const supabase = createClient()
    const scope = await getMyScopeOrgIds(supabase)

    let query = supabase
      .from('profiles')
      .select(
        'id, full_name, email, phone, role, org_id, created_at, job_title_id, can_view_financials, organizations(name), job_titles(name)'
      )
      .is('deleted_at', null)
      .neq('role', 'student')
      .order('created_at', { ascending: false })
    if (scope) query = query.in('org_id', scope)

    // Không cho lọc role=student trên trang nhân sự
    if (filters.role && filters.role !== 'student') query = query.eq('role', filters.role)
    if (filters.role === 'student') {
      return { data: [], demo: false, error: 'Học viên quản lý tại menu Học sinh.' }
    }
    if (filters.orgId) query = query.eq('org_id', filters.orgId)
    if (filters.search) {
      // Escape ký tự đặc biệt của PostgREST or-filter
      const term = filters.search.replace(/[%_,()]/g, ' ').trim()
      if (term) {
        query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      }
    }

    const { data, error } = await query

    // CHỈ rơi về mock khi LỖI thật sự — cơ sở mới chưa có nhân sự phải
    // thấy danh sách RỖNG thật, không phải 5 người demo gây nhầm lẫn.
    if (error || !data) {
      // Fallback: nếu thiếu cột 056, thử query không join job_titles
      if (error && /job_title|job_titles/i.test(error.message)) {
        let fallback = supabase
          .from('profiles')
          .select('id, full_name, email, phone, role, org_id, created_at, organizations(name)')
          .is('deleted_at', null)
          .neq('role', 'student')
          .order('created_at', { ascending: false })
        if (scope) fallback = fallback.in('org_id', scope)
        if (filters.role && filters.role !== 'student') fallback = fallback.eq('role', filters.role)
        if (filters.orgId) fallback = fallback.eq('org_id', filters.orgId)
        if (filters.search) {
          const term = filters.search.replace(/[%_,()]/g, ' ').trim()
          if (term) {
            fallback = fallback.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
          }
        }
        const fb = await fallback
        if (!fb.error && fb.data) {
          const rows: StaffRow[] = fb.data.map((row) => {
            const org = row.organizations as
              | { name: string }
              | { name: string }[]
              | null
            return {
              id: row.id,
              full_name: row.full_name,
              email: row.email,
              phone: (row.phone as string | null) ?? null,
              role: row.role,
              org_id: row.org_id,
              org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
              created_at: row.created_at,
              job_title_id: null,
              job_title_name: null,
              can_view_financials:
                row.role === 'campus_admin' ||
                (row as { can_view_financials?: boolean }).can_view_financials === true,
            }
          })
          return { data: rows, demo: false }
        }
      }
      const rows = MOCK_USERS.filter(
        (u) =>
          (!filters.role || u.role === filters.role) &&
          (!filters.orgId || u.org_id === filters.orgId)
      )
      return {
        data: process.env.NODE_ENV === 'production' ? [] : rows,
        demo: process.env.NODE_ENV !== 'production',
      }
    }

    const rows: StaffRow[] = data.map((row) => {
      const org = row.organizations as { name: string } | { name: string }[] | null
      const title = (row as { job_titles?: { name: string } | { name: string }[] | null })
        .job_titles
      return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: (row.phone as string | null) ?? null,
        role: row.role,
        org_id: row.org_id,
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        created_at: row.created_at,
        job_title_id: (row as { job_title_id?: string | null }).job_title_id ?? null,
        job_title_name: Array.isArray(title)
          ? title[0]?.name ?? null
          : title?.name ?? null,
        can_view_financials:
          row.role === 'campus_admin' ||
          (row as { can_view_financials?: boolean }).can_view_financials === true,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return {
      data: process.env.NODE_ENV === 'production' ? [] : MOCK_USERS,
      demo: process.env.NODE_ENV !== 'production',
    }
  }
}

/**
 * Tạo tài khoản nhân sự mới (Auth user + profile).
 *
 * LUỒNG BẢO MẬT (bắt buộc, vì Admin client bỏ qua RLS):
 * 1. Xác thực: lấy user đang đăng nhập từ session (auth.getUser).
 * 2. Chặn leo thang quyền: role được gán phải nằm trong ASSIGNABLE_ROLES
 *    (không bao giờ có super_admin, kể cả khi form bị sửa payload).
 * 3. Gọi rpc is_authorized(user.id, org đích, 'campus_admin'):
 *    - user phải có cấp bậc >= campus_admin, VÀ
 *    - org đích phải nằm trong cây tổ chức của họ.
 *    Cố tình truyền org_id của cơ sở khác -> is_authorized trả false -> chặn.
 * 4. Qua hết mới dùng Service Role tạo auth user + insert profiles.
 */
export async function createUserAccount(
  formData: FormData
): Promise<UsersActionResult> {
  // ===== QA GATE: mọi input qua Zod trước khi chạm Supabase =====
  // createUserSchema.role là enum KHÔNG chứa super_admin -> tự chặn leo thang quyền.
  const parsed = createUserSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    role: String(formData.get('role') ?? ''),
    orgId: String(formData.get('orgId') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const { email, password, fullName, role, orgId, phone } = parsed.data

  try {
    const supabase = createClient()

    // ===== [BẢO MẬT 1] Phải đăng nhập =====
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (!currentUser) {
      return {
        error:
          'Bạn chưa đăng nhập. Chức năng tạo tài khoản yêu cầu đăng nhập với quyền Campus Admin.',
      }
    }

    // ===== [BẢO MẬT 2] Double-check bằng RPC is_authorized =====
    // Kiểm tra đồng thời: cấp bậc >= campus_admin VÀ org đích thuộc
    // cây tổ chức của người thực hiện (chặn hack truyền org_id lạ).
    const { data: authorized, error: authzError } = await supabase.rpc(
      'is_authorized',
      {
        p_user_id: currentUser.id,
        p_target_org_id: orgId,
        p_required_role: 'campus_admin',
      }
    )

    if (authzError) {
      return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    }
    if (authorized !== true) {
      return {
        error:
          'TỪ CHỐI: Bạn không phải Campus Admin, hoặc chi nhánh này KHÔNG thuộc quyền quản lý của bạn.',
      }
    }

    // ===== Qua bài test bảo mật: dùng Service Role tạo tài khoản =====
    const admin = createAdminClient()

    // Nhân sự ≠ học viên (HV chỉ tạo tại /students)
    if ((role as string) === 'student') {
      return {
        error: 'Không tạo học viên tại Quản lý Nhân sự. Vào menu Học sinh để thêm HV.',
      }
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // bỏ qua bước xác nhận email
        user_metadata: { full_name: fullName },
      })

    if (createError || !created.user) {
      return {
        error: `Lỗi tạo tài khoản Auth: ${createError?.message ?? 'không xác định'}`,
      }
    }

    // Insert profile tương ứng (Admin client bỏ qua RLS - đã check quyền ở trên)
    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      full_name: fullName,
      email,
      phone: phone || null,
      role,
      org_id: orgId,
      // Quản lý cơ sở luôn xem lương/đơn giá trong phạm vi của mình
      can_view_financials: role === 'campus_admin' || role === 'accountant',
    })

    if (profileError) {
      // Rollback: xóa auth user vừa tạo để không sinh tài khoản mồ côi
      await admin.auth.admin.deleteUser(created.user.id)
      return { error: `Lỗi tạo hồ sơ nhân sự: ${profileError.message}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể tạo tài khoản: ${message}` }
  }

  revalidatePath('/campus-admin/users')
  return {}
}

/**
 * Gác cổng chung cho SỬA/XÓA/CẤP LẠI MẬT KHẨU tài khoản:
 * 1. Người thao tác phải đăng nhập.
 * 2. Target không được là super_admin (Campus Admin không đụng tới).
 * 3. Không tự thao tác lên chính mình (với xóa).
 * 4. is_authorized(user, org CỦA TARGET, 'campus_admin') - target phải
 *    nằm trong subtree của người thao tác.
 * Trả về target profile nếu qua hết.
 */
async function requireManageableTarget(
  targetUserId: string,
  opts: { blockSelf?: boolean } = {}
): Promise<
  | { error: string }
  | {
      error?: undefined
      currentUserId: string
      target: { id: string; org_id: string; role: string; full_name: string }
    }
> {
  const supabase = createClient()
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()
  if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

  if (opts.blockSelf && currentUser.id === targetUserId) {
    return { error: 'Không thể tự xóa tài khoản của chính mình.' }
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name')
    .eq('id', targetUserId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!target?.org_id) {
    return { error: 'Tài khoản không tồn tại hoặc ngoài phạm vi của bạn.' }
  }
  if (target.role === 'super_admin') {
    return { error: 'TỪ CHỐI: Không thể thao tác lên tài khoản Super Admin.' }
  }

  const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
    p_user_id: currentUser.id,
    p_target_org_id: target.org_id,
    p_required_role: 'campus_admin',
  })
  if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
  if (authorized !== true) {
    return {
      error:
        'TỪ CHỐI: Bạn không phải Campus Admin hoặc tài khoản này không thuộc chi nhánh của bạn.',
    }
  }

  return {
    currentUserId: currentUser.id,
    target: target as { id: string; org_id: string; role: string; full_name: string },
  }
}

/**
 * [CHỐNG "ĐƠN VỊ VÔ CHỦ"] Kiểm tra target có phải là campus_admin
 * CUỐI CÙNG trong cây Đơn vị (cấp 1) của họ không. Dùng trước khi
 * xóa hoặc hạ cấp role một campus_admin.
 */
async function isLastCampusAdminOfUnit(targetOrgId: string): Promise<boolean> {
  const admin = createAdminClient()

  // Đi lên tìm gốc Đơn vị cấp 1 (node có cha là gốc hệ thống)
  let unitRootId = targetOrgId
  for (let step = 0; step < 8; step++) {
    const { data: node } = await admin
      .from('organizations')
      .select('id, parent_id')
      .eq('id', unitRootId)
      .maybeSingle()
    if (!node || node.parent_id === null) break
    const { data: parent } = await admin
      .from('organizations')
      .select('id, parent_id')
      .eq('id', node.parent_id)
      .maybeSingle()
    if (!parent || parent.parent_id === null) break // cha là gốc -> node hiện tại là Đơn vị cấp 1
    unitRootId = node.parent_id
  }

  const subtreeIds = await getDescendantOrgIds(admin, unitRootId)
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'campus_admin')
    .in('org_id', subtreeIds)
    .is('deleted_at', null)
  return (count ?? 0) <= 1
}

/**
 * SỬA tài khoản nhân sự/học viên: họ tên, role (không super_admin),
 * chi nhánh (phải thuộc subtree của người thao tác).
 */
export async function updateUserAccount(
  formData: FormData
): Promise<UsersActionResult> {
  const parsed = updateUserSchema.safeParse({
    userId: String(formData.get('userId') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    role: String(formData.get('role') ?? ''),
    orgId: String(formData.get('orgId') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    jobTitleId: String(formData.get('jobTitleId') ?? ''),
    canViewFinancials: formData.get('canViewFinancials') === 'true',
  })
  if (!parsed.success) return zodFail(parsed.error)
  const { userId, fullName, role, orgId, phone, jobTitleId, canViewFinancials } =
    parsed.data

  try {
    const gate = await requireManageableTarget(userId)
    if (gate.error !== undefined) return { error: gate.error }

    // Chi nhánh MỚI cũng phải thuộc quyền của người thao tác
    const supabase = createClient()
    const { data: orgAuthorized } = await supabase.rpc('is_authorized', {
      p_user_id: gate.currentUserId,
      p_target_org_id: orgId,
      p_required_role: 'campus_admin',
    })
    if (orgAuthorized !== true) {
      return { error: 'TỪ CHỐI: Chi nhánh đích không thuộc quyền quản lý của bạn.' }
    }

    // [CHỐNG VÔ CHỦ] Hạ cấp campus_admin CUỐI CÙNG của Đơn vị -> chặn
    if (gate.target.role === 'campus_admin' && role !== 'campus_admin') {
      if (await isLastCampusAdminOfUnit(gate.target.org_id)) {
        return {
          error:
            'Đây là Quản lý (Admin) CUỐI CÙNG của Đơn vị — hãy tạo/bổ nhiệm Admin khác trước khi đổi vai trò người này.',
        }
      }
    }

    let resolvedTitleId: string | null = jobTitleId || null
    if (resolvedTitleId) {
      const { data: title } = await supabase
        .from('job_titles')
        .select('id, org_id')
        .eq('id', resolvedTitleId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!title) {
        return {
          error:
            'Chức danh không tồn tại. Chạy migration 056_job_titles.sql nếu chưa có bảng.',
        }
      }
      // Title phải thuộc org đích hoặc tổ tiên của org đích
      const allowedOrgs = new Set<string>([orgId])
      let cursor = orgId
      for (let step = 0; step < 8; step++) {
        const { data: node } = await supabase
          .from('organizations')
          .select('parent_id')
          .eq('id', cursor)
          .is('deleted_at', null)
          .maybeSingle()
        if (!node?.parent_id) break
        allowedOrgs.add(node.parent_id as string)
        cursor = node.parent_id as string
      }
      if (!allowedOrgs.has(title.org_id as string)) {
        return {
          error: 'Chức danh không thuộc chi nhánh (hoặc cấp trên) của nhân sự.',
        }
      }
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        role,
        org_id: orgId,
        phone: phone || null,
        job_title_id: resolvedTitleId,
        can_view_financials: role === 'campus_admin' ? true : canViewFinancials,
      })
      .eq('id', userId)
    if (error) {
      if (/job_title_id|does not exist|schema cache/i.test(error.message)) {
        return {
          error:
            'Database chưa có cột chức danh. Vào Supabase SQL Editor chạy file supabase/migrations/056_job_titles.sql rồi thử lại.',
        }
      }
      return { error: `Không cập nhật được tài khoản: ${error.message}` }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }

  revalidatePath('/campus-admin/users')
  revalidatePath('/campus-admin/job-titles')
  return {}
}

/** CẤP LẠI MẬT KHẨU cho nhân sự/học viên trong subtree */
export async function resetUserPassword(
  formData: FormData
): Promise<UsersActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    userId: String(formData.get('userId') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)
  const { userId, password } = parsed.data

  try {
    const gate = await requireManageableTarget(userId)
    if (gate.error !== undefined) return { error: gate.error }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return { error: `Không đổi được mật khẩu: ${error.message}` }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }

  return {}
}

// ============================================================
// QUYỀN KIÊM NHIỆM THEO TỪNG NHÂN SỰ (049 - user_menu_permissions)
// Quản lý cơ sở gán THÊM hạng mục cho 1 nhân sự cụ thể. Được gán
// = menu hiện + vào được URL + đọc/ghi được dữ liệu hạng mục đó
// (tối đa ngang cấp Giáo vụ; các mục quản trị cơ sở vẫn cần role thật).
// ============================================================

/** Key KHÔNG BAO GIỜ gán kiêm nhiệm được (chỉ Super Admin) */
const UNGRANTABLE_KEYS: MenuKey[] = ['settings_global']

export type UserGrantData = {
  /** Key được gán THÊM cho user này (kiêm nhiệm 049) */
  grants: MenuKey[]
  /** Key từ chức danh (056) — chỉ đọc trong modal, sửa ở trang chức danh */
  titleKeys: MenuKey[]
  titleName: string | null
  /** Key user đã có sẵn theo vai trò (hiển thị để phân biệt) */
  roleKeys: MenuKey[]
  /** Trần ủy quyền của người gán (campus_admin); null = super_admin không giới hạn */
  capKeys: MenuKey[] | null
  targetName: string
  targetRole: string
}

/** Đọc quyền kiêm nhiệm hiện có của 1 nhân sự trong phạm vi quản lý */
export async function getUserGrants(
  targetUserId: string
): Promise<{ error: string } | ({ error?: undefined } & UserGrantData)> {
  const gate = await requireManageableTarget(targetUserId)
  if (gate.error !== undefined) return { error: gate.error }

  const supabase = createClient()

  const [{ data: row }, { data: me }, profileRes] = await Promise.all([
    supabase
      .from('user_menu_permissions')
      .select('menu_keys')
      .eq('user_id', targetUserId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('role')
      .eq('id', gate.currentUserId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('job_title_id, job_titles(name, menu_keys)')
      .eq('id', targetUserId)
      .maybeSingle(),
  ])

  const profile =
    profileRes.error && /job_title|job_titles/i.test(profileRes.error.message)
      ? null
      : profileRes.data

  // Trần ủy quyền: campus_admin TOÀN QUYỀN vận hành trong subtree
  // -> gán được mọi hạng mục cơ sở (trừ key riêng của super_admin).
  let capKeys: MenuKey[] | null = null
  if (me?.role === 'campus_admin') {
    capKeys = defaultKeysForRole('campus_admin').filter(
      (key) => !UNGRANTABLE_KEYS.includes(key)
    )
  }

  const jt = profile?.job_titles as
    | { name: string; menu_keys: unknown }
    | { name: string; menu_keys: unknown }[]
    | null
    | undefined
  const titleObj = Array.isArray(jt) ? jt[0] : jt
  const titleKeys = Array.isArray(titleObj?.menu_keys)
    ? (titleObj!.menu_keys as unknown[]).filter(isMenuKey)
    : []

  return {
    grants: Array.isArray(row?.menu_keys)
      ? (row.menu_keys as unknown[]).filter(isMenuKey)
      : [],
    titleKeys,
    titleName: titleObj?.name ?? null,
    roleKeys: defaultKeysForRole(gate.target.role as Role),
    capKeys,
    targetName: gate.target.full_name,
    targetRole: gate.target.role,
  }
}

/**
 * LƯU quyền kiêm nhiệm cho 1 nhân sự. keys rỗng -> gỡ hết (xóa dòng).
 * Ghi bằng user client -> RLS 049 tự chặn ngoài subtree lần 2.
 */
export async function saveUserGrants(
  targetUserId: string,
  keys: string[]
): Promise<UsersActionResult> {
  const gate = await requireManageableTarget(targetUserId)
  if (gate.error !== undefined) return { error: gate.error }

  const supabase = createClient()
  const cleanKeys = keys
    .filter(isMenuKey)
    .filter((key) => !UNGRANTABLE_KEYS.includes(key))

  // Trần ủy quyền: campus_admin gán được mọi hạng mục vận hành cơ sở
  // (trừ key riêng của super_admin - đã lọc bởi UNGRANTABLE_KEYS).
  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', gate.currentUserId)
    .maybeSingle()
  if (me?.role === 'campus_admin') {
    const cap = defaultKeysForRole('campus_admin')
    const outOfCap = cleanKeys.filter((key) => !cap.includes(key))
    if (outOfCap.length > 0) {
      return { error: `Hạng mục ngoài phạm vi cơ sở: ${outOfCap.join(', ')}` }
    }
  }

  // Báo lỗi DỄ HIỂU khi DB chưa có bảng 049 (phải chạy migration tay)
  const friendly = (message: string) =>
    /user_menu_permissions|does not exist|schema cache/i.test(message)
      ? 'Database chưa có bảng gán quyền. Vào Supabase SQL Editor chạy file supabase/migrations/049_user_grants.sql rồi thử lại.'
      : message

  if (cleanKeys.length === 0) {
    const { error } = await supabase
      .from('user_menu_permissions')
      .delete()
      .eq('user_id', targetUserId)
    if (error) return { error: `Không gỡ được quyền: ${friendly(error.message)}` }
  } else {
    const { error } = await supabase.from('user_menu_permissions').upsert(
      {
        user_id: targetUserId,
        org_id: gate.target.org_id,
        menu_keys: cleanKeys,
        updated_by: gate.currentUserId,
      },
      { onConflict: 'user_id' }
    )
    if (error) return { error: `Không lưu được quyền: ${friendly(error.message)}` }
  }

  revalidatePath('/campus-admin/users')
  return {}
}

/**
 * XÓA tài khoản (XÓA MỀM profile + chặn đăng nhập bằng ban).
 * Không xóa auth user thật để giữ vết dữ liệu (điểm, học phí, log...).
 */
export async function deleteUserAccount(userId: string): Promise<UsersActionResult> {
  if (!userId) return { error: 'Thiếu ID người dùng.' }

  try {
    const gate = await requireManageableTarget(userId, { blockSelf: true })
    if (gate.error !== undefined) return { error: gate.error }

    // [CHỐNG VÔ CHỦ] Không xóa campus_admin CUỐI CÙNG của Đơn vị
    if (gate.target.role === 'campus_admin') {
      if (await isLastCampusAdminOfUnit(gate.target.org_id)) {
        return {
          error:
            'Đây là Quản lý (Admin) CUỐI CÙNG của Đơn vị — hãy tạo Admin mới trước rồi mới xóa, để Đơn vị không bị vô chủ.',
        }
      }
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) return { error: `Không xóa được tài khoản: ${error.message}` }

    // Chặn đăng nhập: ban ~100 năm (soft delete nhưng khóa cửa thật)
    await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }

  revalidatePath('/campus-admin/users')
  return {}
}
