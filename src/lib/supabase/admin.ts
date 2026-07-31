import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase ADMIN client (Service Role) - CHỈ ĐƯỢC DÙNG TRONG SERVER ACTIONS.
 *
 * - Bỏ qua RLS và có quyền gọi auth.admin.* (tạo user không cần xác nhận email).
 * - SUPABASE_SERVICE_ROLE_KEY tuyệt đối KHÔNG có prefix NEXT_PUBLIC_
 *   (không bao giờ được lộ xuống browser).
 * - Vì client này bỏ qua RLS, MỌI Server Action dùng nó BẮT BUỘC phải
 *   tự kiểm tra quyền trước (rpc is_authorized) theo Ma trận RBAC.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      'Thiếu biến môi trường SUPABASE_SERVICE_ROLE_KEY. Lấy tại Supabase Dashboard > Settings > API.'
    )
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
