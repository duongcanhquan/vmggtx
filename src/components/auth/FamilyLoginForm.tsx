'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpenCheck,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isRole } from '@/lib/auth/roles'
import { AuthField, authBtnClass } from '@/components/auth/AuthShell'
import { resolveLoginEmail, resolveRoleByUserId } from '@/app/login/actions'
import { assertUserInCampus } from '@/app/coso/[slug]/actions'
import { parentLogin } from '@/app/(parent-portal)/actions'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusLoginPath } from '@/lib/utils/orgSlug'
import { rememberLoginPortal } from '@/lib/auth/loginPortal'
import type { CampusContext } from '@/components/auth/StaffLoginForm'

// ============================================================
// CỔNG GIA ĐÌNH HỢP NHẤT — 1 form duy nhất cho Học viên & Phụ huynh.
// Hệ thống TỰ NHẬN DIỆN qua ô nhập đầu tiên:
//   - Email          -> Học viên  (đăng nhập bằng mật khẩu -> /portal)
//   - Số điện thoại  -> Phụ huynh (xác thực mã OTP -> Sổ liên lạc)
// ============================================================

type FamilyMode = 'unknown' | 'student' | 'parent'

export function FamilyLoginForm({ campus }: { campus?: CampusContext }) {
  const router = useRouter()
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nhận diện chức danh từ ô nhập: email = Học viên, SĐT = Phụ huynh
  const mode: FamilyMode = useMemo(() => {
    const value = identifier.trim()
    if (value.includes('@')) return 'student'
    const digits = value.replace(/[\s.\-()]/g, '')
    if (/^0\d{9}$/.test(digits)) return 'parent'
    return 'unknown'
  }, [identifier])

  const phoneDigits = identifier.trim().replace(/[\s.\-()]/g, '')

  async function submitStudent() {
    const resolved = await resolveLoginEmail(identifier.trim())
    if (resolved.error !== undefined) {
      setError(resolved.error)
      return
    }
    if (password.length < 6) {
      setError('Mật khẩu tối thiểu 6 ký tự.')
      return
    }

    const supabase = createClient()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password,
    })
    if (signInError) {
      setError(
        signInError.message.includes('Invalid login')
          ? 'Email hoặc mật khẩu không đúng.'
          : signInError.message
      )
      return
    }

    // Đọc role: JWT claim trước, fallback profiles/Admin
    let role: string | null = null
    try {
      const token = data.session?.access_token
      if (token) {
        const payload = JSON.parse(
          atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        ) as Record<string, unknown>
        if (isRole(payload.user_role)) role = payload.user_role
      }
    } catch {
      /* fallback bên dưới */
    }
    if (!role && data.user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (isRole(profile?.role)) role = profile.role
      if (!role) {
        const serverRole = await resolveRoleByUserId(data.user.id)
        if (serverRole.error === undefined) role = serverRole.role
      }
    }

    if (role && role !== 'student' && role !== 'super_admin') {
      await supabase.auth.signOut()
      setError('Tài khoản này thuộc khối Nhà trường — hãy chuyển sang phần "Nhà trường".')
      return
    }

    if (campus && role === 'student') {
      const gate = await assertUserInCampus(campus.id, data.user?.id)
      if (gate.error !== undefined) {
        setError(gate.error)
        router.replace('/portal')
        router.refresh()
        return
      }
      const contextOrgId = gate.userOrgId ?? gate.campusId
      if (contextOrgId) setCurrentOrgId(contextOrgId)
    }

    // Ghi nhớ cổng: đăng xuất/hết phiên quay về đúng cổng cơ sở (tab Gia đình)
    rememberLoginPortal(
      campus ? campusLoginPath(campus.slug, 'student') : '/student/login'
    )

    router.replace(role === 'super_admin' ? '/admin/organizations' : '/portal')
    router.refresh()
  }

  async function submitParent() {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Mã OTP phải gồm đúng 6 chữ số.')
      return
    }
    const formData = new FormData()
    formData.set('phone', phoneDigits)
    formData.set('otp', otp.trim())
    if (campus) formData.set('campusOrgId', campus.id)

    const result = await parentLogin(formData)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    // Ghi nhớ cổng phụ huynh (tab Gia đình của cơ sở)
    rememberLoginPortal(
      campus ? campusLoginPath(campus.slug, 'parent') : '/parent/login'
    )
    router.push('/dashboard')
    router.refresh()
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (mode === 'unknown') {
      setError('Nhập email (Học viên) hoặc số điện thoại (Phụ huynh).')
      return
    }
    if (mode === 'parent' && !otpSent) {
      setOtpSent(true)
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'student') await submitStudent()
      else await submitParent()
    } finally {
      setSubmitting(false)
    }
  }

  const buttonLabel =
    mode === 'parent'
      ? otpSent
        ? 'Vào Sổ liên lạc'
        : 'Gửi mã OTP'
      : 'Đăng nhập'
  const ButtonIcon =
    mode === 'parent' ? (otpSent ? ShieldCheck : KeyRound) : BookOpenCheck

  return (
    <form onSubmit={onSubmit} noValidate>
      <AuthField
        id="family-identifier"
        label="Email Học viên hoặc SĐT Phụ huynh"
        icon={UserRound}
        type="text"
        autoComplete="username"
        disabled={otpSent}
        className={otpSent ? 'opacity-60' : ''}
        value={identifier}
        onChange={(e) => {
          setIdentifier(e.target.value)
          setError(null)
        }}
      />

      {/* Nhận diện chức danh — hiện ngay khi gõ xong */}
      {mode !== 'unknown' && (
        <p className="-mt-4 mb-4 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white/90">
          {mode === 'student' ? (
            <>
              <GraduationCap className="h-4 w-4 shrink-0" aria-hidden="true" />
              Học viên — đăng nhập bằng mật khẩu
            </>
          ) : (
            <>
              <HeartHandshake className="h-4 w-4 shrink-0" aria-hidden="true" />
              Phụ huynh — xác thực bằng mã OTP
            </>
          )}
        </p>
      )}

      {mode === 'student' && (
        <AuthField
          id="family-password"
          label="Mật khẩu"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
        />
      )}

      {mode === 'parent' && otpSent && (
        <>
          <AuthField
            id="family-otp"
            label="Mã OTP (6 số)"
            icon={ShieldCheck}
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            className="text-center text-xl tracking-[0.5em]"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value)
              setError(null)
            }}
          />
          <button
            type="button"
            onClick={() => {
              setOtpSent(false)
              setOtp('')
              setError(null)
            }}
            className="-mt-3 mb-4 mx-auto block cursor-pointer text-sm font-medium text-white/85 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Đổi số điện thoại khác
          </button>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-rose-200/50 bg-rose-500/25 px-3.5 py-2.5 text-sm font-medium text-white"
        >
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className={authBtnClass}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <ButtonIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {submitting ? 'Đang xử lý…' : buttonLabel}
      </button>
    </form>
  )
}
