'use server'

import { createClient } from '@/lib/supabase/server'
import type { OrgFlat } from '@/lib/utils/org-tree'

/**
 * Lấy danh sách tổ chức DẠNG PHẲNG từ bảng `organizations`.
 * RLS phía Supabase tự cắt tỉa: user chỉ nhận về org mình + các org con/cháu,
 * nên client không cần (và không thể) lọc quyền.
 */
export async function getOrganizations(): Promise<{ data: OrgFlat[]; error?: string }> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, type, parent_id')
      .is('deleted_at', null)
      .order('name')

    if (error) {
      return { data: [], error: `Lỗi tải cây tổ chức: ${error.message}` }
    }
    return { data: (data ?? []) as OrgFlat[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { data: [], error: `Không thể kết nối database: ${message}` }
  }
}
