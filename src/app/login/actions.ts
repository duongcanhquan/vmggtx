'use server'

import { createAdminClient } from '@/lib/supabase/admin'
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
  .string({ required_error: 'Vui lòng nhập email, mã học viên hoặc số điện thoại.' })
  .trim()
  .min(2, 'Vui lòng nhập email, mã học viên hoặc số điện thoại.')
  .max(160, 'Thông tin đăng nhập quá dài.')

export type ResolveLoginResult =
  | { error: string }
  | { error?: undefined; email: string }

async function emailFromProfileId(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string
): Promise<ResolveLoginResult> {
  const { data: userData, error } = await admin.auth.admin.getUserById(profileId)
  if (error || !userData.user?.email) {
    return { error: 'Tài khoản chưa gắn email — vui lòng đăng nhập bằng email.' }
  }
  return { email: userData.user.email }
}

export async function resolveLoginEmail(identifier: string): Promise<ResolveLoginResult> {
  const parsed = identifierSchema.safeParse(identifier)
  if (!parsed.success) return zodFail(parsed.error)

  const value = parsed.data

  // Đã là email → dùng luôn (KHÔNG cần Admin / cookie)
  if (value.includes('@')) {
    const emailOk = z.string().email('Email không hợp lệ.').safeParse(value)
    if (!emailOk.success) return zodFail(emailOk.error)
    return { email: emailOk.data.toLowerCase() }
  }

  // Số điện thoại VN (10 số, bắt đầu 0)
  const digits = value.replace(/\D/g, '')
  if (/^0\d{9}$/.test(digits)) {
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
      return emailFromProfileId(admin, profile.id)
    } catch (error) {
      return {
        error:
          error instanceof Error && /SERVICE_ROLE|SECRET_KEY/i.test(error.message)
            ? 'Máy chủ thiếu SUPABASE_SERVICE_ROLE_KEY — hãy dùng email.'
            : error instanceof Error
              ? error.message
              : 'Không xác định được tài khoản.',
      }
    }
  }

  // Mã học viên (MaSV) — VD VM24-0001
  try {
    const admin = createAdminClient()
    const masv = value.toUpperCase()
    const { data: byExact } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .eq('MaSV', masv)
      .is('deleted_at', null)
      .maybeSingle()
    if (byExact) return emailFromProfileId(admin, byExact.id)

    // Thử khớp không phân biệt hoa thường qua ilike exact
    const { data: byIlike } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .ilike('MaSV', value)
      .is('deleted_at', null)
      .maybeSingle()
    if (byIlike) return emailFromProfileId(admin, byIlike.id)

    return {
      error: 'Không tìm thấy học viên với mã / SĐT này. Thử email hoặc mã học viên (MaSV).',
    }
  } catch (error) {
    return {
      error:
        error instanceof Error && /SERVICE_ROLE|SECRET_KEY/i.test(error.message)
          ? 'Máy chủ thiếu SUPABASE_SERVICE_ROLE_KEY — hãy dùng email.'
          : error instanceof Error
            ? error.message
            : 'Không xác định được tài khoản.',
    }
  }
}

/** Kiểu tương thích ActionResult cho form (không bắt buộc dùng) */
export type LoginActionResult = ActionResult

/**
 * Đọc role theo userId qua Admin — KHÔNG phụ thuộc cookie session.
 * Tránh race: client vừa signIn xong, cookie chưa kịp gửi kèm server action
 * → getUser() thất bại → cũ signOut() xóa phiên vừa tạo.
 */
export async function resolveRoleByUserId(
  userId: string
): Promise<{ error: string } | { error?: undefined; role: Role }> {
  const idOk = z.string().uuid().safeParse(userId)
  if (!idOk.success) return { error: 'User không hợp lệ.' }

  try {
    const admin = createAdminClient()
    const { data: profile, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', idOk.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { error: `Không đọc được hồ sơ: ${error.message}` }
    if (!profile) {
      return {
        error:
          'Tài khoản Auth tồn tại nhưng chưa có hồ sơ (profiles). Chạy seed hoặc tạo profile.',
      }
    }
    if (!isRole(profile.role)) {
      return {
        error: `Vai trò "${String(profile.role)}" không hợp lệ. Liên hệ Super Admin gán lại role.`,
      }
    }
    return { role: profile.role }
  } catch (error) {
    return {
      error:
        error instanceof Error && /SERVICE_ROLE|SECRET_KEY/i.test(error.message)
          ? 'Thiếu SUPABASE_SERVICE_ROLE_KEY trên Vercel — không đọc được vai trò.'
          : error instanceof Error
            ? error.message
            : 'Không xác định được vai trò.',
    }
  }
}

/** @deprecated Dùng resolveRoleByUserId — tránh phụ thuộc cookie ngay sau signIn */
export async function resolveRoleServerSide(): Promise<
  { error: string } | { error?: undefined; role: Role }
> {
  return {
    error:
      'API cũ đã thay bằng resolveRoleByUserId. Tải lại trang và thử đăng nhập lại.',
  }
}
