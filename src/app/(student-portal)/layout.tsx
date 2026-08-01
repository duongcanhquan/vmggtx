'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bot,
  CalendarDays,
  GraduationCap,
  Home,
  Loader2,
  Medal,
  MonitorPlay,
  Wallet,
} from 'lucide-react'

// ============================================================
// Layout Cổng thông tin Học sinh / Phụ huynh.
// KHÁC HOÀN TOÀN khu Admin: Top Navigation Bar (không sidebar),
// mobile-first - menu dạng dải cuộn ngang trên điện thoại.
// ============================================================

const PORTAL_MENU = [
  { label: 'Trang chủ', href: '/portal', icon: Home },
  { label: 'Lịch học', href: '/schedule', icon: CalendarDays },
  { label: 'Học Online', href: '/learn', icon: MonitorPlay },
  { label: 'Kết quả học tập', href: '/grades', icon: Medal },
  { label: 'Học phí', href: '/tuition', icon: Wallet },
  { label: 'Trợ lý AI', href: '/assistant', icon: Bot },
]

export default function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // Phản hồi TỨC THÌ: spinner ngay trên tab vừa bấm
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* ===== Top Navigation Bar ===== */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link
            href="/portal"
            className="flex shrink-0 items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-heading text-base font-bold tracking-tight">
              GDTX <span className="text-primary">Student</span>
            </span>
          </Link>
        </div>

        {/* Menu: dải cuộn ngang mobile-first, căn giữa trên desktop */}
        <nav
          aria-label="Menu cổng học sinh"
          className="mx-auto max-w-7xl overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex w-max min-w-full items-center gap-1 sm:justify-center">
            {PORTAL_MENU.map((item) => {
              const Icon = item.icon
              const isActive = pathname.startsWith(item.href)
              const isPending = pendingHref === item.href && !isActive
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (!isActive) setPendingHref(item.href)
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : isPending
                          ? 'bg-indigo-50 text-primary'
                          : 'text-muted-foreground hover:bg-indigo-50 hover:text-primary'
                    }`}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      {/* ===== Nội dung ===== */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>

      <footer className="border-t border-border bg-surface py-4 text-center text-xs text-muted-foreground">
        GDTX ERP · Cổng thông tin Học sinh &amp; Phụ huynh
      </footer>
    </div>
  )
}
