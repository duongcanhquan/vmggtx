'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  UsersRound,
} from 'lucide-react'
import {
  createParentAccount,
  deleteParentAccount,
  listParentAccounts,
  resetParentPassword,
  type ParentAccountRow,
} from './parent-actions'

export function ParentAccountsCard({ studentId }: { studentId: string }) {
  const [accounts, setAccounts] = useState<ParentAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await listParentAccounts(studentId)
    setLoading(false)
    if (r.error !== undefined) {
      setError(r.error)
      setAccounts([])
      return
    }
    setAccounts(r.accounts)
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setToast(null)
    const fd = new FormData()
    fd.set('studentId', studentId)
    fd.set('email', email)
    fd.set('password', password)
    fd.set('fullName', fullName)
    const r = await createParentAccount(fd)
    setBusy(false)
    if (r.error !== undefined) {
      setToast(r.error)
      return
    }
    setEmail('')
    setPassword('')
    setFullName('')
    setShowCreate(false)
    setToast('Đã tạo tài khoản phụ huynh.')
    void load()
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetId) return
    setBusy(true)
    setToast(null)
    const fd = new FormData()
    fd.set('accountId', resetId)
    fd.set('studentId', studentId)
    fd.set('password', resetPassword)
    const r = await resetParentPassword(fd)
    setBusy(false)
    if (r.error !== undefined) {
      setToast(r.error)
      return
    }
    setResetId(null)
    setResetPassword('')
    setToast('Đã đặt lại mật khẩu.')
  }

  async function onDelete(id: string, accountEmail: string) {
    if (
      !window.confirm(
        `Xóa tài khoản phụ huynh ${accountEmail}? (xóa mềm — không đăng nhập được nữa)`
      )
    ) {
      return
    }
    setBusy(true)
    const r = await deleteParentAccount(id, studentId)
    setBusy(false)
    if (r.error !== undefined) {
      setToast(r.error)
      return
    }
    setToast('Đã xóa tài khoản phụ huynh.')
    void load()
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
            <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />
            Tài khoản phụ huynh
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Email + mật khẩu để phụ huynh vào sổ liên lạc (cổng Gia đình). Không tạo
            user Supabase.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm tài khoản
        </button>
      </div>

      {toast && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          {toast}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      {showCreate && (
        <form onSubmit={onCreate} className="mt-4 grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-2">
          <label className="block text-sm font-medium sm:col-span-2">
            Họ tên phụ huynh (tuỳ chọn)
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              placeholder="VD: Nguyễn Văn A"
            />
          </label>
          <label className="block text-sm font-medium">
            Email đăng nhập
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Mật khẩu tạm
            <input
              required
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm"
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu tài khoản'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải…
        </div>
      ) : accounts.length === 0 && !error ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Chưa có tài khoản phụ huynh. Tạo email + mật khẩu rồi gửi cho gia đình.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {acc.full_name || 'Phụ huynh'}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {acc.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setResetId(acc.id)
                    setResetPassword('')
                  }}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Đổi MK
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete(acc.id, acc.email)}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-rose-200 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Xóa
                </button>
              </div>
              {resetId === acc.id && (
                <form
                  onSubmit={onReset}
                  className="flex w-full flex-wrap items-end gap-2 border-t border-border pt-2"
                >
                  <label className="min-w-[12rem] flex-1 text-xs font-medium">
                    Mật khẩu mới
                    <input
                      required
                      type="text"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 font-mono text-sm"
                      minLength={6}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    Lưu MK
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetId(null)}
                    className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-border px-3 text-xs font-semibold"
                  >
                    Hủy
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
