/**
 * Reset mật khẩu TẤT CẢ auth users về mật khẩu chung (không xóa dữ liệu).
 *
 * Cách chạy:
 *   1. Tạo file .env.local (hoặc .env) trong thư mục project với:
 *        NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY=eyJ...   (service_role từ Supabase → Settings → API)
 *   2. npm run reset:passwords
 *
 * Mặc định mật khẩu mới: Demo@123456
 * Đổi bằng: RESET_PASSWORD='MatKhauMoi@123' npm run reset:passwords
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) loadEnv({ path, override: false })
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const NEW_PASSWORD = process.env.RESET_PASSWORD || 'Demo@123456'

if (!url || !serviceKey) {
  console.error(
    'Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY.\n' +
      'Tạo .env.local rồi chạy lại: npm run reset:passwords'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAllUsers() {
  const users: { id: string; email?: string }[] = []
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const batch = data.users ?? []
    users.push(...batch.map((u) => ({ id: u.id, email: u.email })))
    if (batch.length < perPage) break
    page += 1
  }
  return users
}

async function main() {
  console.log(`Reset mật khẩu tất cả user → "${NEW_PASSWORD}"`)
  console.log(`Supabase: ${url}`)
  const users = await listAllUsers()
  console.log(`Tìm thấy ${users.length} tài khoản.`)

  let ok = 0
  let fail = 0
  for (const user of users) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: NEW_PASSWORD,
      email_confirm: true,
    })
    if (error) {
      fail += 1
      console.error(`  ✗ ${user.email ?? user.id}: ${error.message}`)
    } else {
      ok += 1
      console.log(`  ✓ ${user.email ?? user.id}`)
    }
  }

  console.log(`\nXong: ${ok} thành công, ${fail} lỗi.`)
  console.log('Đăng nhập bằng email cũ + mật khẩu mới ở trên.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
