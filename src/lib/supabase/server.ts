import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

// Supabase SSR client cho Server Components / Server Actions / Route Handlers.
// Theo .cursorrules: dùng client này cho FETCHING, Server Actions cho MUTATION.
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
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
}
