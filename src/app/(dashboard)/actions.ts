'use server'

import { createClient } from '@/lib/supabase/server'

/** Học phí trung bình MOCK (chưa có bảng enrollments/invoices) */
const MOCK_TUITION_PER_STUDENT = 1_500_000

export type ChildOrgStat = {
  orgId: string
  name: string
  students: number
}

export type DashboardStats = {
  activeClasses: number
  totalStudents: number
  /** Doanh thu dự kiến tháng = totalStudents x học phí mock (chưa có bảng invoices) */
  projectedRevenue: number
  /** So sánh học viên giữa các nhánh TRỰC THUỘC (mỗi nhánh đã cộng dồn subtree của nó) */
  childrenStats: ChildOrgStat[]
}

type OrgRow = { id: string; name: string; parent_id: string | null }

/**
 * Thống kê ROLL-UP cho dashboard: đếm CỘNG DỒN toàn bộ org con/cháu
 * của orgId (dùng RPC get_descendant_org_ids), không chỉ riêng orgId.
 */
export async function getDashboardStats(
  orgId: string | null
): Promise<{ data: DashboardStats | null; error?: string }> {
  if (!orgId) {
    return { data: null, error: 'Chưa chọn tổ chức (org_id trống).' }
  }

  try {
    const supabase = createClient()

    // [SECURITY AUDIT] Bắt buộc đăng nhập + org đích phải trong subtree của user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { data: null, error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }
    const { data: inScope } = await supabase.rpc('is_org_in_my_subtree', {
      p_target_org_id: orgId,
    })
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role !== 'super_admin' && inScope !== true) {
      return { data: null, error: 'TỪ CHỐI: Cơ sở này không thuộc phạm vi của bạn.' }
    }

    // 1. Toàn bộ org trong subtree
    const { data: subtreeIds, error: rpcError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (rpcError) {
      return { data: null, error: `Lỗi truy vấn cây tổ chức: ${rpcError.message}` }
    }
    const ids = (subtreeIds ?? []) as string[]
    if (!ids.includes(orgId)) ids.push(orgId)

    // 2. Chạy song song: danh sách org (để dựng cây con), số lớp đang mở, học viên theo org
    const today = new Date().toISOString().slice(0, 10)
    const [orgsResult, classesResult, studentsResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, parent_id')
        .in('id', ids)
        .is('deleted_at', null),
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .in('org_id', ids)
        .is('deleted_at', null)
        .or(`end_date.is.null,end_date.gte.${today}`),
      supabase
        .from('profiles')
        .select('org_id')
        .eq('role', 'student')
        .in('org_id', ids)
        .is('deleted_at', null),
    ])

    const firstError = orgsResult.error ?? classesResult.error ?? studentsResult.error
    if (firstError) {
      return { data: null, error: `Lỗi tải thống kê: ${firstError.message}` }
    }

    const orgs = (orgsResult.data ?? []) as OrgRow[]
    const activeClasses = classesResult.count ?? 0

    // Số học viên theo từng org (chưa cộng dồn)
    const studentCountByOrg = new Map<string, number>()
    for (const row of (studentsResult.data ?? []) as { org_id: string | null }[]) {
      if (!row.org_id) continue
      studentCountByOrg.set(row.org_id, (studentCountByOrg.get(row.org_id) ?? 0) + 1)
    }
    const totalStudents = [...studentCountByOrg.values()].reduce((a, b) => a + b, 0)

    // 3. Roll-up cho từng nhánh TRỰC THUỘC: BFS trên adjacency parent_id
    const childrenByParent = new Map<string, OrgRow[]>()
    for (const org of orgs) {
      if (!org.parent_id) continue
      const list = childrenByParent.get(org.parent_id) ?? []
      list.push(org)
      childrenByParent.set(org.parent_id, list)
    }

    function sumSubtreeStudents(rootId: string): number {
      let sum = studentCountByOrg.get(rootId) ?? 0
      for (const child of childrenByParent.get(rootId) ?? []) {
        sum += sumSubtreeStudents(child.id)
      }
      return sum
    }

    const childrenStats: ChildOrgStat[] = (childrenByParent.get(orgId) ?? [])
      .map((child) => ({
        orgId: child.id,
        name: child.name,
        students: sumSubtreeStudents(child.id),
      }))
      .sort((a, b) => b.students - a.students)

    return {
      data: {
        activeClasses,
        totalStudents,
        projectedRevenue: totalStudents * MOCK_TUITION_PER_STUDENT,
        childrenStats,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { data: null, error: `Không thể kết nối database: ${message}` }
  }
}
