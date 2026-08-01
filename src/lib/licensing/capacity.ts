import type { SupabaseClient } from '@supabase/supabase-js'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// GIỚI HẠN SĨ SỐ THEO LICENSE (max_students - migration 044)
// Đếm học viên trong TOÀN SUBTREE của org giữ license (license đặt
// ở cơ sở gốc, áp cho mọi nhánh con). Fail-open khi chưa có license
// hoặc migration chưa chạy.
// ============================================================

type AdminClient = SupabaseClient

/** Tìm license của org gần nhất trên chuỗi tổ tiên (kể cả chính nó) */
export async function findLicenseForOrg(
  admin: AdminClient,
  orgId: string
): Promise<{ orgId: string; maxStudents: number | null } | null> {
  try {
    // Thu chuỗi tổ tiên: chính nó -> cha -> ... (tối đa 8 bậc)
    const chain: string[] = [orgId]
    let cursor = orgId
    for (let i = 0; i < 8; i++) {
      const { data } = await admin
        .from('organizations')
        .select('parent_id')
        .eq('id', cursor)
        .maybeSingle()
      const parentId = (data?.parent_id as string | null) ?? null
      if (!parentId) break
      chain.push(parentId)
      cursor = parentId
    }

    const { data: licenses, error } = await admin
      .from('tenant_licenses')
      .select('org_id, max_students')
      .in('org_id', chain)
    if (error || !licenses || licenses.length === 0) return null // fail-open

    // Gần nhất trên chuỗi thắng
    for (const id of chain) {
      const hit = licenses.find((row) => row.org_id === id)
      if (hit) return { orgId: hit.org_id, maxStudents: hit.max_students ?? null }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Kiểm tra còn chỗ thêm `addCount` học viên không.
 * Trả về null = OK, hoặc chuỗi thông báo lỗi tiếng Việt.
 */
export async function checkStudentCapacity(
  admin: AdminClient,
  orgId: string,
  addCount = 1
): Promise<string | null> {
  const license = await findLicenseForOrg(admin, orgId)
  if (!license || license.maxStudents === null) return null

  try {
    const subtreeIds = await getDescendantOrgIds(admin, license.orgId)
    const ids = subtreeIds.length > 0 ? subtreeIds : [license.orgId]
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .is('deleted_at', null)
      .in('org_id', ids)
    const current = count ?? 0
    if (current + addCount > license.maxStudents) {
      return `Vượt giới hạn gói dịch vụ: cơ sở đang có ${current}/${license.maxStudents} học viên, không thể thêm ${addCount} học viên mới. Vui lòng nâng cấp gói.`
    }
    return null
  } catch {
    return null // fail-open, không chặn nghiệp vụ vì lỗi kỹ thuật
  }
}
