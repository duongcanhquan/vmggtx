'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDescendantOrgIds, invalidateOrgScopeCache } from '@/lib/utils/orgScope'
import {
  unitAdminCreateSchema,
  unitAdminUpdateSchema,
  zodFail,
  type ActionResult,
} from '@/lib/validation/schemas'
import type { OrgFlat, OrgType } from '@/lib/utils/org-tree'
import { orgSlugSchema, slugifyOrgName } from '@/lib/utils/orgSlug'
import { MODULE_CATALOG } from '@/lib/licensing/moduleCatalog'

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
      /**
       * Các org được phép thao tác (cây con của user).
       * null = không giới hạn (super_admin). Các org NGOÀI danh sách này
       * (cấp trên hiển thị nhờ RLS) chỉ được XEM, không hiện nút sửa/xóa.
       */
      manageableIds: string[] | null
    }

export async function getOrgManagementData(): Promise<OrgManagementResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const [{ data: profile }, studentsRes, classesRes] = await Promise.all([
      supabase.from('profiles').select('role, org_id').eq('id', user.id).maybeSingle(),
      // [ĐA TẦNG] RLS cắt sẵn theo subtree - chỉ đếm những gì được thấy
      supabase
        .from('profiles')
        .select('org_id')
        .eq('role', 'student')
        .is('deleted_at', null),
      supabase.from('classes').select('org_id').is('deleted_at', null),
    ])

    // slug (045) — fail-soft nếu chưa chạy migration
    let orgRows: OrgFlat[] = []
    {
      const withSlug = await supabase
        .from('organizations')
        .select('id, name, type, parent_id, slug')
        .is('deleted_at', null)
        .order('name')
      if (
        withSlug.error &&
        /slug|42703|PGRST204|does not exist|schema cache/i.test(withSlug.error.message)
      ) {
        const fallback = await supabase
          .from('organizations')
          .select('id, name, type, parent_id')
          .is('deleted_at', null)
          .order('name')
        if (fallback.error) {
          return { error: `Không tải được cây tổ chức: ${fallback.error.message}` }
        }
        orgRows = (fallback.data ?? []) as OrgFlat[]
      } else if (withSlug.error) {
        return { error: `Không tải được cây tổ chức: ${withSlug.error.message}` }
      } else {
        orgRows = (withSlug.data ?? []) as OrgFlat[]
      }
    }

    const studentByOrg = new Map<string, number>()
    for (const row of studentsRes.data ?? []) {
      if (row.org_id) studentByOrg.set(row.org_id, (studentByOrg.get(row.org_id) ?? 0) + 1)
    }
    const classByOrg = new Map<string, number>()
    for (const row of classesRes.data ?? []) {
      classByOrg.set(row.org_id, (classByOrg.get(row.org_id) ?? 0) + 1)
    }

    const orgs: OrgManagementRow[] = orgRows.map((org) => ({
      ...org,
      studentCount: studentByOrg.get(org.id) ?? 0,
      classCount: classByOrg.get(org.id) ?? 0,
    }))

    const role = profile?.role ?? ''
    // [ĐA TẦNG] campus_admin chỉ thao tác trong cây con của mình.
    // RLS vẫn cho THẤY các cấp trên (để vẽ cây) nhưng UI phải ẩn nút sửa/xóa.
    let manageableIds: string[] | null = null
    if (role === 'campus_admin' && profile?.org_id) {
      manageableIds = await getDescendantOrgIds(supabase, profile.org_id)
    } else if (role !== 'super_admin') {
      manageableIds = []
    }
    return {
      orgs,
      isSuperAdmin: role === 'super_admin',
      canManage: role === 'super_admin' || role === 'campus_admin',
      myOrgId: profile?.org_id ?? null,
      manageableIds,
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

/**
 * [RANH GIỚI CẤP 1 — THEO CẤU TRÚC CÂY, KHÔNG THEO CỘT type]
 * Super Admin CHỈ thao tác: gốc hệ thống + con TRỰC TIẾP của gốc
 * (= Đơn vị khách hàng, cấp 1). Nhánh cấp 2-3 dù dữ liệu cũ có gắn
 * nhầm type 'campus' vẫn là việc của Admin Đơn vị — Super Admin chỉ xem.
 */
async function isTopLevelForSuper(org: {
  parent_id?: string | null
}): Promise<boolean> {
  const parentId = org.parent_id ?? null
  if (parentId === null) return true // chính gốc hệ thống
  const admin = createAdminClient()
  const { data: parent } = await admin
    .from('organizations')
    .select('parent_id')
    .eq('id', parentId)
    .maybeSingle()
  return (parent?.parent_id ?? null) === null // cha là gốc -> cấp 1
}

const SUPER_LEVEL_ERROR =
  'TỪ CHỐI: Super Admin chỉ quản lý ĐƠN VỊ CẤP 1 (khách hàng). Các nhánh bên trong do Admin của Đơn vị đó tự tổ chức — bạn chỉ xem.'

const orgNameSchema = z
  .string({ required_error: 'Vui lòng nhập tên đơn vị.' })
  .trim()
  .min(3, 'Tên đơn vị tối thiểu 3 ký tự.')
  .max(120, 'Tên đơn vị tối đa 120 ký tự.')
  .regex(/^[^<>{};]*$/, 'Tên đơn vị chứa ký tự không hợp lệ.')

// [ORG_MODEL.md G1] Chỉ còn 2 loại tạo mới: 'campus' = Đơn vị (Trường),
// 'branch' = Cơ sở/Trung tâm. hq/region là di sản, không tạo/đổi sang nữa.
const orgTypeSchema = z.enum(['campus', 'branch'], {
  errorMap: () => ({ message: 'Loại đơn vị không hợp lệ.' }),
})

// ------------------------------------------------------------
// TẠO ĐƠN VỊ
// ------------------------------------------------------------
const createOrgSchema = z.object({
  name: orgNameSchema,
  type: orgTypeSchema,
  parentId: z.string({ required_error: 'Vui lòng chọn đơn vị cha.' }).uuid('Đơn vị cha không hợp lệ.'),
  slug: z.string().trim().optional(),
})

async function ensureUniqueSlug(
  admin: ReturnType<typeof createAdminClient>,
  desired: string,
  excludeId?: string
): Promise<string | { error: string }> {
  const baseParsed = orgSlugSchema.safeParse(desired)
  if (!baseParsed.success) return zodFail(baseParsed.error)
  let candidate = baseParsed.data
  let n = 2
  while (n < 50) {
    let q = admin
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .is('deleted_at', null)
      .limit(1)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q.maybeSingle()
    if (error) {
      if (/slug|42703|PGRST204|does not exist|schema cache/i.test(error.message)) {
        return {
          error:
            'Chưa chạy migration 045_org_slugs.sql trên database. Hãy chạy trong Supabase SQL Editor.',
        }
      }
      return { error: `Không kiểm tra được slug: ${error.message}` }
    }
    if (!data) return candidate
    candidate = `${baseParsed.data.slice(0, 40)}-${n}`
    n++
  }
  return { error: 'Không tạo được slug duy nhất. Hãy đổi mã đường dẫn.' }
}

export async function createOrganization(formData: FormData): Promise<ActionResult> {
  const parsed = createOrgSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    type: String(formData.get('type') ?? ''),
    parentId: String(formData.get('parentId') ?? ''),
    slug: String(formData.get('slug') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const auth = await requireOrgManager()
    if (auth.error !== undefined) return { error: auth.error }

    // [ĐA TẦNG] campus_admin chỉ được tạo đơn vị TRONG cây con của mình
    if (!inScope(auth, parsed.data.parentId)) {
      return { error: 'TỪ CHỐI: Đơn vị cha nằm ngoài phạm vi quản lý của bạn.' }
    }

    // Admin Đơn vị chỉ tạo Cơ sở/Trung tâm bên trong — Đơn vị mới do Super Admin lập
    if (auth.role === 'campus_admin' && parsed.data.type === 'campus') {
      return {
        error:
          'Admin Đơn vị chỉ được tạo Cơ sở / Trung tâm bên trong Đơn vị mình. Đơn vị (Trường) mới do Super Admin khởi tạo.',
      }
    }

    // [RANH GIỚI] Super Admin CHỈ khởi tạo Đơn vị (Trường) — tổ chức
    // bên trong (Cơ sở/Trung tâm) là việc của Admin Đơn vị đó.
    if (auth.role === 'super_admin' && parsed.data.type === 'branch') {
      return {
        error:
          'Super Admin chỉ khởi tạo Đơn vị (Trường). Cơ sở / Trung tâm bên trong do Admin của Đơn vị đó tự tổ chức.',
      }
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
          .is('deleted_at', null)
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
    // Cấm Đơn vị lồng trong Đơn vị (parent đã thuộc cây một Đơn vị)
    if (parsed.data.type === 'campus' && (parent.type === 'campus' || parentTier > 0)) {
      return {
        error: 'Không tạo Đơn vị lồng trong Đơn vị khác. Bên trong Đơn vị chỉ tạo Cơ sở / Trung tâm.',
      }
    }
    // [CẤU TRÚC] Đơn vị khách hàng (cấp 1) phải nằm NGAY DƯỚI gốc hệ thống
    if (parsed.data.type === 'campus' && parent.parent_id !== null) {
      return { error: 'Đơn vị (Trường) mới phải nằm ngay dưới gốc hệ thống.' }
    }
    if (parentTier >= 3) {
      return {
        error:
          'Đã chạm giới hạn 3 cấp dưới một Đơn vị (Đơn vị → Cơ sở → Trung tâm). Không thể tạo thêm cấp thứ 4.',
      }
    }

    // Trigger DB tự tính path ltree từ parent_id (migration 001)
    const insertRow: {
      name: string
      type: OrgType
      parent_id: string
      slug?: string
    } = {
      name: parsed.data.name,
      type: parsed.data.type as OrgType,
      parent_id: parsed.data.parentId,
    }

    // Campus bắt buộc có slug → cổng /coso/[slug]
    if (parsed.data.type === 'campus') {
      const rawSlug =
        parsed.data.slug && parsed.data.slug.length > 0
          ? parsed.data.slug
          : slugifyOrgName(parsed.data.name)
      const unique = await ensureUniqueSlug(admin, rawSlug)
      if (typeof unique === 'object') return unique
      insertRow.slug = unique
    }

    const { error } = await admin.from('organizations').insert(insertRow)
    if (error) {
      if (/slug|045|unique|duplicate/i.test(error.message)) {
        return {
          error:
            'Mã đường dẫn (slug) đã tồn tại hoặc chưa chạy migration 045. Đổi slug hoặc chạy 045_org_slugs.sql.',
        }
      }
      return { error: `Không thể tạo đơn vị: ${error.message}` }
    }

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
  slug: z.string().trim().optional(),
})

export async function updateOrganization(formData: FormData): Promise<ActionResult> {
  const rawType = String(formData.get('type') ?? '')
  const parsed = updateOrgSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    name: String(formData.get('name') ?? ''),
    type: rawType === '' ? undefined : rawType,
    slug: String(formData.get('slug') ?? ''),
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
      .select('id, type, slug, parent_id')
      .eq('id', parsed.data.orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!target) return { error: 'Đơn vị không tồn tại hoặc đã bị xóa.' }

    // [RANH GIỚI CẤP 1] Super Admin chỉ sửa gốc hệ thống + Đơn vị cấp 1
    if (auth.role === 'super_admin' && !(await isTopLevelForSuper(target))) {
      return { error: SUPER_LEVEL_ERROR }
    }

    const nextType = (parsed.data.type && target.type !== 'hq'
      ? parsed.data.type
      : target.type) as OrgType

    const updates: { name: string; type?: OrgType; slug?: string | null } = {
      name: parsed.data.name,
    }
    // Trụ sở chính (hq) giữ nguyên loại; các đơn vị khác được đổi loại
    if (parsed.data.type && target.type !== 'hq') {
      updates.type = parsed.data.type as OrgType
    }

    if (nextType === 'campus') {
      const rawSlug =
        parsed.data.slug && parsed.data.slug.length > 0
          ? parsed.data.slug
          : target.slug || slugifyOrgName(parsed.data.name)
      const unique = await ensureUniqueSlug(admin, rawSlug, parsed.data.orgId)
      if (typeof unique === 'object') return unique
      updates.slug = unique
    }

    const { error } = await admin
      .from('organizations')
      .update(updates)
      .eq('id', parsed.data.orgId)
    if (error) {
      if (/slug|unique|duplicate/i.test(error.message)) {
        return { error: 'Mã đường dẫn (slug) đã được dùng bởi cơ sở khác.' }
      }
      return { error: `Không thể cập nhật đơn vị: ${error.message}` }
    }

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
      .select('id, name, type, parent_id')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!target) return { error: 'Đơn vị không tồn tại hoặc đã bị xóa.' }
    if (target.type === 'hq' || target.parent_id === null) {
      return { error: 'Không thể xóa gốc hệ thống.' }
    }
    // [RANH GIỚI CẤP 1] Super Admin chỉ xóa Đơn vị cấp 1
    if (auth.role === 'super_admin' && !(await isTopLevelForSuper(target))) {
      return { error: SUPER_LEVEL_ERROR }
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

// ------------------------------------------------------------
// HỒ SƠ ĐƠN VỊ [ORG_MODEL.md G2] — Super Admin bấm vào 1 Đơn vị
// để thấy: bao nhiêu admin/nhân viên/GV/HS (GỘP CẢ CÂY — con người
// thuộc Đơn vị, cơ sở chỉ là nơi học/làm), module đang hoạt động,
// tình trạng license, và các Cơ sở/Trung tâm bên trong.
// ------------------------------------------------------------
export type UnitProfile =
  | { error: string }
  | {
      error?: undefined
      org: { id: string; name: string; type: OrgType; slug: string | null }
      /** Đếm GỘP toàn cây của Đơn vị */
      counts: {
        admins: number
        staff: number
        teachers: number
        students: number
        classes: number
      }
      /** Cơ sở/Trung tâm bên trong (không gồm chính Đơn vị) */
      children: {
        id: string
        name: string
        type: OrgType
        parent_id: string | null
        students: number
        teachers: number
      }[]
      license: {
        planName: string
        moduleKeys: string[] | null // null = gói đầy đủ (chưa có dòng license)
        maxStudents: number | null
        validUntil: string | null
        status: string
      }
      /** Module key đang bị TẮT với đơn vị này (flag global hoặc riêng org) */
      offModules: string[]
    }

export async function getUnitProfile(orgId: string): Promise<UnitProfile> {
  if (!z.string().uuid().safeParse(orgId).success) {
    return { error: 'Đơn vị không hợp lệ.' }
  }
  try {
    const auth = await requireOrgManager()
    if (auth.error !== undefined) return { error: auth.error }
    if (!inScope(auth, orgId)) {
      return { error: 'TỪ CHỐI: Đơn vị này nằm ngoài phạm vi quản lý của bạn.' }
    }

    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id, name, type, slug')
      .eq('id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!org) return { error: 'Đơn vị không tồn tại hoặc đã bị xóa.' }

    const subtreeIds = await getDescendantOrgIds(admin, orgId)

    const [profilesRes, classesRes, childrenRes, licenseRes, flagsRes] =
      await Promise.all([
        admin
          .from('profiles')
          .select('role, org_id')
          .in('org_id', subtreeIds)
          .is('deleted_at', null),
        admin
          .from('classes')
          .select('id', { count: 'exact', head: true })
          .in('org_id', subtreeIds)
          .is('deleted_at', null),
        admin
          .from('organizations')
          .select('id, name, type, parent_id')
          .in('id', subtreeIds)
          .neq('id', orgId)
          .is('deleted_at', null)
          .order('name'),
        admin
          .from('tenant_licenses')
          .select('plan_name, module_keys, max_students, valid_until, status')
          .eq('org_id', orgId)
          .maybeSingle(),
        admin
          .from('module_flags')
          .select('org_id, module_key, feature_key')
          .eq('enabled', false)
          .is('feature_key', null),
      ])

    const counts = { admins: 0, staff: 0, teachers: 0, students: 0, classes: 0 }
    const studentsByOrg = new Map<string, number>()
    const teachersByOrg = new Map<string, number>()
    for (const row of profilesRes.data ?? []) {
      if (row.role === 'campus_admin') counts.admins++
      else if (row.role === 'teacher') {
        counts.teachers++
        if (row.org_id) teachersByOrg.set(row.org_id, (teachersByOrg.get(row.org_id) ?? 0) + 1)
      } else if (row.role === 'student') {
        counts.students++
        if (row.org_id) studentsByOrg.set(row.org_id, (studentsByOrg.get(row.org_id) ?? 0) + 1)
      } else if (
        row.role === 'academic_staff' ||
        row.role === 'admission_staff' ||
        row.role === 'accountant'
      ) {
        counts.staff++
      }
    }
    counts.classes = classesRes.count ?? 0

    const children = (childrenRes.data ?? []).map((child) => ({
      id: child.id,
      name: child.name,
      type: child.type as OrgType,
      parent_id: (child.parent_id as string | null) ?? null,
      students: studentsByOrg.get(child.id) ?? 0,
      teachers: teachersByOrg.get(child.id) ?? 0,
    }))

    const license = {
      planName: licenseRes.data?.plan_name ?? 'Gói đầy đủ',
      moduleKeys: licenseRes.data ? ((licenseRes.data.module_keys as string[]) ?? []) : null,
      maxStudents: licenseRes.data?.max_students ?? null,
      validUntil: licenseRes.data?.valid_until ?? null,
      status: licenseRes.data?.status ?? 'active',
    }

    // Module bị TẮT với đơn vị này = flag global HOẶC flag đúng org
    const offModules = Array.from(
      new Set(
        (flagsRes.data ?? [])
          .filter((f) => f.org_id === null || f.org_id === orgId)
          .map((f) => f.module_key as string)
          .filter((key) => MODULE_CATALOG.some((m) => m.key === key))
      )
    )

    return {
      org: {
        id: org.id,
        name: org.name,
        type: org.type as OrgType,
        slug: (org.slug as string | null) ?? null,
      },
      counts,
      children,
      license,
      offModules,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi tải hồ sơ đơn vị.',
    }
  }
}

// ============================================================
// QUẢN LÝ ADMIN ĐƠN VỊ (Super Admin) — thêm/sửa/xóa tài khoản
// campus_admin của từng Đơn vị khách hàng + thông tin người liên hệ.
// Pattern giống campus-admin/users: Zod -> xác thực quyền -> Admin client.
// ============================================================

export type UnitAdminRow = {
  id: string
  fullName: string
  email: string
  phone: string | null
  orgId: string
  orgName: string
  createdAt: string | null
}

export type UnitContact = { name: string; email: string; phone: string }

export type UnitAdminsData =
  | { error: string }
  | { error?: undefined; admins: UnitAdminRow[]; contact: UnitContact | null }

/** Cửa xác thực chung: super_admin (mọi Đơn vị) hoặc campus_admin (cây của mình) */
async function requireUnitAdminManager(
  orgId: string
): Promise<{ error: string } | { error?: undefined; userId: string }> {
  const auth = await requireOrgManager()
  if (auth.error !== undefined) return { error: auth.error }
  if (!inScope(auth, orgId)) {
    return { error: 'TỪ CHỐI: Đơn vị này nằm ngoài phạm vi quản lý của bạn.' }
  }
  return { userId: auth.userId }
}

export async function getUnitAdmins(orgId: string): Promise<UnitAdminsData> {
  if (!z.string().uuid().safeParse(orgId).success) {
    return { error: 'Đơn vị không hợp lệ.' }
  }
  try {
    const gate = await requireUnitAdminManager(orgId)
    if (gate.error !== undefined) return { error: gate.error }

    const admin = createAdminClient()
    const subtreeIds = await getDescendantOrgIds(admin, orgId)

    const [adminsRes, orgsRes, settingsRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, email, phone, org_id, created_at')
        .eq('role', 'campus_admin')
        .in('org_id', subtreeIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      admin.from('organizations').select('id, name').in('id', subtreeIds),
      admin.from('org_settings').select('config').eq('org_id', orgId).maybeSingle(),
    ])

    const orgNameById = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name]))
    const admins: UnitAdminRow[] = (adminsRes.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name ?? '',
      email: row.email ?? '',
      phone: (row.phone as string | null) ?? null,
      orgId: row.org_id ?? orgId,
      orgName: orgNameById.get(row.org_id ?? '') ?? '',
      createdAt: (row.created_at as string | null) ?? null,
    }))

    const rawContact = (settingsRes.data?.config as Record<string, unknown> | null)
      ?.unit_contact as Partial<UnitContact> | undefined
    const contact: UnitContact | null = rawContact
      ? {
          name: String(rawContact.name ?? ''),
          email: String(rawContact.email ?? ''),
          phone: String(rawContact.phone ?? ''),
        }
      : null

    return { admins, contact }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tải danh sách Admin.',
    }
  }
}

/** Thêm Admin Đơn vị: tạo auth user + profile role campus_admin gắn vào Đơn vị */
export async function createUnitAdmin(formData: FormData): Promise<ActionResult> {
  const parsed = unitAdminCreateSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const gate = await requireUnitAdminManager(parsed.data.orgId)
    if (gate.error !== undefined) return { error: gate.error }

    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('id')
      .eq('id', parsed.data.orgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!org) return { error: 'Đơn vị không tồn tại hoặc đã bị xóa.' }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    })
    if (createError || !created.user) {
      return { error: `Không tạo được tài khoản: ${createError?.message ?? 'không xác định'}` }
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      role: 'campus_admin',
      org_id: parsed.data.orgId,
    })
    if (profileError) {
      // Rollback: không để auth user mồ côi
      await admin.auth.admin.deleteUser(created.user.id)
      return { error: `Không tạo được hồ sơ Admin: ${profileError.message}` }
    }

    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Kiểm tra target là campus_admin còn hiệu lực TRONG phạm vi người gọi */
async function requireManageableUnitAdmin(
  userId: string
): Promise<{ error: string } | { error?: undefined; orgId: string }> {
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!target) return { error: 'Tài khoản không tồn tại hoặc đã bị xóa.' }
  if (target.role !== 'campus_admin') {
    return { error: 'Chỉ thao tác được với tài khoản Admin Đơn vị (campus_admin).' }
  }
  if (!target.org_id) return { error: 'Tài khoản chưa gắn Đơn vị.' }
  const gate = await requireUnitAdminManager(target.org_id)
  if (gate.error !== undefined) return { error: gate.error }
  return { orgId: target.org_id }
}

/** Sửa Admin Đơn vị: họ tên, SĐT, và (tùy chọn) đặt lại mật khẩu */
export async function updateUnitAdmin(formData: FormData): Promise<ActionResult> {
  const parsed = unitAdminUpdateSchema.safeParse({
    userId: String(formData.get('userId') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    newPassword: String(formData.get('newPassword') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const gate = await requireManageableUnitAdmin(parsed.data.userId)
    if (gate.error !== undefined) return { error: gate.error }

    const admin = createAdminClient()
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        phone: parsed.data.phone || null,
      })
      .eq('id', parsed.data.userId)
    if (profileError) return { error: `Không cập nhật được hồ sơ: ${profileError.message}` }

    if (parsed.data.newPassword) {
      const { error: passError } = await admin.auth.admin.updateUserById(
        parsed.data.userId,
        { password: parsed.data.newPassword }
      )
      if (passError) return { error: `Không đổi được mật khẩu: ${passError.message}` }
    }

    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Xóa (mềm) Admin Đơn vị + khóa đăng nhập. Chặn xóa Admin CUỐI CÙNG của Đơn vị. */
export async function deleteUnitAdmin(userId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(userId).success) {
    return { error: 'Tài khoản không hợp lệ.' }
  }
  try {
    const gate = await requireManageableUnitAdmin(userId)
    if (gate.error !== undefined) return { error: gate.error }

    const admin = createAdminClient()
    // Không để Đơn vị "vô chủ": phải còn ít nhất 1 admin khác trong cây
    const subtreeIds = await getDescendantOrgIds(admin, gate.orgId)
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'campus_admin')
      .in('org_id', subtreeIds)
      .is('deleted_at', null)
    if ((count ?? 0) <= 1) {
      return {
        error:
          'Đây là Admin CUỐI CÙNG của Đơn vị — hãy tạo Admin mới trước rồi mới xóa, để Đơn vị không bị vô chủ.',
      }
    }

    const { error: deleteError } = await admin
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId)
    if (deleteError) return { error: `Không xóa được tài khoản: ${deleteError.message}` }

    // Soft delete nhưng khóa cửa thật: ban ~100 năm
    await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Lưu/đổi NGƯỜI LIÊN HỆ của Đơn vị (org_settings.config.unit_contact) */
export async function saveUnitContact(formData: FormData): Promise<ActionResult> {
  const orgId = String(formData.get('orgId') ?? '')
  if (!z.string().uuid().safeParse(orgId).success) return { error: 'Đơn vị không hợp lệ.' }
  const name = String(formData.get('contactName') ?? '').trim().slice(0, 120)
  const email = String(formData.get('contactEmail') ?? '').trim().slice(0, 160)
  const phone = String(formData.get('contactPhone') ?? '').trim().slice(0, 20)

  try {
    const gate = await requireUnitAdminManager(orgId)
    if (gate.error !== undefined) return { error: gate.error }

    const admin = createAdminClient()
    // Merge vào config hiện có, không ghi đè các key khác
    const { data: existing } = await admin
      .from('org_settings')
      .select('config')
      .eq('org_id', orgId)
      .maybeSingle()
    const config = {
      ...((existing?.config as Record<string, unknown>) ?? {}),
      unit_contact: { name, email, phone },
    }
    const { error } = await admin
      .from('org_settings')
      .upsert({ org_id: orgId, config }, { onConflict: 'org_id' })
    if (error) return { error: `Không lưu được người liên hệ: ${error.message}` }

    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
