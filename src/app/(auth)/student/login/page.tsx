'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Building2,
  BookOpenCheck,
  HeartHandshake,
  Loader2,
  Lock,
  Mail,
  Rocket,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHomePathForRole, isRole, type Role } from '@/lib/auth/roles'
import { AuthShell } from '@/components/auth/AuthShell'
import { resolveLoginEmail } from '@/app/login/actions'

// ============================================================
// CỔNG ĐĂNG NHẬP HỌC VIÊN (/student/login) - TÁCH RIÊNG khỏi
// cổng quản lý (/login) và cổng phụ huynh (/parent/login) để
// sau này mỗi cổng chạy TÊN MIỀN RIÊNG.
//
// Chỉ tài khoản role=student (và super_admin để kiểm tra hệ
// thống) được vào. Nhân sự/giảng viên đăng nhập nhầm sẽ được
// mời sang cổng quản lý.
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
  'min-h-12 w-full rounded-xl border border-slate-200 bg-white/90 pl-10 pr-3.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
const inputErrorClass = 'border-red-400 focus-visible:ring-red-400'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

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
      /* fallback profiles */
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

export default function StudentLoginPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [wrongPortal, setWrongPortal] = useState(false)

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

    const resolved = await resolveLoginEmail(values.identifier)
    if (resolved.error !== undefined) {
      setServerError(resolved.error)
      return
    }

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

    // TÁCH CỔNG: chỉ học viên (super_admin được phép để kiểm tra)
    const role = await resolveRoleAfterLogin(
      supabase,
      data.session?.access_token,
      data.user?.id
    )
    if (role !== 'student' && role !== 'super_admin') {
      await supabase.auth.signOut()
      setWrongPortal(true)
      setServerError(
        'Đây là Cổng Học viên. Tài khoản của bạn thuộc khối Nhà trường/Giảng viên - vui lòng dùng cổng quản lý.'
      )
      return
    }

    router.replace(role === 'super_admin' ? getHomePathForRole(role) : '/portal')
    router.refresh()
  }

  return (
    <AuthShell
      theme="student"
      icon={Rocket}
      badge="Cổng Học viên"
      title={
        <>
          Học tập <span className="text-emerald-700">mỗi ngày</span>
        </>
      }
      subtitle="Bài giảng · Bài tập · Kiểm tra · Gia sư AI đồng hành"
      footer={
        <div className="space-y-2 text-sm">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/50 bg-white/20 px-4 py-2.5 font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Nhân sự / Giảng viên? Vào cổng quản lý
          </Link>
          <Link
            href="/parent/login"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/50 bg-white/20 px-4 py-2.5 font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            <HeartHandshake className="h-4 w-4" aria-hidden="true" />
            Phụ huynh? Vào Sổ Liên Lạc Điện Tử
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="student-identifier"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Email hoặc số điện thoại
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="student-identifier"
              type="text"
              autoComplete="username"
              placeholder="Email hoặc SĐT đã đăng ký với trường"
              aria-invalid={!!errors.identifier}
              className={`${inputClass} ${errors.identifier ? inputErrorClass : ''}`}
              {...register('identifier')}
            />
          </div>
          <FieldError message={errors.identifier?.message} />
        </div>

        <div>
          <label
            htmlFor="student-password"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Mật khẩu
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="student-password"
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
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm text-rose-700"
          >
            <p>{serverError}</p>
            {wrongPortal && (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                Sang cổng quản lý
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-900/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
          )}
          {isSubmitting ? 'Đang đăng nhập…' : 'Vào lớp học'}
        </button>
      </form>
    </AuthShell>
  )
}
