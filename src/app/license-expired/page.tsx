'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, LogOut, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ============================================================
// Trang chặn khi LICENSE cơ sở hết hạn / bị tạm ngưng (044).
// Dữ liệu vẫn còn nguyên - gia hạn là mở lại ngay.
// ============================================================

export default function LicenseExpiredPage() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await createClient().auth.signOut()
    } catch {
      /* phiên đã hỏng - vẫn đưa về login */
    }
    router.replace('/login')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/50 to-amber-50/40 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
          <CalendarClock className="h-8 w-8 text-amber-600" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-heading text-2xl font-semibold text-slate-900">
          Gói dịch vụ đã hết hạn
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Dữ liệu của cơ sở vẫn <strong>an toàn 100%</strong> - gia hạn là mọi thứ chạy lại
          ngay lập tức.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
          <Mail className="h-4 w-4" aria-hidden="true" />
          Liên hệ quản trị hệ thống để gia hạn
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            Đăng xuất
          </button>
        </div>
      </div>
    </main>
  )
}
