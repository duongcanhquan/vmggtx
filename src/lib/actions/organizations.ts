'use server'

import { createClient } from '@/lib/supabase/server'
import type { OrgFlat } from '@/lib/utils/org-tree'

/**
 * Lấy danh sách tổ chức DẠNG PHẲNG từ bảng `organizations`.
 * RLS phía Supabase tự cắt tỉa: user chỉ nhận về org mình + các org con/cháu,
 * nên client không cần (và không thể) lọc quyền.
 */
export async function getOrganizations(): Promise<{
  data: OrgFlat[]
  /** profiles.org_id của user đang đăng nhập — nguồn userOrgId (không dùng tree[0]) */
  userOrgId?: string | null
  error?: string
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    let userOrgId: string | null = null
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
      userOrgId = profile?.org_id ?? null
    }

    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, type, parent_id, logo_url, logo_key')
      .is('deleted_at', null)
      .order('name')

    if (error) {
      // Cột logo chưa có (chưa chạy 051) → fallback không logo
      if (/logo_url|logo_key|42703|PGRST204/i.test(error.message)) {
        const { data: fallback, error: err2 } = await supabase
          .from('organizations')
          .select('id, name, type, parent_id')
          .is('deleted_at', null)
          .order('name')
        if (err2) return { data: [], userOrgId, error: `Lỗi tải cây tổ chức: ${err2.message}` }
        return { data: (fallback ?? []) as OrgFlat[], userOrgId }
      }
      return { data: [], userOrgId, error: `Lỗi tải cây tổ chức: ${error.message}` }
    }
    return { data: (data ?? []) as OrgFlat[], userOrgId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { data: [], error: `Không thể kết nối database: ${message}` }
  }
}
