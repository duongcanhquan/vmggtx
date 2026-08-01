'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { GraduationCap, KeyRound, Loader2, Phone, ShieldCheck } from 'lucide-react'
import { phoneVNSchema } from '@/lib/validation/schemas'
import { parentLogin } from '../../actions'

// ============================================================
// Đăng nhập Phụ huynh bằng SỐ ĐIỆN THOẠI (mock OTP).
// Route: /parent/login (đã dời khỏi /login để nhường chỗ cho
// Login chung của Smart Auth Routing).
// ============================================================

const loginSchema = z.object({
  phone: phoneVNSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Mã OTP phải gồm đúng 6 chữ số.'),
})

type LoginValues = z.infer<typeof loginSchema>

const inputClass =
  'min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 text-base text-foreground shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputErrorClass = 'border-red-400 focus-visible:ring-red-400'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

export default function ParentLoginPage() {
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
    setStep('otp') // OTP mock: không gửi SMS thật
  }

  async function onValid(values: LoginValues) {
    setSubmitting(true)
    setServerError(null)

    const formData = new FormData()
    formData.set('phone', values.phone)
    formData.set('otp', values.otp)

    const result = await parentLogin(formData)
    setSubmitting(false)

    if (result.error !== undefined) {
      setServerError(result.error)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg">
          <GraduationCap className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight">
          Sổ Liên Lạc Điện Tử
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dành cho Phụ huynh · GDTX ERP
        </p>
      </div>

      <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-5">
        <div>
          <label htmlFor="parent-phone" className="mb-1.5 block text-sm font-medium">
            Số điện thoại đã đăng ký
          </label>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="parent-phone"
              type="tel"
              inputMode="numeric"
              placeholder="VD: 0901234567"
              disabled={step === 'otp'}
              aria-invalid={!!errors.phone}
              className={`${inputClass} pl-10 disabled:bg-slate-50 disabled:text-muted-foreground ${
                errors.phone ? inputErrorClass : ''
              }`}
              {...register('phone')}
            />
          </div>
          <FieldError message={errors.phone?.message} />
        </div>

        {step === 'phone' ? (
          <button
            type="button"
            onClick={handleRequestOtp}
            className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Gửi mã OTP
          </button>
        ) : (
          <>
            <div>
              <label htmlFor="parent-otp" className="mb-1.5 block text-sm font-medium">
                Mã OTP (6 số)
              </label>
              <input
                id="parent-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                placeholder="••••••"
                aria-invalid={!!errors.otp}
                className={`${inputClass} text-center text-xl tracking-[0.5em] ${
                  errors.otp ? inputErrorClass : ''
                }`}
                {...register('otp')}
              />
              <FieldError message={errors.otp?.message} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Demo: nhập 6 chữ số bất kỳ.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {submitting ? 'Đang xác thực…' : 'Đăng nhập'}
            </button>

            <button
              type="button"
              onClick={() => setStep('phone')}
              className="mx-auto block cursor-pointer text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Đổi số điện thoại khác
            </button>
          </>
        )}

        {serverError && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
          >
            {serverError}
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Nhân sự / Giáo viên / Học sinh?{' '}
        <a href="/login" className="font-semibold text-primary hover:underline">
          Đăng nhập chung
        </a>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        SĐT demo: <span className="font-semibold">0901234567</span>
      </p>
    </div>
  )
}
