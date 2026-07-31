'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createUserSchema, zodFail } from '@/lib/validation/schemas'

// ============================================================
// Module Quản lý Nhân sự (Campus Admin)
// - Đọc danh sách: dùng SSR client -> RLS (migration 005) tự cắt
//   dữ liệu theo subtree của user đang đăng nhập.
// - Tạo tài khoản: dùng Admin client (Service Role) NHƯNG bắt buộc
//   qua cửa kiểm tra rpc is_authorized trước (chống hack org_id).
// ============================================================

/** Các role Campus Admin được phép gán. TUYỆT ĐỐI không có super_admin. */
export type AssignableRole =
  | 'campus_admin'
  | 'academic_staff'
  | 'admission_staff'
  | 'teacher'
  | 'student'

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
  role: string
  org_id: string | null
  org_name: string
  created_at: string
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
    role: 'academic_staff',
    org_id: 'org-cs-hn1',
    org_name: 'Cơ sở Hà Nội 1',
    created_at: '2026-05-12T08:00:00Z',
  },
  {
    id: 'mock-u2',
    full_name: 'Phạm Quang Huy',
    email: 'huy.pham@gdtx.edu.vn',
    role: 'teacher',
    org_id: 'org-cn-caugiay',
    org_name: 'Chi nhánh Cầu Giấy',
    created_at: '2026-06-02T08:00:00Z',
  },
  {
    id: 'mock-u3',
    full_name: 'Lê Minh Anh',
    email: 'anh.le@gdtx.edu.vn',
    role: 'teacher',
    org_id: 'org-cn-dongda',
    org_name: 'Chi nhánh Đống Đa',
    created_at: '2026-06-20T08:00:00Z',
  },
  {
    id: 'mock-u4',
    full_name: 'Nguyễn Văn Toàn',
    email: 'toan.nguyen@student.gdtx.edu.vn',
    role: 'student',
    org_id: 'org-cn-caugiay',
    org_name: 'Chi nhánh Cầu Giấy',
    created_at: '2026-07-01T08:00:00Z',
  },
  {
    id: 'mock-u5',
    full_name: 'Đỗ Thu Hà',
    email: 'ha.do@student.gdtx.edu.vn',
    role: 'student',
    org_id: 'org-cn-dongda',
    org_name: 'Chi nhánh Đống Đa',
    created_at: '2026-07-15T08:00:00Z',
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

  const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: me.org_id,
  })
  return (subtree as string[] | null) ?? [me.org_id]
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
    if (error || !data || data.length === 0) {
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
}): Promise<{ data: StaffRow[]; demo: boolean; error?: string }> {
  try {
    const supabase = createClient()
    const scope = await getMyScopeOrgIds(supabase)

    let query = supabase
      .from('profiles')
      .select('id, full_name, email, role, org_id, created_at, organizations(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (scope) query = query.in('org_id', scope)

    if (filters.role) query = query.eq('role', filters.role)
    if (filters.orgId) query = query.eq('org_id', filters.orgId)

    const { data, error } = await query

    if (error || !data || data.length === 0) {
      // Demo: áp bộ lọc lên mock để UI vẫn hoạt động đúng
      const rows = MOCK_USERS.filter(
        (u) =>
          (!filters.role || u.role === filters.role) &&
          (!filters.orgId || u.org_id === filters.orgId)
      )
      return { data: rows, demo: true }
    }

    const rows: StaffRow[] = data.map((row) => {
      const org = row.organizations as { name: string } | { name: string }[] | null
      return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        org_id: row.org_id,
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        created_at: row.created_at,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: MOCK_USERS, demo: true }
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
  })
  if (!parsed.success) return zodFail(parsed.error)

  const { email, password, fullName, role, orgId } = parsed.data

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
      role,
      org_id: orgId,
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
