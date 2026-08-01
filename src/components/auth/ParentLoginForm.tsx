'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { phoneVNSchema } from '@/lib/validation/schemas'
import { AuthShell, AuthField, authBtnClass } from '@/components/auth/AuthShell'
import { parentLogin } from '@/app/(parent-portal)/actions'
import type { CampusContext } from '@/components/auth/StaffLoginForm'

const loginSchema = z.object({
  phone: phoneVNSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Mã OTP phải gồm đúng 6 chữ số.'),
})

type LoginValues = z.infer<typeof loginSchema>

/**
 * Form đăng nhập Phụ huynh — /parent/login và tab "Gia đình" của cổng cơ sở.
 * `embedded` = chỉ render FORM (không AuthShell) để nhúng vào cổng tab chung.
 */
export function ParentLoginForm({
  campus,
  embedded = false,
}: {
  campus?: CampusContext
  embedded?: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { phone: '', otp: '' },
  })

  async function handleRequestOtp() {
    const valid = await trigger('phone')
    if (!valid) return
    setServerError(null)
    setStep('otp')
  }

  async function onValid(values: LoginValues) {
    setSubmitting(true)
    setServerError(null)

    const formData = new FormData()
    formData.set('phone', values.phone)
    formData.set('otp', values.otp)
    if (campus) formData.set('campusOrgId', campus.id)

    const result = await parentLogin(formData)
    setSubmitting(false)

    if (result.error !== undefined) {
      setServerError(result.error)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  const formEl = (
    <form onSubmit={handleSubmit(onValid)} noValidate>
        <AuthField
          id="parent-phone"
          label="Số điện thoại đã đăng ký với nhà trường"
          icon={Phone}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          disabled={step === 'otp'}
          error={errors.phone?.message}
          className={step === 'otp' ? 'opacity-60' : ''}
          {...register('phone')}
        />

        {step === 'phone' ? (
          <button type="button" onClick={handleRequestOtp} className={authBtnClass}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Gửi mã OTP
          </button>
        ) : (
          <>
            <AuthField
              id="parent-otp"
              label="Mã OTP (6 số)"
              icon={ShieldCheck}
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              error={errors.otp?.message}
              className="text-center text-xl tracking-[0.5em]"
              {...register('otp')}
            />
            <p className="-mt-4 mb-4 text-xs text-white/80">Demo: nhập 123456</p>

            <button type="submit" disabled={submitting} className={authBtnClass}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {submitting ? 'Đang xác thực…' : 'Vào Sổ Liên Lạc'}
            </button>

            <button
              type="button"
              onClick={() => setStep('phone')}
              className="mx-auto mt-3 block cursor-pointer text-sm font-medium text-white/85 underline-offset-2 transition-colors duration-150 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Đổi số điện thoại khác
            </button>
          </>
        )}

        {serverError && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-rose-200/50 bg-rose-500/25 px-3.5 py-2.5 text-sm font-medium text-white"
          >
            {serverError}
          </p>
        )}

        <p className="mt-4 text-center text-xs text-white/80">
          Demo: <span className="font-bold text-white">0901234567</span> · OTP{' '}
          <span className="font-bold text-white">123456</span>
        </p>
      </form>
  )

  if (embedded) return formEl

  return (
    <AuthShell
      theme="parent"
      badge={campus ? campus.name : 'Dành cho Phụ huynh'}
      title="Sổ Liên Lạc Điện Tử"
      subtitle={
        campus
          ? `Phụ huynh · ${campus.name}`
          : 'Nên vào /coso/ten-co-so — cổng đúng cơ sở của con bạn'
      }
      footer={
        !campus ? (
          <p>
            Chọn cơ sở trước khi đăng nhập:{' '}
            <Link
              href="/coso"
              className="font-bold text-white underline-offset-2 hover:underline"
            >
              /coso
            </Link>
          </p>
        ) : (
          <p>
            <Link
              href={`/coso/${campus.slug}`}
              className="font-bold text-white/80 underline-offset-2 hover:underline"
            >
              ← Về trang cơ sở
            </Link>
          </p>
        )
      }
    >
      {formEl}
    </AuthShell>
  )
}
