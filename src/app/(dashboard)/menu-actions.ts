'use server'

import { createClient } from '@/lib/supabase/server'
import { isMenuKey, type MenuKey } from '@/lib/auth/menuRegistry'

// ============================================================
// Quyền menu HIỆU LỰC của user hiện tại (cho sidebar).
// - null  = không có ghi đè -> dùng ma trận mặc định trong code.
// - array = danh sách key được cấp (override gần nhất trên cây org).
// FAIL-OPEN: lỗi / migration 043 chưa chạy -> null (ma trận mặc định),
// tầng chặn thật sự vẫn là middleware ROUTE_RULES theo role.
// ============================================================

export async function getMyMenuKeys(): Promise<MenuKey[] | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_my_menu_keys')
    if (error || !Array.isArray(data)) return null
    return data.filter(isMenuKey)
  } catch {
    return null
  }
}
