'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpenCheck,
  GraduationCap,
  HeartHandshake,
  Loader2,
  Lock,
  Mail,
  UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getHomePathForRole, isRole, type Role } from '@/lib/auth/roles'
import { AuthField, authBtnClass } from '@/components/auth/AuthShell'
import { resolveLoginEmail, resolveRoleByUserId } from '@/app/login/actions'
import { assertUserInCampus } from '@/app/coso/[slug]/actions'
import { parentLoginWithPassword } from '@/app/(parent-portal)/actions'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusLoginPath } from '@/lib/utils/orgSlug'
import { rememberLoginPortal } from '@/lib/auth/loginPortal'
import type { CampusContext } from '@/components/auth/StaffLoginForm'

export type FamilyWho = 'student' | 'parent'

export function FamilyLoginForm({
  campus,
  initialWho = 'student',
  onWhoChange,
}: {
  campus?: CampusContext
  initialWho?: FamilyWho
  onWhoChange?: (who: FamilyWho) => void
}) {
  const router = useRouter()
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)

  const [who, setWho] = useState<FamilyWho>(initialWho)
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchWho(next: FamilyWho) {
    setWho(next)
    setError(null)
    setPassword('')
    onWhoChange?.(next)
  }

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
          ? 'Mã học viên / email hoặc mật khẩu không đúng.'
          : signInError.message
      )
      return
    }

    let role: Role | null = null
    try {
      const token = data.session?.access_token
      if (token) {
        const payload = JSON.parse(
          atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        ) as Record<string, unknown>
        if (isRole(payload.user_role)) role = payload.user_role
      }
    } catch {
      /* fallback */
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
      setError('Tài khoản này thuộc khối Nhà trường — chuyển sang tab "Nhà trường".')
      return
    }

    if (!role) {
      await supabase.auth.signOut()
      setError('Không xác định được vai trò tài khoản. Liên hệ nhà trường.')
      return
    }

    if (campus && role === 'student') {
      const gate = await assertUserInCampus(campus.id, data.user?.id)
      if (gate.error !== undefined) {
        await supabase.auth.signOut()
        setError(gate.error)
        return
      }
      const contextOrgId = gate.userOrgId ?? gate.campusId
      if (contextOrgId) setCurrentOrgId(contextOrgId)
    }

    rememberLoginPortal(
      campus ? campusLoginPath(campus.slug, 'student') : '/student/login'
    )
    router.replace(getHomePathForRole(role))
    router.refresh()
  }

  async function submitParent() {
    const formData = new FormData()
    formData.set('email', email.trim())
    formData.set('password', password)
    if (campus) formData.set('campusOrgId', campus.id)

    const result = await parentLoginWithPassword(formData)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    rememberLoginPortal(
      campus ? campusLoginPath(campus.slug, 'parent') : '/parent/login'
    )
    router.push('/dashboard')
    router.refresh()
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    // [QA-FIX E] Client validate trước khi gọi mạng (noValidate form)
    if (who === 'student') {
      if (!identifier.trim()) {
        setError('Vui lòng nhập mã học viên hoặc email.')
        return
      }
      if (!password) {
        setError('Vui lòng nhập mật khẩu.')
        return
      }
    } else {
      if (!email.trim() || !email.includes('@')) {
        setError('Vui lòng nhập email phụ huynh hợp lệ.')
        return
      }
      if (!password) {
        setError('Vui lòng nhập mật khẩu.')
        return
      }
    }
    setSubmitting(true)
    try {
      if (who === 'student') await submitStudent()
      else await submitParent()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div
        role="tablist"
        aria-label="Học viên hoặc phụ huynh"
        className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-white/25 bg-black/10 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={who === 'student'}
          onClick={() => switchWho('student')}
          className={`flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
            who === 'student'
              ? 'bg-white/95 text-[#162938]'
              : 'text-white/80 hover:bg-white/10'
          }`}
        >
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          Học viên
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={who === 'parent'}
          onClick={() => switchWho('parent')}
          className={`flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
            who === 'parent'
              ? 'bg-white/95 text-[#162938]'
              : 'text-white/80 hover:bg-white/10'
          }`}
        >
          <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
          Phụ huynh
        </button>
      </div>

      {who === 'student' ? (
        <>
          <AuthField
            id="student-id"
            label="Mã học viên hoặc email"
            hint="VD: VM24-0001 hoặc email học viên"
            icon={UserRound}
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value)
              setError(null)
            }}
          />
          <AuthField
            id="student-password"
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
        </>
      ) : (
        <>
          <AuthField
            id="parent-email"
            label="Email phụ huynh"
            hint="Email đã đăng ký với nhà trường"
            icon={Mail}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
          <AuthField
            id="parent-password"
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
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-rose-200/40 bg-rose-500/20 px-3 py-2 text-xs font-medium leading-snug text-white"
        >
          {error}
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
}
