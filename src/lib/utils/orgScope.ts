import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Cache subtree org ids (get_descendant_org_ids) trong bộ nhớ
// tiến trình server (Vercel lambda ấm / dev server).
//
// An toàn vì: kết quả CHỈ phụ thuộc orgId (cấu trúc cây tổ chức),
// KHÔNG phụ thuộc người dùng — RLS vẫn cắt dữ liệu ở tầng query.
// Cây tổ chức rất hiếm khi đổi -> TTL 5 phút là đủ tươi.
// ============================================================

const TTL_MS = 5 * 60_000
const cache = new Map<string, { ids: string[]; expiresAt: number }>()

/**
 * Trả về orgId + toàn bộ org con cháu (đã cache 5 phút).
 * Luôn có ít nhất [orgId] để `.in('org_id', ...)` không bị mảng rỗng.
 */
export async function getDescendantOrgIds(
  supabase: SupabaseClient,
  orgId: string
): Promise<string[]> {
  const hit = cache.get(orgId)
  if (hit && hit.expiresAt > Date.now()) return hit.ids

  const { data, error } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: orgId,
  })
  if (error) throw error

  const ids = (data ?? []).map((row: { id?: string } | string) =>
    typeof row === 'string' ? row : (row.id as string)
  )
  const result = ids.length > 0 ? ids : [orgId]
  cache.set(orgId, { ids: result, expiresAt: Date.now() + TTL_MS })
  return result
}

/** Xóa cache (gọi sau khi thêm/sửa/xóa organizations) */
export function invalidateOrgScopeCache() {
  cache.clear()
}
