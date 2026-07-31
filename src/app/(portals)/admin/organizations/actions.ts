'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { zodFail, type ActionResult } from '@/lib/validation/schemas'
import type { OrgFlat, OrgType } from '@/lib/utils/org-tree'

// ============================================================
// QUẢN LÝ CƠ SỞ (/admin/organizations)
// - getOrgManagementData: cây tổ chức + đếm học viên/lớp mỗi đơn vị
//   (RLS tự cắt theo subtree; super_admin thấy tất cả).
// - createOrganization: chỉ SUPER ADMIN (khớp RLS orgs_superadmin_write).
//   Trigger DB (001) tự tính cột path ltree theo parent_id.
// ============================================================

export type OrgManagementRow = OrgFlat & {
  studentCount: number
  classCount: number
}

export type OrgManagementResult =
  | { error: string }
  | { error?: undefined; orgs: OrgManagementRow[]; isSuperAdmin: boolean }

export async function getOrgManagementData(): Promise<OrgManagementResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const [{ data: profile }, orgsRes, studentsRes, classesRes] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
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

    return { orgs, isSuperAdmin: profile?.role === 'super_admin' }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

const createOrgSchema = z.object({
  name: z
    .string({ required_error: 'Vui lòng nhập tên đơn vị.' })
    .trim()
    .min(3, 'Tên đơn vị tối thiểu 3 ký tự.')
    .max(120, 'Tên đơn vị tối đa 120 ký tự.')
    .regex(/^[^<>{};]*$/, 'Tên đơn vị chứa ký tự không hợp lệ.'),
  type: z.enum(['region', 'campus', 'branch'], {
    errorMap: () => ({ message: 'Loại đơn vị không hợp lệ.' }),
  }),
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
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    // [BẢO MẬT] Chỉ Super Admin được tạo đơn vị (khớp RLS)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'super_admin') {
      return { error: 'TỪ CHỐI: Chỉ Super Admin được tạo đơn vị mới.' }
    }

    const { data: parent } = await supabase
      .from('organizations')
      .select('id, type')
      .eq('id', parsed.data.parentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parent) return { error: 'Đơn vị cha không tồn tại.' }

    // Trigger DB tự tính path ltree từ parent_id (migration 001)
    const { error } = await supabase.from('organizations').insert({
      name: parsed.data.name,
      type: parsed.data.type as OrgType,
      parent_id: parsed.data.parentId,
    })
    if (error) return { error: `Không thể tạo đơn vị: ${error.message}` }

    revalidatePath('/admin/organizations')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi tạo đơn vị.',
    }
  }
}
