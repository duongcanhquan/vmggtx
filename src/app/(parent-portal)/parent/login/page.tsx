'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BookOpenCheck,
  Building2,
  HeartHandshake,
  KeyRound,
  Loader2,
  Phone,
  ShieldCheck,
} from 'lucide-react'
import { phoneVNSchema } from '@/lib/validation/schemas'
import { AuthShell } from '@/components/auth/AuthShell'
import { parentLogin } from '../../actions'

// ============================================================
// CỔNG ĐĂNG NHẬP PHỤ HUYNH (/parent/login) - Sổ Liên Lạc Điện Tử.
// TÁCH RIÊNG hoàn toàn khỏi cổng quản lý (/login) và cổng học
// viên (/student/login) - xác thực bằng SĐT + OTP (cookie HMAC
// riêng, không dùng Supabase Auth) -> sẵn sàng chạy tên miền riêng.
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
  'min-h-12 w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400'
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
    <AuthShell
      theme="parent"
      icon={HeartHandshake}
      badge="Dành cho Phụ huynh"
      title="Sổ Liên Lạc Điện Tử"
      subtitle="Đồng hành cùng con mỗi ngày · Điểm số, lịch học, nhận xét từ thầy cô"
      footer={
        <div className="space-y-2 text-sm">
          <Link
            href="/student/login"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/50 bg-white/20 px-4 py-2.5 font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            Học viên? Vào Cổng Học viên
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/50 bg-white/20 px-4 py-2.5 font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Nhân sự / Giảng viên? Vào cổng quản lý
          </Link>
          <p className="text-xs text-white/90">
            Demo: <span className="font-bold">0901234567</span> · OTP{' '}
            <span className="font-bold">123456</span>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="parent-phone"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Số điện thoại đã đăng ký với nhà trường
          </label>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="parent-phone"
              type="tel"
              inputMode="numeric"
              placeholder="VD: 0901234567"
              disabled={step === 'otp'}
              aria-invalid={!!errors.phone}
              className={`${inputClass} pl-10 disabled:bg-slate-100 disabled:text-slate-500 ${
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
            className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 text-sm font-bold text-white shadow-lg shadow-rose-900/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Gửi mã OTP
          </button>
        ) : (
          <>
            <div>
              <label
                htmlFor="parent-otp"
                className="mb-1.5 block text-sm font-semibold text-slate-700"
              >
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
              <p className="mt-1.5 text-xs text-slate-500">Demo: nhập 123456</p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 text-sm font-bold text-white shadow-lg shadow-rose-900/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
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
              className="mx-auto block cursor-pointer text-sm font-medium text-slate-500 transition-colors duration-150 hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              Đổi số điện thoại khác
            </button>
          </>
        )}

        {serverError && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-sm text-rose-700"
          >
            {serverError}
          </p>
        )}
      </form>
    </AuthShell>
  )
}
