'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  GraduationCap,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Phone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHomePathForRole, isRole } from '@/lib/auth/roles'
import { resolveLoginEmail } from './actions'

// ============================================================
// LOGIN CHUNG — Smart Auth Routing (mọi đối tượng).
// Form: Email hoặc Số điện thoại + Password.
// Đăng nhập bằng supabase.auth.signInWithPassword; middleware
// (hoặc client sau login) đẩy user vào portal đúng role.
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

const inputClass =
  'min-h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-3.5 text-base text-foreground shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputErrorClass = 'border-red-400 focus-visible:ring-red-400'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

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

    // 3. Điều hướng thông minh theo role (JWT claims hoặc profiles)
    let role =
      data.session?.access_token
        ? (() => {
            try {
              const payloadPart = data.session!.access_token.split('.')[1]
              const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))
              const payload = JSON.parse(json) as Record<string, unknown>
              return isRole(payload.user_role) ? payload.user_role : null
            } catch {
              return null
            }
          })()
        : null

    if (!role && data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .is('deleted_at', null)
        .maybeSingle()
      role = isRole(profile?.role) ? profile.role : null
    }

    router.replace(getHomePathForRole(role))
    router.refresh()
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0c0a09] px-4 py-10">
      {/* Hào quang gold sang trọng */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#c9a227]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-[#8d6532]/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(201,162,39,0.14), transparent)',
        }}
      />

      <div className="relative w-full max-w-[420px]">
        <div className="rounded-[2rem] border border-[#c9a227]/25 bg-surface p-7 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.7)] sm:p-8">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#c9a227]/40 bg-gradient-to-br from-[#292524] to-[#0c0a09] text-[#e5c369] shadow-lg">
              <GraduationCap className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-foreground">
              GDTX <span className="text-gold-gradient">ERP</span>
            </h1>
            <div className="gold-hairline mx-auto mt-4 w-2/3" aria-hidden="true" />
          </div>

          <form onSubmit={handleSubmit(onValid)} noValidate className="mt-7 space-y-4">
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium">
                Email hoặc số điện thoại
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="email@gdtx.edu.vn hoặc 090…"
                  aria-invalid={!!errors.identifier}
                  className={`${inputClass} ${errors.identifier ? inputErrorClass : ''}`}
                  {...register('identifier')}
                />
              </div>
              <FieldError message={errors.identifier?.message} />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  className={`${inputClass} ${errors.password ? inputErrorClass : ''}`}
                  {...register('password')}
                />
              </div>
              <FieldError message={errors.password?.message} />
            </div>

            {serverError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
              >
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#292524] to-[#0c0a09] px-4 text-sm font-semibold text-[#f1dfae] ring-1 ring-[#c9a227]/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-8px_rgba(201,162,39,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-6 space-y-2 border-t border-border pt-5 text-center text-xs text-muted-foreground">
            <p className="flex items-center justify-center gap-1.5">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              Phụ huynh dùng Sổ Liên Lạc?{' '}
              <Link
                href="/parent/login"
                className="font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Đăng nhập bằng OTP
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
