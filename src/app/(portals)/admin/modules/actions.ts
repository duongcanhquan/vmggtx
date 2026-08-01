'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMenuKey, type MenuKey } from '@/lib/auth/menuRegistry'
import { MODULE_BY_KEY } from '@/lib/licensing/moduleCatalog'
import type { ActionResult } from '@/lib/validation/schemas'

// ============================================================
// TRUNG TÂM MODULE (/admin/modules) - CHỈ SUPER ADMIN
// - getModuleCenterData: số liệu sử dụng từng module + trạng thái
//   công tắc (toàn hệ thống / theo cơ sở / theo tính năng con).
// - setModuleFlag: bật/tắt module hoặc 1 phần module. Chỉ lưu dòng
//   khi TẮT (mặc định mọi thứ bật) -> bật lại = xóa dòng.
// ============================================================

async function requireSuper(): Promise<
  { error: string } | { error?: undefined; userId: string }
> {
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
    return { error: 'TỪ CHỐI: Chỉ Super Admin được quản lý module.' }
  }
  return { userId: user.id }
}

/** Bảng đếm số bản ghi để "theo dõi hoạt động" của từng module */
const USAGE_SPECS: Partial<
  Record<MenuKey, { table: string; label: string; filter?: { column: string; value: string } }>
> = {
  students: { table: 'profiles', label: 'học viên', filter: { column: 'role', value: 'student' } },
  crm: { table: 'leads', label: 'lead tuyển sinh' },
  announcements: { table: 'announcements', label: 'thông báo' },
  classes: { table: 'classes', label: 'lớp học' },
  attendance: { table: 'attendance', label: 'lượt điểm danh' },
  staff_ops: { table: 'assessments', label: 'kỳ đánh giá/thi' },
  academic_warnings: { table: 'student_warnings', label: 'cảnh báo' },
  teacher_schedule: { table: 'class_sessions', label: 'buổi học' },
  teacher_requests: { table: 'teacher_requests', label: 'đơn từ' },
  evaluations: { table: 'evaluation_results', label: 'phiếu đánh giá' },
  staff_users: { table: 'teacher_contracts', label: 'hợp đồng nhân sự' },
  payroll_contracts: { table: 'payrolls', label: 'kỳ lương' },
  finance_invoices: { table: 'invoices', label: 'hóa đơn' },
  assets: { table: 'assets', label: 'tài sản' },
  ai_kb: { table: 'lesson_materials', label: 'đoạn tri thức AI' },
  settings_org: { table: 'org_settings', label: 'cơ sở đã cấu hình' },
  organizations: { table: 'organizations', label: 'đơn vị' },
  permissions: { table: 'menu_permissions', label: 'ghi đè phân quyền' },
}

export interface ModuleFlagRow {
  orgId: string | null
  moduleKey: string
  featureKey: string | null
}

export type ModuleCenterData =
  | { error: string }
  | {
      error?: undefined
      /** Cơ sở (type campus) để bật/tắt theo từng cơ sở */
      campuses: { id: string; name: string; licenseModules: string[] | null }[]
      /** Các dòng đang TẮT (global + per-org) */
      disabledFlags: ModuleFlagRow[]
      /** Số bản ghi theo module: key -> {count, label} (null = bảng chưa có) */
      usage: Record<string, { count: number; label: string } | null>
      /** true = chưa chạy migration 046 */
      migrationMissing: boolean
    }

export async function getModuleCenterData(): Promise<ModuleCenterData> {
  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    const admin = createAdminClient()

    // 1. Cơ sở + license (module đã cấp) — chạy song song với flags
    const [orgsRes, licensesRes, flagsRes] = await Promise.all([
      admin
        .from('organizations')
        .select('id, name, type')
        .eq('type', 'campus')
        .is('deleted_at', null)
        .order('name'),
      admin.from('tenant_licenses').select('org_id, module_keys'),
      admin
        .from('module_flags')
        .select('org_id, module_key, feature_key')
        .eq('enabled', false),
    ])

    if (orgsRes.error) {
      return { error: `Không tải được danh sách cơ sở: ${orgsRes.error.message}` }
    }

    const migrationMissing = Boolean(flagsRes.error)
    const licenseByOrg = new Map<string, string[]>()
    for (const row of licensesRes.data ?? []) {
      licenseByOrg.set(row.org_id, (row.module_keys as string[]) ?? [])
    }

    const campuses = (orgsRes.data ?? []).map((org) => ({
      id: org.id,
      name: org.name,
      licenseModules: licenseByOrg.get(org.id) ?? null,
    }))

    const disabledFlags: ModuleFlagRow[] = (flagsRes.data ?? []).map((row) => ({
      orgId: row.org_id ?? null,
      moduleKey: row.module_key,
      featureKey: row.feature_key ?? null,
    }))

    // 2. Số liệu sử dụng: đếm song song, bảng nào lỗi -> null (không vỡ trang)
    const usageEntries = await Promise.all(
      Object.entries(USAGE_SPECS).map(async ([key, spec]) => {
        try {
          let query = admin
            .from(spec.table)
            .select('*', { count: 'exact', head: true })
          if (spec.filter) query = query.eq(spec.filter.column, spec.filter.value)
          const { count, error } = await query
          if (error) return [key, null] as const
          return [key, { count: count ?? 0, label: spec.label }] as const
        } catch {
          return [key, null] as const
        }
      })
    )
    const usage = Object.fromEntries(usageEntries) as Record<
      string,
      { count: number; label: string } | null
    >

    return { campuses, disabledFlags, usage, migrationMissing }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tải Trung tâm Module.',
    }
  }
}

/**
 * Bật/tắt module hoặc 1 tính năng con.
 * - orgId null = TOÀN HỆ THỐNG; có = riêng cơ sở đó (và subtree).
 * - featureKey null = cả module; có = 1 phần của module.
 * - enabled true = BẬT (xóa dòng tắt); false = TẮT (ghi dòng).
 */
export async function setModuleFlag(input: {
  orgId: string | null
  moduleKey: string
  featureKey: string | null
  enabled: boolean
}): Promise<ActionResult> {
  try {
    const auth = await requireSuper()
    if (auth.error !== undefined) return { error: auth.error }

    if (!isMenuKey(input.moduleKey)) return { error: 'Module không hợp lệ.' }
    if (input.featureKey) {
      const info = MODULE_BY_KEY.get(input.moduleKey)
      if (!info?.features.some((f) => f.key === input.featureKey)) {
        return { error: 'Tính năng không thuộc module này.' }
      }
    }

    const admin = createAdminClient()

    // Xóa dòng cũ của đúng phạm vi (org + module + feature)
    let del = admin.from('module_flags').delete().eq('module_key', input.moduleKey)
    del = input.orgId ? del.eq('org_id', input.orgId) : del.is('org_id', null)
    del = input.featureKey
      ? del.eq('feature_key', input.featureKey)
      : del.is('feature_key', null)
    const { error: delError } = await del
    if (delError) {
      if (/module_flags/.test(delError.message) && /does not exist|schema cache/i.test(delError.message)) {
        return {
          error:
            'Chưa chạy migration 046_module_flags.sql trên database. Hãy chạy trong Supabase SQL Editor rồi thử lại.',
        }
      }
      return { error: `Không cập nhật được công tắc: ${delError.message}` }
    }

    if (!input.enabled) {
      const { error: insError } = await admin.from('module_flags').insert({
        org_id: input.orgId,
        module_key: input.moduleKey,
        feature_key: input.featureKey,
        enabled: false,
        updated_by: auth.userId,
      })
      if (insError) return { error: `Không tắt được: ${insError.message}` }
    }

    revalidatePath('/admin/modules')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
