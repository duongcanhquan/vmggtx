// ============================================================
// ENV SUPABASE - hỗ trợ CẢ 2 hệ key:
//   Hệ CŨ  : NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
//   Hệ MỚI : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)
//            + SUPABASE_SECRET_KEY (sb_secret_...)
// supabase-js nhận cả 2 dạng như nhau, chỉ khác tên biến.
// ============================================================

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL trong .env')
  return url
}

/** Key công khai cho browser/SSR (anon HOẶC publishable) */
export function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!key) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_SUPABASE_ANON_KEY (hoặc NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) trong .env'
    )
  }
  return key
}

/** Key bí mật server-side (service_role HOẶC secret). Trả null nếu chưa cấu hình. */
export function getSupabaseServiceKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null
  )
}
