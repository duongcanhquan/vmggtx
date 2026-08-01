'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  CONFIGURABLE_ROLES,
  defaultKeysForRole,
  isMenuKey,
  type ConfigurableRole,
  type MenuKey,
} from '@/lib/auth/menuRegistry'
import type { ActionResult } from '@/lib/validation/schemas'

// ============================================================
// MA TRẬN PHÂN QUYỀN MENU (/admin/permissions)
// - super_admin: chọn cơ sở bất kỳ, cấp quyền cho CẢ campus_admin
//   lẫn các role dưới.
// - campus_admin: cấp quyền cho giáo vụ/tuyển sinh/kế toán/giáo viên
//   trong cơ sở mình, KHÔNG vượt quá quyền bản thân được cấp
//   (delegation cap) và không tự sửa quyền campus_admin.
// - Ghi đè lưu menu_permissions (043); kế thừa xuống toàn subtree.
// ============================================================

type ViewerAuth =
  | { error: string }
  | {
      error?: undefined
      userId: string
      role: 'super_admin' | 'campus_admin'
      orgId: string | null
    }

async function requireManager(): Promise<ViewerAuth> {
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

  if (profile?.role !== 'super_admin' && profile?.role !== 'campus_admin') {
    return { error: 'Chỉ Quản trị hệ thống hoặc Quản lý cơ sở được phân quyền.' }
  }
  return {
    userId: user.id,
    role: profile.role,
    orgId: (profile.org_id as string | null) ?? null,
  }
}

export type PermissionMatrixData = {
  viewerRole: 'super_admin' | 'campus_admin'
  /** Org đang cấu hình (ghi đè áp cho toàn subtree của org này) */
  orgId: string
  orgName: string
  /** super_admin: danh sách org để chọn; campus_admin: null (cố định org mình) */
  orgOptions: { id: string; name: string; type: string }[] | null
  /** Các role viewer được phép chỉnh */
  editableRoles: ConfigurableRole[]
  /** Ghi đè hiện có tại org này (không có = đang dùng mặc định) */
  overrides: Partial<Record<ConfigurableRole, MenuKey[]>>
  /** Trần ủy quyền của campus_admin (không cấp được key ngoài danh sách); null = không giới hạn */
  capKeys: MenuKey[] | null
}

export async function getPermissionMatrix(
  targetOrgId?: string
): Promise<{ error: string } | ({ error?: undefined } & PermissionMatrixData)> {
  const auth = await requireManager()
  if (auth.error !== undefined) return { error: auth.error }

  const supabase = createClient()

  // Xác định org đích
  let orgId: string
  let orgOptions: PermissionMatrixData['orgOptions'] = null

  if (auth.role === 'super_admin') {
    const { data: orgs, error } = await supabase
      .from('organizations')
      .select('id, name, type')
      .is('deleted_at', null)
      .order('path', { ascending: true })
    if (error) return { error: `Lỗi tải danh sách cơ sở: ${error.message}` }
    orgOptions = (orgs ?? []) as { id: string; name: string; type: string }[]
    if (orgOptions.length === 0) return { error: 'Chưa có cơ sở nào.' }
    orgId =
      targetOrgId && orgOptions.some((o) => o.id === targetOrgId)
        ? targetOrgId
        : orgOptions[0].id
  } else {
    if (!auth.orgId) return { error: 'Tài khoản chưa gắn cơ sở.' }
    orgId = auth.orgId
  }

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  // Ghi đè hiện có tại org đích (RLS đã giới hạn phạm vi đọc)
  const { data: rows, error: rowsError } = await supabase
    .from('menu_permissions')
    .select('role, menu_keys')
    .eq('org_id', orgId)
  if (rowsError) {
    return {
      error: `Lỗi tải phân quyền (đã chạy migration 043 chưa?): ${rowsError.message}`,
    }
  }

  const overrides: Partial<Record<ConfigurableRole, MenuKey[]>> = {}
  for (const row of rows ?? []) {
    const role = row.role as ConfigurableRole
    if (!CONFIGURABLE_ROLES.includes(role)) continue
    overrides[role] = Array.isArray(row.menu_keys)
      ? (row.menu_keys as unknown[]).filter(isMenuKey)
      : []
  }

  // Trần ủy quyền của campus_admin = quyền hiệu lực của CHÍNH họ
  let capKeys: MenuKey[] | null = null
  if (auth.role === 'campus_admin') {
    const { data: myKeys } = await supabase.rpc('get_my_menu_keys')
    capKeys = Array.isArray(myKeys)
      ? (myKeys as unknown[]).filter(isMenuKey)
      : defaultKeysForRole('campus_admin')
  }

  return {
    viewerRole: auth.role,
    orgId,
    orgName: (orgRow?.name as string | undefined) ?? 'Cơ sở',
    orgOptions,
    editableRoles:
      auth.role === 'super_admin'
        ? [...CONFIGURABLE_ROLES]
        : CONFIGURABLE_ROLES.filter((role) => role !== 'campus_admin'),
    overrides,
    capKeys,
  }
}

/**
 * Lưu ghi đè quyền menu cho 1 role tại 1 org.
 * keys = null -> XÓA ghi đè (quay về ma trận mặc định).
 */
export async function saveMenuPermissions(
  orgId: string,
  role: ConfigurableRole,
  keys: MenuKey[] | null
): Promise<ActionResult> {
  const auth = await requireManager()
  if (auth.error !== undefined) return { error: auth.error }
  if (!CONFIGURABLE_ROLES.includes(role)) return { error: 'Role không hợp lệ.' }

  const supabase = createClient()

  if (auth.role === 'campus_admin') {
    if (role === 'campus_admin') {
      return { error: 'Quyền của Quản lý cơ sở do Quản trị hệ thống cấp.' }
    }
    // Org đích phải thuộc subtree của mình
    const { data: inSubtree } = await supabase.rpc('is_org_in_my_subtree', {
      p_target_org_id: orgId,
    })
    if (inSubtree !== true) {
      return { error: 'Cơ sở này không thuộc phạm vi quản lý của bạn.' }
    }
  }

  if (keys === null) {
    const { error } = await supabase
      .from('menu_permissions')
      .delete()
      .eq('org_id', orgId)
      .eq('role', role)
    if (error) return { error: `Lỗi đặt lại mặc định: ${error.message}` }
  } else {
    const cleanKeys = keys.filter(isMenuKey)

    // Delegation cap: campus_admin không cấp được key mình không có
    if (auth.role === 'campus_admin') {
      const { data: myKeys } = await supabase.rpc('get_my_menu_keys')
      const cap: MenuKey[] = Array.isArray(myKeys)
        ? (myKeys as unknown[]).filter(isMenuKey)
        : defaultKeysForRole('campus_admin')
      const outOfCap = cleanKeys.filter((key) => !cap.includes(key))
      if (outOfCap.length > 0) {
        return {
          error: `Bạn không thể cấp quyền mình không có: ${outOfCap.join(', ')}`,
        }
      }
    }

    const { error } = await supabase.from('menu_permissions').upsert(
      {
        org_id: orgId,
        role,
        menu_keys: cleanKeys,
        updated_by: auth.userId,
      },
      { onConflict: 'org_id,role' }
    )
    if (error) return { error: `Lỗi lưu phân quyền: ${error.message}` }
  }

  revalidatePath('/admin/permissions')
  return {}
}
