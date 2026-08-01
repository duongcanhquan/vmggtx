import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

// Supabase SSR client cho Server Components / Server Actions / Route Handlers.
// Theo .cursorrules: dùng client này cho FETCHING, Server Actions cho MUTATION.
export function createClient() {
  const cookieStore = cookies()

  const client = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll được gọi từ Server Component: có thể bỏ qua
            // nếu đã có middleware refresh session.
          }
        },
      },
    }
  )

  // ============================================================
  // TĂNG TỐC TOÀN HỆ THỐNG: getUser() gốc gọi MẠNG tới Supabase Auth
  // (~100-300ms) và được ~70 server action gọi ở ĐẦU mỗi request.
  // Trong kiến trúc này, middleware đã refresh session và MỌI truy vấn
  // dữ liệu đều bị Postgres verify chữ ký JWT qua RLS — nên đọc user
  // từ session cookie (0ms, không round-trip) là đủ an toàn: JWT giả
  // sẽ bị database từ chối ở bước truy vấn ngay sau đó.
  // Gọi getUser(jwt) tường minh vẫn đi đường verify mạng như cũ.
  // ============================================================
  const networkGetUser = client.auth.getUser.bind(client.auth)
  client.auth.getUser = (async (jwt?: string) => {
    if (jwt) return networkGetUser(jwt)
    const {
      data: { session },
    } = await client.auth.getSession()
    if (session?.user) {
      return { data: { user: session.user }, error: null }
    }
    return networkGetUser()
  }) as typeof client.auth.getUser

  return client
}
