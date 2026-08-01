'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookOpenCheck, Loader2, Lock, Mail, Rocket } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHomePathForRole, isRole, type Role } from '@/lib/auth/roles'
import { AuthShell, AuthField, authBtnClass } from '@/components/auth/AuthShell'
import { resolveLoginEmail } from '@/app/login/actions'
import { assertUserInCampus } from '@/app/coso/[slug]/actions'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusLoginPath } from '@/lib/utils/orgSlug'
import type { CampusContext } from '@/components/auth/StaffLoginForm'

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

/** Form đăng nhập Học viên — /student/login và /coso/[slug]/student/login */
export function StudentLoginForm({ campus }: { campus?: CampusContext }) {
  const router = useRouter()
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)
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

    if (campus && role === 'student') {
      const gate = await assertUserInCampus(campus.id)
      if (gate.error !== undefined) {
        setServerError(gate.error)
        return
      }
      if (gate.campusId) setCurrentOrgId(gate.campusId)
    }

    router.replace(role === 'super_admin' ? getHomePathForRole(role) : '/portal')
    router.refresh()
  }

  const staffHref = campus ? campusLoginPath(campus.slug, 'management') : '/coso'
  const parentHref = campus
    ? campusLoginPath(campus.slug, 'parent')
    : '/coso'

  return (
    <AuthShell
      theme="student"
      icon={Rocket}
      badge={campus ? campus.name : 'Cổng Học viên (toàn hệ thống)'}
      title={
        <>
          EDU <span className="text-yellow-200">SYSTEM</span>
        </>
      }
      subtitle={
        campus
          ? `Học viên · ${campus.name}`
          : 'Nên đăng nhập tại /coso/ten-co-so — cổng đúng cơ sở của bạn'
      }
      footer={
        <>
          {!campus ? (
            <p>
              Thuộc một cơ sở cụ thể?{' '}
              <Link
                href="/coso"
                className="font-bold text-white underline-offset-2 hover:underline"
              >
                Chọn cơ sở tại /coso
              </Link>
            </p>
          ) : (
            <>
              <p>
                Nhân sự / Giảng viên?{' '}
                <Link
                  href={staffHref}
                  className="font-bold text-white underline-offset-2 hover:underline"
                >
                  Vào cổng quản lý
                </Link>
              </p>
              <p>
                Phụ huynh?{' '}
                <Link
                  href={parentHref}
                  className="font-bold text-white underline-offset-2 hover:underline"
                >
                  Vào Sổ Liên Lạc Điện Tử
                </Link>
              </p>
              <p>
                <Link
                  href={`/coso/${campus.slug}`}
                  className="font-bold text-white/80 underline-offset-2 hover:underline"
                >
                  ← Về trang cơ sở
                </Link>
              </p>
            </>
          )}
        </>
      }
    >
      <form onSubmit={handleSubmit(onValid)} noValidate>
        <AuthField
          id="student-identifier"
          label="Email hoặc số điện thoại"
          icon={Mail}
          type="text"
          autoComplete="username"
          error={errors.identifier?.message}
          {...register('identifier')}
        />
        <AuthField
          id="student-password"
          label="Mật khẩu"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

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
            Liên hệ giáo viên chủ nhiệm hoặc văn phòng trường để được cấp lại mật khẩu.
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
                href={staffHref}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#162938] hover:bg-white/90"
              >
                Sang cổng quản lý
              </Link>
            )}
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className={authBtnClass}>
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
