'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, Loader2, Lock, LogIn, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHomePathForRole, isRole, type Role } from '@/lib/auth/roles'
import { AuthShell, AuthField, authBtnClass } from '@/components/auth/AuthShell'
import { resolveLoginEmail } from './actions'

// ============================================================
// CỔNG ĐĂNG NHẬP NHÀ TRƯỜNG & GIẢNG VIÊN (/login)
//
// TÁCH CỔNG: học viên KHÔNG đăng nhập tại đây - nếu tài khoản
// role=student đăng nhập, hệ thống đăng xuất ngay và mời sang
// Cổng Học viên (/student/login). Phụ huynh dùng /parent/login.
// Mỗi cổng độc lập để sau này chạy TÊN MIỀN RIÊNG.
// ============================================================

const loginFormSchema = z.object({
  identifier: z
    .string({ required_error: 'Vui lòng nhập email hoặc số điện thoại.' })
    .trim()
    .min(3, 'Vui lòng nhập email hoặc số điện thoại.'),
  password: z
    .string({ required_error: 'Vui lòng nhập mật khẩu.' })
    .min(6, 'Mật khẩu tối thiểu 6 ký tự.'),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

/** Đọc role từ JWT claims, fallback bảng profiles */
async function resolveRoleAfterLogin(
  supabase: ReturnType<typeof createClient>,
  accessToken: string | undefined,
  userId: string | undefined
): Promise<Role | null> {
  if (accessToken) {
    try {
      const payloadPart = accessToken.split('.')[1]
      const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))
      const payload = JSON.parse(json) as Record<string, unknown>
      if (isRole(payload.user_role)) return payload.user_role
    } catch {
      /* JWT không có claim -> fallback profiles */
    }
  }
  if (!userId) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  return isRole(profile?.role) ? profile.role : null
}

export default function LoginPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [wrongPortal, setWrongPortal] = useState(false)
  const [forgotHint, setForgotHint] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { identifier: '', password: '' },
  })

  async function onValid(values: LoginFormValues) {
    setServerError(null)
    setWrongPortal(false)

    // 1. Email/SĐT → email Auth
    const resolved = await resolveLoginEmail(values.identifier)
    if (resolved.error !== undefined) {
      setServerError(resolved.error)
      return
    }

    // 2. Đăng nhập Supabase
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password: values.password,
    })
    if (error) {
      setServerError(
        error.message.includes('Invalid login')
          ? 'Email/số điện thoại hoặc mật khẩu không đúng.'
          : error.message
      )
      return
    }

    // 3. TÁCH CỔNG: học viên không dùng cổng quản lý
    const role = await resolveRoleAfterLogin(
      supabase,
      data.session?.access_token,
      data.user?.id
    )
    if (role === 'student') {
      await supabase.auth.signOut()
      setWrongPortal(true)
      setServerError(
        'Đây là cổng dành cho Nhà trường & Giảng viên. Học viên vui lòng đăng nhập tại Cổng Học viên.'
      )
      return
    }

    // 4. Điều hướng thông minh theo role
    router.replace(getHomePathForRole(role))
    router.refresh()
  }

  return (
    <AuthShell
      theme="management"
      icon={GraduationCap}
      badge="Nhà trường · Giảng viên"
      title={
        <>
          EDU <span className="text-amber-300">SYSTEM</span>
        </>
      }
      subtitle="Hệ thống quản trị giáo dục đa cơ sở"
      footer={
        <>
          <p>
            Bạn là Học viên?{' '}
            <Link href="/student/login" className="font-bold text-white underline-offset-2 hover:underline">
              Vào Cổng Học viên
            </Link>
          </p>
          <p>
            Phụ huynh?{' '}
            <Link href="/parent/login" className="font-bold text-white underline-offset-2 hover:underline">
              Vào Sổ Liên Lạc Điện Tử
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit(onValid)} noValidate>
        <AuthField
          id="identifier"
          label="Email hoặc số điện thoại"
          icon={Mail}
          type="text"
          autoComplete="username"
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        <AuthField
          id="password"
          label="Mật khẩu"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {/* remember-forgot theo mẫu */}
        <div className="-mt-3 mb-4 flex items-center justify-between text-[13.5px] font-medium text-white">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" defaultChecked className="accent-white" />
            Ghi nhớ đăng nhập
          </label>
          <button
            type="button"
            onClick={() => setForgotHint((v) => !v)}
            className="cursor-pointer text-white underline-offset-2 hover:underline"
          >
            Quên mật khẩu?
          </button>
        </div>
        {forgotHint && (
          <p className="mb-3 rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs text-white/90">
            Liên hệ Quản lý cơ sở hoặc Quản trị hệ thống để được cấp lại mật khẩu.
          </p>
        )}

        {serverError && (
          <div
            role="alert"
            className="mb-4 space-y-2 rounded-md border border-rose-200/50 bg-rose-500/25 px-3.5 py-2.5 text-sm font-medium text-white"
          >
            <p>{serverError}</p>
            {wrongPortal && (
              <Link
                href="/student/login"
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#162938] hover:bg-white/90"
              >
                Sang Cổng Học viên
              </Link>
            )}
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className={authBtnClass}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogIn className="h-4 w-4" aria-hidden="true" />
          )}
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </AuthShell>
  )
}
