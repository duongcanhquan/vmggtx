'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDescendantOrgIds, invalidateOrgScopeCache } from '@/lib/utils/orgScope'
import { zodFail, type ActionResult } from '@/lib/validation/schemas'
import type { OrgFlat, OrgType } from '@/lib/utils/org-tree'

// ============================================================
// QUẢN LÝ CƠ SỞ (/admin/organizations)
// - getOrgManagementData: cây tổ chức + đếm học viên/lớp mỗi đơn vị
//   (RLS tự cắt theo subtree; super_admin thấy tất cả).
// - CRUD đơn vị: SUPER ADMIN toàn quyền; CAMPUS ADMIN được
//   thêm/sửa/xóa các đơn vị TRONG CÂY CON của mình (parent/target
//   phải thuộc subtree). Ghi bằng Admin client SAU khi đã xác thực
//   quyền server-side (pattern giống campus-admin/users).
// - Xóa là XÓA MỀM (deleted_at) và bị chặn khi đơn vị còn đơn vị
//   con / học viên / lớp học đang hoạt động.
// ============================================================

export type OrgManagementRow = OrgFlat & {
  studentCount: number
  classCount: number
}

export type OrgManagementResult =
  | { error: string }
  | {
      error?: undefined
      orgs: OrgManagementRow[]
      isSuperAdmin: boolean
      /** true = được thêm/sửa/xóa đơn vị (super_admin hoặc campus_admin) */
      canManage: boolean
      /** org gốc của user - campus_admin KHÔNG được xóa đơn vị này */
      myOrgId: string | null
    }

export async function getOrgManagementData(): Promise<OrgManagementResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const [{ data: profile }, orgsRes, studentsRes, classesRes] = await Promise.all([
      supabase.from('profiles').select('role, org_id').eq('id', user.id).maybeSingle(),
      supabase
        .from('organizations')
        .select('id, name, type, parent_id')
        .is('deleted_at', null)
        .order('name'),
      // [ĐA TẦNG] RLS cắt sẵn theo subtree - chỉ đếm những gì được thấy
      supabase
        .from('profiles')
        .select('org_id')
        .eq('role', 'student')
        .is('deleted_at', null),
      supabase.from('classes').select('org_id').is('deleted_at', null),
    ])

    if (orgsRes.error) {
      return { error: `Không tải được cây tổ chức: ${orgsRes.error.message}` }
    }

    const studentByOrg = new Map<string, number>()
    for (const row of studentsRes.data ?? []) {
      if (row.org_id) studentByOrg.set(row.org_id, (studentByOrg.get(row.org_id) ?? 0) + 1)
    }
    const classByOrg = new Map<string, number>()
    for (const row of classesRes.data ?? []) {
      classByOrg.set(row.org_id, (classByOrg.get(row.org_id) ?? 0) + 1)
    }

    const orgs: OrgManagementRow[] = ((orgsRes.data ?? []) as OrgFlat[]).map((org) => ({
      ...org,
      studentCount: studentByOrg.get(org.id) ?? 0,
      classCount: classByOrg.get(org.id) ?? 0,
    }))

    const role = profile?.role ?? ''
    return {
      orgs,
      isSuperAdmin: role === 'super_admin',
      canManage: role === 'super_admin' || role === 'campus_admin',
      myOrgId: profile?.org_id ?? null,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

// ------------------------------------------------------------
// CỬA XÁC THỰC: super_admin toàn quyền; campus_admin chỉ trong
// cây con của chính mình (target/parent phải thuộc subtree).
// ------------------------------------------------------------
type OrgManagerAuth =
  | { error: string }
  | {
      error?: undefined
      userId: string
      role: 'super_admin' | 'campus_admin'
      orgId: string | null
      /** null với super_admin = không giới hạn */
      subtreeIds: string[] | null
    }

async function requireOrgManager(): Promise<OrgManagerAuth> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (profile?.role === 'super_admin') {
    return { userId: user.id, role: 'super_admin', orgId: profile.org_id, subtreeIds: null }
  }
  if (profile?.role === 'campus_admin') {
    if (!profile.org_id) {
      return { error: 'Tài khoản Quản lý cơ sở chưa được gắn cơ sở.' }
    }
    const subtreeIds = await getDescendantOrgIds(supabase, profile.org_id)
    return { userId: user.id, role: 'campus_admin', orgId: profile.org_id, subtreeIds }
  }
  return { error: 'TỪ CHỐI: Chỉ Super Admin hoặc Quản lý cơ sở được quản lý đơn vị.' }
}

function inScope(auth: Exclude<OrgManagerAuth, { error: string }>, orgId: string): boolean {
  return auth.subtreeIds === null || auth.subtreeIds.includes(orgId)
}

const orgNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên đơn vị.' })
  .trim()
  .min(3, 'Tên đơn vị tối thiểu 3 ký tự.')
  .max(120, 'Tên đơn vị tối đa 120 ký tự.')
  .regex(/^[^<>{};]*$/, 'Tên đơn vị chứa ký tự không hợp lệ.')

const orgTypeSchema = z.enum(['region', 'campus', 'branch'], {
  errorMap: () => ({ message: 'Loại đơn vị không hợp lệ.' }),
})

// ------------------------------------------------------------
// TẠO ĐƠN VỊ
// ------------------------------------------------------------
const createOrgSchema = z.object({
  name: orgNameSchema,
  type: orgTypeSchema,
  parentId: z.string({ required_error: 'Vui lòng chọn đơn vị cha.' }).uuid('Đơn vị cha không hợp lệ.'),
})

export async function createOrganization(formData: FormData): Promise<ActionResult> {
  const parsed = createOrgSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? ''),
    parentId: String(formData.get('parentId') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const auth = await requireOrgManager()
    if (auth.error !== undefined) return { error: auth.error }

    // [ĐA TẦNG] campus_admin chỉ được tạo đơn vị TRONG cây con của mình
    if (!inScope(auth, parsed.data.parentId)) {
      return { error: 'TỪ CHỐI: Đơn vị cha nằm ngoài phạm vi quản lý của bạn.' }
    }

    const admin = createAdminClient()
    const { data: parent } = await admin
      .from('organizations')
      .select('id, type, parent_id')
      .eq('id', parsed.data.parentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parent) return { error: 'Đơn vị cha không tồn tại.' }

    // [GIỚI HẠN 3 CẤP] Dưới 1 CƠ SỞ (type='campus') tối đa 3 tầng:
    // Cơ sở (1) -> Nhánh (2) -> Nhánh con (3). Không cho tạo tầng 4.
    // Tính tầng của ĐƠN VỊ CHA so với cơ sở gần nhất phía trên nó.
    let parentTier = parent.type === 'campus' ? 1 : 0
    if (parentTier === 0) {
      let cursorId = (parent.parent_id as string | null) ?? null
      let steps = 1
      while (cursorId && steps <= 8) {
        const { data: ancestor } = await admin
          .from('organizations')
          .select('id, type, parent_id')
          .eq('id', cursorId)
          .maybeSingle()
        if (!ancestor) break
        if (ancestor.type === 'campus') {
          parentTier = steps + 1
          break
        }
        cursorId = (ancestor.parent_id as string | null) ?? null
        steps++
      }
    }
    if (parentTier >= 3) {
      return {
        error:
          'Đã chạm giới hạn 3 cấp dưới một Cơ sở (Cơ sở → Nhánh → Nhánh con). Không thể tạo thêm cấp thứ 4.',
      }
    }

    // Trigger DB tự tính path ltree từ parent_id (migration 001)
    const { error } = await admin.from('organizations').insert({
      name: parsed.data.name,
      type: parsed.data.type as OrgType,
      parent_id: parsed.data.parentId,
    })
    if (error) return { error: `Không thể tạo đơn vị: ${error.message}` }

    invalidateOrgScopeCache()
    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi tạo đơn vị.',
    }
  }
}

// ------------------------------------------------------------
// SỬA ĐƠN VỊ (đổi tên / loại)
// ------------------------------------------------------------
const updateOrgSchema = z.object({
  orgId: z.string().uuid('Đơn vị không hợp lệ.'),
  name: orgNameSchema,
  // Cho phép bỏ trống type = giữ nguyên (đơn vị hq không đổi loại)
  type: orgTypeSchema.optional(),
})

export async function updateOrganization(formData: FormData): Promise<ActionResult> {
  const rawType = String(formData.get('type') ?? '')
  const parsed = updateOrgSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    name: String(formData.get('name') ?? ''),
    type: rawType === '' ? undefined : rawType,
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const auth = await requireOrgManager()
    if (auth.error !== undefined) return { error: auth.error }
    if (!inScope(auth, parsed.data.orgId)) {
      return { error: 'TỪ CHỐI: Đơn vị này nằm ngoài phạm vi quản lý của bạn.' }
    }

    const admin = createAdminClient()
    const { data: target } = await admin
      .from('organizations')
      .select('id, type')
      .eq('id', parsed.data.orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!target) return { error: 'Đơn vị không tồn tại hoặc đã bị xóa.' }

    const updates: { name: string; type?: OrgType } = { name: parsed.data.name }
    // Trụ sở chính (hq) giữ nguyên loại; các đơn vị khác được đổi loại
    if (parsed.data.type && target.type !== 'hq') {
      updates.type = parsed.data.type as OrgType
    }

    const { error } = await admin
      .from('organizations')
      .update(updates)
      .eq('id', parsed.data.orgId)
    if (error) return { error: `Không thể cập nhật đơn vị: ${error.message}` }

    invalidateOrgScopeCache()
    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi cập nhật.',
    }
  }
}

// ------------------------------------------------------------
// XÓA ĐƠN VỊ (xóa mềm - chặn khi còn đơn vị con / học viên / lớp)
// ------------------------------------------------------------
export async function deleteOrganization(orgId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(orgId).success) {
    return { error: 'Đơn vị không hợp lệ.' }
  }

  try {
    const auth = await requireOrgManager()
    if (auth.error !== undefined) return { error: auth.error }
    if (!inScope(auth, orgId)) {
      return { error: 'TỪ CHỐI: Đơn vị này nằm ngoài phạm vi quản lý của bạn.' }
    }
    // campus_admin không được xóa CHÍNH cơ sở gốc của mình
    if (auth.role === 'campus_admin' && orgId === auth.orgId) {
      return { error: 'Bạn không thể xóa chính cơ sở gốc mình đang quản lý.' }
    }

    const admin = createAdminClient()
    const { data: target } = await admin
      .from('organizations')
      .select('id, name, type')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!target) return { error: 'Đơn vị không tồn tại hoặc đã bị xóa.' }
    if (target.type === 'hq') {
      return { error: 'Không thể xóa Trụ sở chính.' }
    }

    // AN TOÀN DỮ LIỆU: chặn xóa khi còn đơn vị con / học viên / lớp học
    const [childrenRes, studentsRes, classesRes] = await Promise.all([
      admin
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', orgId)
        .is('deleted_at', null),
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'student')
        .is('deleted_at', null),
      admin
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('deleted_at', null),
    ])
    if ((childrenRes.count ?? 0) > 0) {
      return { error: `Không thể xóa: "${target.name}" còn ${childrenRes.count} đơn vị trực thuộc. Hãy xóa hoặc di chuyển các đơn vị con trước.` }
    }
    if ((studentsRes.count ?? 0) > 0) {
      return { error: `Không thể xóa: "${target.name}" còn ${studentsRes.count} học viên. Hãy chuyển học viên sang đơn vị khác trước.` }
    }
    if ((classesRes.count ?? 0) > 0) {
      return { error: `Không thể xóa: "${target.name}" còn ${classesRes.count} lớp học đang hoạt động.` }
    }

    const { error } = await admin
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', orgId)
    if (error) return { error: `Không thể xóa đơn vị: ${error.message}` }

    invalidateOrgScopeCache()
    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi xóa đơn vị.',
    }
  }
}
