import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceKey, getSupabaseUrl } from './env'

/**
 * Supabase ADMIN client (Service Role / Secret key) - CHỈ DÙNG SERVER-SIDE.
 *
 * - Bỏ qua RLS và có quyền gọi auth.admin.* (tạo user không cần xác nhận email).
 * - Nhận SUPABASE_SERVICE_ROLE_KEY (hệ cũ) HOẶC SUPABASE_SECRET_KEY (hệ mới).
 *   Key này tuyệt đối KHÔNG có prefix NEXT_PUBLIC_ (không lộ xuống browser).
 * - Vì client này bỏ qua RLS, MỌI Server Action dùng nó BẮT BUỘC phải
 *   tự kiểm tra quyền trước (rpc is_authorized) theo Ma trận RBAC.
 */
export function createAdminClient() {
  const serviceRoleKey = getSupabaseServiceKey()

  if (!serviceRoleKey) {
    throw new Error(
      'Thiếu SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_SECRET_KEY). Lấy tại Supabase Dashboard > Settings > API.'
    )
  }

  return createSupabaseClient(
    getSupabaseUrl(),
    serviceRoleKey,
    {
      auth: {
        // Client máy chủ thuần: không lưu / không tự refresh session
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
