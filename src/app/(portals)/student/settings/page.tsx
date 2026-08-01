'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2, LogOut, Mail, Settings, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { readLoginPortal } from '@/lib/auth/loginPortal'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// CÀI ĐẶT HỌC SINH (/student/settings) — mobile-first.
// Thông tin tài khoản (chỉ đọc) + nút Đăng xuất.
// ============================================================

type AccountInfo = {
  fullName: string
  email: string
  orgName: string | null
}

export default function StudentSettingsPage() {
  const router = useRouter()
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        // getSession đọc cục bộ (0ms) thay vì round-trip mạng như getUser
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) {
          router.replace('/student/login')
          return
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, org_id')
          .eq('id', user.id)
          .is('deleted_at', null)
          .maybeSingle()

        let orgName: string | null = null
        if (profile?.org_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', profile.org_id)
            .maybeSingle()
          orgName = org?.name ?? null
        }
        if (!cancelled) {
          setAccount({
            fullName: profile?.full_name ?? 'Học sinh',
            email: user.email ?? '—',
            orgName,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // Quay về đúng cổng đã đăng nhập (cơ sở -> /coso/[slug]/login?tab=family)
    router.replace(readLoginPortal() ?? '/student/login')
    router.refresh()
  }

  return (
    <div className="space-y-5 px-4 py-5">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
        <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
        Cài đặt
      </h1>

      {loading ? (
        <FunLoader label="Đang tải thông tin…" />
      ) : (
        account && (
          <>
            <section
              aria-label="Thông tin tài khoản"
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 font-heading text-lg font-bold text-indigo-600">
                  {account.fullName
                    .split(' ')
                    .slice(-2)
                    .map((word) => word[0])
                    .join('')
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-heading text-base font-bold text-foreground">
                    {account.fullName}
                  </p>
                  <p className="text-xs text-muted-foreground">Học sinh</p>
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 border-t border-border pt-4 text-sm">
                <div className="flex items-center gap-2.5">
                  <dt className="sr-only">Email</dt>
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dd className="truncate text-foreground">{account.email}</dd>
                </div>
                <div className="flex items-center gap-2.5">
                  <dt className="sr-only">Cơ sở</dt>
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dd className="truncate text-foreground">
                    {account.orgName ?? 'Chưa gắn cơ sở'}
                  </dd>
                </div>
                <div className="flex items-center gap-2.5">
                  <dt className="sr-only">Vai trò</dt>
                  <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dd className="text-foreground">Tài khoản Học sinh / Phụ huynh</dd>
                </div>
              </dl>
            </section>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="h-4 w-4" aria-hidden="true" />
              )}
              Đăng xuất
            </button>
          </>
        )
      )}
    </div>
  )
}
