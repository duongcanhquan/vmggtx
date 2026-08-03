'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CircleUserRound,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { readLoginPortal } from '@/lib/auth/loginPortal'

// ============================================================
// UserMenu — compact trigger; dropdown hiện đủ email, không cắt chữ.
// ============================================================

const PANEL =
  'rounded-2xl border border-stone-200/90 bg-[#FCFAF7] shadow-[0_12px_40px_-16px_rgba(28,25,23,0.28),inset_0_1px_0_rgba(255,255,255,0.9)]'
const HAIRLINE =
  'h-px w-full bg-gradient-to-r from-transparent via-amber-600/35 to-transparent'

export function UserMenu({ loginPath = '/login' }: { loginPath?: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setEmail(data.session?.user?.email ?? null))
  }, [])

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    const portal = readLoginPortal()
    try {
      await createClient().auth.signOut()
    } catch {
      /* vẫn về trang login */
    }
    for (const name of ['role_hint', 'menu_hint', 'license_hint']) {
      document.cookie = `${name}=; path=/; max-age=0`
    }
    window.location.href = portal ?? loginPath
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tài khoản"
        title={email ?? 'Tài khoản'}
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-stone-600 transition-colors duration-200 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          open ? 'bg-stone-100 text-stone-900 ring-1 ring-amber-600/25' : ''
        }`}
      >
        <CircleUserRound className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-1.25rem))] ${PANEL}`}
        >
          {email && (
            <>
              <div className="px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                  Tài khoản
                </p>
                <p className="mt-1 break-all text-[13px] font-medium leading-snug text-stone-800">
                  {email}
                </p>
              </div>
              <div className={HAIRLINE} aria-hidden="true" />
            </>
          )}
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setShowPassword(true)
              }}
              className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-stone-800 transition-colors hover:bg-stone-100"
            >
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden="true" />
              Đổi mật khẩu
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
            </button>
          </div>
        </div>
      )}

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  )
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Mật khẩu mới tối thiểu 6 ký tự.')
      return
    }
    if (password !== confirm) {
      setError('Hai lần nhập mật khẩu chưa khớp.')
      return
    }
    setSaving(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(
        /same.*password|different from the old/i.test(updateError.message)
          ? 'Mật khẩu mới phải khác mật khẩu hiện tại.'
          : updateError.message
      )
      return
    }
    setDone(true)
  }

  const inputClass =
    'mt-1.5 min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3.5 text-sm text-stone-900 focus:border-amber-600/50 focus:outline-none focus:ring-2 focus:ring-amber-600/15'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Đổi mật khẩu"
    >
      <div className={`w-full max-w-sm p-6 ${PANEL}`}>
        <div className="flex items-start justify-between">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-stone-900">
            <KeyRound className="h-5 w-5 text-amber-800" aria-hidden="true" />
            Đổi mật khẩu
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {done ? (
          <div className="mt-5 space-y-4 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
            <p className="text-sm font-medium text-stone-700">
              Đã đổi mật khẩu thành công. Lần đăng nhập sau hãy dùng mật khẩu mới.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Đóng
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-stone-700">
              Mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Nhập lại mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu…' : 'Xác nhận đổi mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
