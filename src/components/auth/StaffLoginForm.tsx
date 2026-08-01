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
import { resolveLoginEmail, resolveRoleByUserId } from '@/app/login/actions'
import { assertUserInCampus } from '@/app/coso/[slug]/actions'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusLoginPath } from '@/lib/utils/orgSlug'
import { LoginGuide } from '@/components/auth/LoginGuide'

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

export type CampusContext = {
  id: string
  name: string
  slug: string
}

/** Form đăng nhập Nhà trường & Giảng viên — dùng cho /login và /coso/[slug]/login */
export function StaffLoginForm({ campus }: { campus?: CampusContext }) {
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

    let role = await resolveRoleAfterLogin(
      supabase,
      data.session?.access_token,
      data.user?.id
    )

    // Client không đọc được role → Admin theo userId (KHÔNG đọc cookie —
    // tránh race vừa signIn xong cookie chưa kịp → signOut xóa phiên).
    if (!role && data.user?.id) {
      const serverRole = await resolveRoleByUserId(data.user.id)
      if (serverRole.error === undefined && serverRole.role) {
        role = serverRole.role
      } else if (serverRole.error) {
        // KHÔNG signOut — phiên Auth vẫn còn; vào trang chủ để middleware thử lại
        console.error('[login] resolveRoleByUserId:', serverRole.error)
      }
    }

    if (role === 'student') {
      await supabase.auth.signOut()
      setWrongPortal(true)
      setServerError(
        campus
          ? 'Đây là cổng dành cho Nhà trường & Giảng viên. Học viên vui lòng đăng nhập tại Cổng Học viên.'
          : 'Học viên hãy chọn cơ sở tại /coso rồi vào Cổng Học viên của cơ sở đó.'
      )
      return
    }

    if (campus) {
      const gate = await assertUserInCampus(campus.id, data.user?.id)
      if (gate.error !== undefined) {
        // Sai cổng cơ sở nhưng Auth OK → đưa về trang chủ đúng role (không xóa phiên)
        setServerError(gate.error)
        router.replace(getHomePathForRole(role))
        router.refresh()
        return
      }
      if (gate.campusId) setCurrentOrgId(gate.campusId)
    }

    // role null: vẫn vào / — middleware đọc profiles khi cookie đã ổn
    router.replace(getHomePathForRole(role))
    router.refresh()
  }

  const studentHref = campus
    ? campusLoginPath(campus.slug, 'student')
    : '/coso'
  const parentHref = campus
    ? campusLoginPath(campus.slug, 'parent')
    : '/coso'

  return (
    <AuthShell
      theme="management"
      icon={GraduationCap}
      badge={campus ? campus.name : 'Nhà trường · Hệ thống'}
      title={
        <>
          EDU <span className="text-amber-300">SYSTEM</span>
        </>
      }
      subtitle={
        campus
          ? `Cổng quản trị cơ sở · ${campus.name}`
          : 'Super Admin đăng nhập tại đây · Cơ sở nên dùng /coso/…'
      }
      footer={
        <>
          {!campus ? (
            <p>
              Quản lý / GV / Học viên / Phụ huynh theo cơ sở:{' '}
              <Link
                href="/coso"
                className="font-bold text-white underline-offset-2 hover:underline"
              >
                chọn cơ sở tại /coso
              </Link>
              {' '}(khuyến nghị). Cổng này vẫn nhận đăng nhập nhân sự nếu cần.
            </p>
          ) : (
            <>
              <p>
                Bạn là Học viên?{' '}
                <Link
                  href={studentHref}
                  className="font-bold text-white underline-offset-2 hover:underline"
                >
                  Vào Cổng Học viên
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
                href={campus ? studentHref : '/coso'}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-[#162938] hover:bg-white/90"
              >
                {campus ? 'Sang Cổng Học viên' : 'Sang /coso chọn cơ sở'}
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
      {!campus && <LoginGuide />}
    </AuthShell>
  )
}
