import Link from 'next/link'
import { Home, LogIn } from 'lucide-react'

// Trang đích khi middleware chặn truy cập trái phép (Matrix RBAC / Smart Auth).
export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
        <div
          aria-hidden="true"
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-3xl"
        >
          🔒
        </div>

        <h1 className="font-heading text-2xl font-bold text-foreground">
          Không có quyền truy cập
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Tài khoản không đủ quyền vào khu vực này. Liên hệ quản trị viên nếu cần.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Về cổng của tôi
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Đăng nhập lại
          </Link>
        </div>
      </div>
    </main>
  )
}
