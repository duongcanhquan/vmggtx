'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateOrgScopeCache } from '@/lib/utils/orgScope'
import { isMenuKey, type MenuKey } from '@/lib/auth/menuRegistry'
import { slugifyOrgName } from '@/lib/utils/orgSlug'
import {
  provisionCampusSchema,
  saveLicenseSchema,
  zodFail,
  type ActionResult,
} from '@/lib/validation/schemas'

// ============================================================
// TẦNG LICENSE (/admin/licenses) - CHỈ SUPER ADMIN
// - getLicenseAdminData: danh sách cơ sở + license + sĩ số hiện tại.
// - saveLicense: gán/sửa gói (module, hạn, giới hạn HV, trạng thái).
// - provisionCampus: WIZARD khởi tạo cơ sở trọn gói trong 1 phát:
//   tạo org (type campus) -> gán license -> tạo tài khoản admin cơ sở.
//   Có rollback từng bước để không sinh dữ liệu mồ côi.
// ============================================================

export interface LicenseRow {
  orgId: string
  planName: string
  moduleKeys: string[]
  maxStudents: number | null
  validUntil: string | null
  status: 'active' | 'suspended'
}

export interface CampusLicenseRow {
  id: string
  name: string
  parentName: string | null
  /** Slug cổng /coso/{slug} — null nếu chưa chạy 045 */
  slug: string | null
  studentCount: number
  license: LicenseRow | null
}

export type LicenseAdminData =
  | { error: string }
  | {
      error?: undefined
      campuses: CampusLicenseRow[]
      /** org có thể làm CHA của cơ sở mới (gốc hq / cụm vùng) */
      parentOptions: { id: string; name: string; type: string }[]
      /** true khi bảng tenant_licenses chưa tồn tại (chưa chạy migration 044) */
      migrationMissing: boolean
    }

async function requireSuper(): Promise<{ error: string } | { error?: undefined; userId: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (profile?.role !== 'super_admin') {
    return { error: 'TỪ CHỐI: Chỉ Super Admin được quản lý gói dịch vụ.' }
  }
  return { userId: user.id }
}

/** Lọc + chuẩn hóa module keys từ client: chỉ nhận key hợp lệ, cấm settings_global */
function sanitizeModuleKeys(raw: string[]): MenuKey[] {
  const keys = raw.filter(isMenuKey).filter((key) => key !== 'settings_global')
  return [...new Set(keys)]
}

export async function getLicenseAdminData(): Promise<LicenseAdminData> {
  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const admin = createAdminClient()
    let orgs: {
      id: string
      name: string
      type: string
      parent_id: string | null
      slug?: string | null
    }[] = []
    {
      const withSlug = await admin
        .from('organizations')
        .select('id, name, type, parent_id, slug')
        .is('deleted_at', null)
        .order('name')
      if (
        withSlug.error &&
        /slug|42703|PGRST204|does not exist|schema cache/i.test(withSlug.error.message)
      ) {
        const fallback = await admin
          .from('organizations')
          .select('id, name, type, parent_id')
          .is('deleted_at', null)
          .order('name')
        if (fallback.error) {
          return { error: `Không tải được cây tổ chức: ${fallback.error.message}` }
        }
        orgs = fallback.data ?? []
      } else if (withSlug.error) {
        return { error: `Không tải được cây tổ chức: ${withSlug.error.message}` }
      } else {
        orgs = withSlug.data ?? []
      }
    }

    const licensesRes = await admin
      .from('tenant_licenses')
      .select('org_id, plan_name, module_keys, max_students, valid_until, status')
    const migrationMissing = Boolean(licensesRes.error)
    const byId = new Map(orgs.map((org) => [org.id, org]))
    const childrenOf = new Map<string, string[]>()
    for (const org of orgs) {
      if (!org.parent_id) continue
      const list = childrenOf.get(org.parent_id) ?? []
      list.push(org.id)
      childrenOf.set(org.parent_id, list)
    }

    // Đếm HV phân trang (PostgREST mặc định cắt 1000 dòng) rồi cộng theo SUBTREE
    const directCount = new Map<string, number>()
    {
      let from = 0
      for (;;) {
        const { data: page } = await admin
          .from('profiles')
          .select('org_id')
          .eq('role', 'student')
          .is('deleted_at', null)
          .range(from, from + 999)
        if (!page || page.length === 0) break
        for (const row of page) {
          if (row.org_id) {
            directCount.set(row.org_id, (directCount.get(row.org_id) ?? 0) + 1)
          }
        }
        if (page.length < 1000) break
        from += 1000
      }
    }
    function subtreeCount(orgId: string, visited = new Set<string>()): number {
      if (visited.has(orgId)) return 0
      visited.add(orgId)
      let total = directCount.get(orgId) ?? 0
      for (const childId of childrenOf.get(orgId) ?? []) {
        total += subtreeCount(childId, visited)
      }
      return total
    }

    const licenseByOrg = new Map<string, LicenseRow>()
    for (const row of licensesRes.data ?? []) {
      licenseByOrg.set(row.org_id, {
        orgId: row.org_id,
        planName: row.plan_name,
        moduleKeys: (row.module_keys as string[]) ?? [],
        maxStudents: row.max_students ?? null,
        validUntil: row.valid_until ?? null,
        status: row.status === 'suspended' ? 'suspended' : 'active',
      })
    }

    const campuses: CampusLicenseRow[] = orgs
      .filter((org) => org.type === 'campus')
      .map((org) => ({
        id: org.id,
        name: org.name,
        parentName: org.parent_id ? (byId.get(org.parent_id)?.name ?? null) : null,
        slug: org.slug ?? null,
        studentCount: subtreeCount(org.id),
        license: licenseByOrg.get(org.id) ?? null,
      }))

    const parentOptions = orgs
      .filter((org) => org.type === 'hq' || org.type === 'region')
      .map((org) => ({ id: org.id, name: org.name, type: org.type }))

    return { campuses, parentOptions, migrationMissing }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi tải dữ liệu license.',
    }
  }
}

export async function saveLicense(formData: FormData): Promise<ActionResult> {
  const parsed = saveLicenseSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    planName: String(formData.get('planName') ?? ''),
    moduleKeys: formData.getAll('moduleKeys').map(String),
    maxStudents: String(formData.get('maxStudents') ?? ''),
    validUntil: String(formData.get('validUntil') ?? ''),
    status: String(formData.get('status') ?? 'active'),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const moduleKeys = sanitizeModuleKeys(parsed.data.moduleKeys)
    if (moduleKeys.length === 0) return { error: 'Phải chọn ít nhất 1 module hợp lệ.' }

    const admin = createAdminClient()
    const { error } = await admin.from('tenant_licenses').upsert(
      {
        org_id: parsed.data.orgId,
        plan_name: parsed.data.planName,
        module_keys: moduleKeys,
        max_students: parsed.data.maxStudents === '' ? null : Number(parsed.data.maxStudents),
        valid_until: parsed.data.validUntil === '' ? null : parsed.data.validUntil,
        status: parsed.data.status,
        created_by: auth.userId,
      },
      { onConflict: 'org_id' }
    )
    if (error) {
      if (/tenant_licenses/.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
        return { error: 'Chưa chạy migration 044_tenant_licenses.sql trên database. Hãy chạy trong Supabase SQL Editor rồi thử lại.' }
      }
      return { error: `Không lưu được license: ${error.message}` }
    }

    revalidatePath('/admin/licenses')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định khi lưu license.' }
  }
}

export async function setLicenseStatus(
  orgId: string,
  status: 'active' | 'suspended'
): Promise<ActionResult> {
  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const admin = createAdminClient()
    const { error } = await admin
      .from('tenant_licenses')
      .update({ status })
      .eq('org_id', orgId)
    if (error) return { error: `Không đổi được trạng thái: ${error.message}` }

    revalidatePath('/admin/licenses')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * WIZARD "Khởi tạo cơ sở trọn gói": org + license + admin cơ sở trong 1 thao tác.
 * Rollback ngược khi bước sau thất bại (không để org/license/account mồ côi).
 */
export type ProvisionCampusResult =
  | { error: string }
  | {
      error?: undefined
      /** VD: /coso/cau-giay — gửi cho admin cơ sở đăng nhập */
      portalPath: string
      slug: string | null
      campusName: string
      adminEmail: string
    }

export async function provisionCampus(
  formData: FormData
): Promise<ProvisionCampusResult> {
  const parsed = provisionCampusSchema.safeParse({
    campusName: String(formData.get('campusName') ?? ''),
    parentId: String(formData.get('parentId') ?? ''),
    planName: String(formData.get('planName') ?? ''),
    moduleKeys: formData.getAll('moduleKeys').map(String),
    maxStudents: String(formData.get('maxStudents') ?? ''),
    validUntil: String(formData.get('validUntil') ?? ''),
    adminEmail: String(formData.get('adminEmail') ?? ''),
    adminPassword: String(formData.get('adminPassword') ?? ''),
    adminFullName: String(formData.get('adminFullName') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const moduleKeys = sanitizeModuleKeys(parsed.data.moduleKeys)
    if (moduleKeys.length === 0) return { error: 'Phải chọn ít nhất 1 module cho gói.' }

    const admin = createAdminClient()

    // Đơn vị cha: chọn từ form hoặc mặc định là GỐC hệ thống (hq)
    let parentId = parsed.data.parentId
    if (!parentId) {
      const { data: root } = await admin
        .from('organizations')
        .select('id')
        .is('parent_id', null)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (!root) return { error: 'Không tìm thấy đơn vị gốc của hệ thống.' }
      parentId = root.id
    } else {
      const { data: parent } = await admin
        .from('organizations')
        .select('id, type')
        .eq('id', parentId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!parent) return { error: 'Đơn vị cha không tồn tại hoặc đã xóa.' }
      if (parent.type !== 'hq' && parent.type !== 'region') {
        return { error: 'Cơ sở mới chỉ được gắn dưới Trụ sở hoặc Cụm/Vùng.' }
      }
    }

    // BƯỚC 1: tạo cơ sở (+ slug cổng /coso/[slug] nếu đã có cột 045)
    const baseSlug = slugifyOrgName(parsed.data.campusName)
    let campusSlug = baseSlug
    let slugColumnReady = true
    for (let n = 2; n < 40; n++) {
      const { data: clash, error: clashErr } = await admin
        .from('organizations')
        .select('id')
        .eq('slug', campusSlug)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (clashErr && /slug|42703|PGRST204|does not exist|schema cache/i.test(clashErr.message)) {
        slugColumnReady = false
        break
      }
      if (!clash) break
      campusSlug = `${baseSlug.slice(0, 40)}-${n}`
    }

    let newOrgId: string
    let savedSlug: string | null = slugColumnReady ? campusSlug : null
    const { data: newOrg, error: orgError } = await admin
      .from('organizations')
      .insert({
        name: parsed.data.campusName,
        type: 'campus',
        parent_id: parentId,
        ...(slugColumnReady ? { slug: campusSlug } : {}),
      })
      .select('id, slug')
      .single()

    if (
      orgError &&
      /slug|42703|PGRST204|does not exist|schema cache/i.test(orgError.message)
    ) {
      // Fail-soft: DB chưa có cột slug → tạo lại không slug
      const retry = await admin
        .from('organizations')
        .insert({ name: parsed.data.campusName, type: 'campus', parent_id: parentId })
        .select('id')
        .single()
      if (retry.error || !retry.data) {
        return { error: `Không tạo được cơ sở: ${retry.error?.message ?? 'không xác định'}` }
      }
      newOrgId = retry.data.id
      savedSlug = null
    } else if (orgError || !newOrg) {
      return { error: `Không tạo được cơ sở: ${orgError?.message ?? 'không xác định'}` }
    } else {
      newOrgId = newOrg.id
      savedSlug = (newOrg as { slug?: string | null }).slug ?? savedSlug
    }

    // BƯỚC 2: gán license
    const { error: licenseError } = await admin.from('tenant_licenses').insert({
      org_id: newOrgId,
      plan_name: parsed.data.planName,
      module_keys: moduleKeys,
      max_students: parsed.data.maxStudents === '' ? null : Number(parsed.data.maxStudents),
      valid_until: parsed.data.validUntil === '' ? null : parsed.data.validUntil,
      status: 'active',
      created_by: auth.userId,
    })
    if (licenseError) {
      await admin.from('organizations').delete().eq('id', newOrgId) // rollback
      if (/does not exist|schema cache/i.test(licenseError.message)) {
        return { error: 'Chưa chạy migration 044_tenant_licenses.sql trên database. Hãy chạy trong Supabase SQL Editor rồi thử lại.' }
      }
      return { error: `Không gán được license: ${licenseError.message}` }
    }

    // BƯỚC 3: tạo tài khoản admin cơ sở
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: parsed.data.adminEmail,
      password: parsed.data.adminPassword,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.adminFullName },
    })
    if (createError || !created.user) {
      await admin.from('tenant_licenses').delete().eq('org_id', newOrgId)
      await admin.from('organizations').delete().eq('id', newOrgId)
      return { error: `Không tạo được tài khoản admin: ${createError?.message ?? 'không xác định'}` }
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: created.user.id,
      full_name: parsed.data.adminFullName,
      email: parsed.data.adminEmail,
      role: 'campus_admin',
      org_id: newOrgId,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      await admin.from('tenant_licenses').delete().eq('org_id', newOrgId)
      await admin.from('organizations').delete().eq('id', newOrgId)
      return { error: `Không tạo được hồ sơ admin cơ sở: ${profileError.message}` }
    }

    invalidateOrgScopeCache()
    revalidatePath('/admin/licenses')
    revalidatePath('/admin/organizations')
    revalidatePath('/coso')
    return {
      portalPath: savedSlug ? `/coso/${savedSlug}` : '/coso',
      slug: savedSlug,
      campusName: parsed.data.campusName,
      adminEmail: parsed.data.adminEmail,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi khởi tạo cơ sở.',
    }
  }
}
