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
// UserMenu - nút tài khoản ở header (mọi portal dùng Supabase Auth):
//   · Đổi mật khẩu (modal, supabase.auth.updateUser)
//   · Đăng xuất → về ĐÚNG cổng login đã vào (/{slug}/login), không về landing
// ============================================================

export function UserMenu({ loginPath = '/login' }: { loginPath?: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // getSession đọc cục bộ (0ms) thay vì round-trip mạng như getUser
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
      /* vẫn tiếp tục về trang login */
    }
    // Xóa cookie hint phiên; GIỮ login_portal để về đúng cổng cơ sở
    for (const name of ['role_hint', 'menu_hint', 'license_hint']) {
      document.cookie = `${name}=; path=/; max-age=0`
    }
    // Ưu tiên cookie cổng cơ sở (/viet-my/login) — không về landing /login
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
        title="Tài khoản"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-foreground transition-colors duration-200 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleUserRound className="h-6 w-6" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        >
          {email && (
            <p className="truncate border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground">
              {email}
            </p>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setShowPassword(true)
            }}
            className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 text-sm font-medium text-foreground transition-colors hover:bg-indigo-50 hover:text-primary"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Đổi mật khẩu
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
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
    'mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Đổi mật khẩu"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
            <KeyRound className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            Đổi mật khẩu
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {done ? (
          <div className="mt-5 space-y-4 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700">
              Đã đổi mật khẩu thành công. Lần đăng nhập sau hãy dùng mật khẩu mới.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Đóng
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
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
            <label className="block text-sm font-medium text-slate-700">
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
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
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
