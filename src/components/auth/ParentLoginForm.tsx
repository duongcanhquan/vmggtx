'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookOpenCheck, Loader2, Lock, Mail } from 'lucide-react'
import { AuthShell, AuthField, authBtnClass } from '@/components/auth/AuthShell'
import { parentLoginWithPassword } from '@/app/(parent-portal)/actions'
import { campusLoginPath } from '@/lib/utils/orgSlug'
import { rememberLoginPortal } from '@/lib/auth/loginPortal'
import type { CampusContext } from '@/components/auth/StaffLoginForm'

const loginSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ.'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự.'),
})

type LoginValues = z.infer<typeof loginSchema>

/** Form phụ huynh standalone — email + mật khẩu → cookie parent_session */
export function ParentLoginForm({
  campus,
  embedded = false,
}: {
  campus?: CampusContext
  embedded?: boolean
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  })

  async function onValid(values: LoginValues) {
    setSubmitting(true)
    setServerError(null)
    const formData = new FormData()
    formData.set('email', values.email)
    formData.set('password', values.password)
    if (campus) formData.set('campusOrgId', campus.id)

    const result = await parentLoginWithPassword(formData)
    setSubmitting(false)
    if (result.error !== undefined) {
      setServerError(result.error)
      return
    }
    rememberLoginPortal(
      campus ? campusLoginPath(campus.slug, 'parent') : '/parent/login'
    )
    router.push('/dashboard')
    router.refresh()
  }

  const formEl = (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <AuthField
        id="parent-email"
        label="Email phụ huynh"
        hint="Email đã đăng ký với nhà trường"
        icon={Mail}
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      <AuthField
        id="parent-password"
        label="Mật khẩu"
        icon={Lock}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {serverError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-rose-200/40 bg-rose-500/20 px-3 py-2 text-xs font-medium text-white"
        >
          {serverError}
        </p>
      )}
      <button type="submit" disabled={submitting} className={authBtnClass}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
        )}
        {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  )

  if (embedded) return formEl

  return (
    <AuthShell
      theme="parent"
      badge={campus?.logoUrl ? campus.name : 'Phụ huynh'}
      logoUrl={campus?.logoUrl}
      title={campus ? campus.name : 'Sổ liên lạc'}
      subtitle="Đăng nhập bằng email và mật khẩu"
      footer={
        <p>
          <Link href="/login" className="font-semibold underline-offset-2 hover:underline">
            ← Về trang giới thiệu
          </Link>
        </p>
      }
    >
      {formEl}
    </AuthShell>
  )
}
