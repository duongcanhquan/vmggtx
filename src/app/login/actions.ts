'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isRole, type Role } from '@/lib/auth/roles'
import { z } from 'zod'
import { zodFail, type ActionResult } from '@/lib/validation/schemas'

// ============================================================
// resolveLoginEmail — hỗ trợ form Login chung nhận Email HOẶC SĐT.
// Supabase Auth chỉ đăng nhập bằng email, nên nếu user gõ SĐT thì
// tra profiles.phone → auth.users.email (Service Role), rồi client
// gọi signInWithPassword với email đó.
// ============================================================

const identifierSchema = z
  .string({ required_error: 'Vui lòng nhập email hoặc số điện thoại.' })
  .trim()
  .min(3, 'Vui lòng nhập email hoặc số điện thoại.')
  .max(160, 'Thông tin đăng nhập quá dài.')

export type ResolveLoginResult =
  | { error: string }
  | { error?: undefined; email: string }

export async function resolveLoginEmail(identifier: string): Promise<ResolveLoginResult> {
  const parsed = identifierSchema.safeParse(identifier)
  if (!parsed.success) return zodFail(parsed.error)

  const value = parsed.data

  // Đã là email → dùng luôn
  if (value.includes('@')) {
    const emailOk = z.string().email('Email không hợp lệ.').safeParse(value)
    if (!emailOk.success) return zodFail(emailOk.error)
    return { email: emailOk.data.toLowerCase() }
  }

  // Số điện thoại VN (10 số, bắt đầu 0)
  const digits = value.replace(/\D/g, '')
  if (!/^0\d{9}$/.test(digits)) {
    return { error: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.' }
  }

  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', digits)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile) {
      return { error: 'Không tìm thấy tài khoản với số điện thoại này.' }
    }

    const { data: userData, error } = await admin.auth.admin.getUserById(profile.id)
    if (error || !userData.user?.email) {
      return { error: 'Tài khoản chưa gắn email — vui lòng đăng nhập bằng email.' }
    }
    return { email: userData.user.email }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Không xác định được tài khoản.',
    }
  }
}

/** Kiểu tương thích ActionResult cho form (không bắt buộc dùng) */
export type LoginActionResult = ActionResult

/**
 * Đọc role sau khi client vừa signIn — ưu tiên JWT, fallback profiles
 * qua Admin (tránh kẹt khi RLS/JWT hook chưa sẵn sàng).
 */
export async function resolveRoleServerSide(): Promise<
  { error: string } | { error?: undefined; role: Role }
> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const admin = createAdminClient()
    const { data: profile, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { error: `Không đọc được hồ sơ: ${error.message}` }
    if (!isRole(profile?.role)) {
      return {
        error:
          'Tài khoản chưa có vai trò hợp lệ trong hồ sơ. Liên hệ Super Admin để gán role.',
      }
    }
    return { role: profile.role }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Không xác định được vai trò.',
    }
  }
}
