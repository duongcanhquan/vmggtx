'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Home, Medal, MonitorPlay, Settings } from 'lucide-react'

// ============================================================
// Layout STUDENT PORTAL (/student/*) — TUYỆT ĐỐI MOBILE-FIRST.
// - KHÔNG sidebar: Bottom Navigation Bar 5 icon như app điện thoại.
// - Nội dung bó trong khung max-w-[480px] md:max-w-[640px], căn giữa trên desktop.
// ============================================================

const STUDENT_MENU = [
  { label: 'Trang chủ', href: '/student', icon: Home },
  { label: 'Lịch học', href: '/schedule', icon: CalendarDays },
  { label: 'Học bài', href: '/learn', icon: MonitorPlay },
  { label: 'Sổ điểm', href: '/grades', icon: Medal },
  { label: 'Cài đặt', href: '/student/settings', icon: Settings },
]

export default function StudentWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-dvh justify-center bg-slate-100">
      {/* Khung điện thoại: max 480px */}
      <div className="relative flex min-h-dvh w-full max-w-[480px] md:max-w-[640px] flex-col bg-background shadow-xl">
        <main className="flex-1 pb-24">{children}</main>

        {/* ===== Bottom Navigation Bar ===== */}
        <nav
          aria-label="Menu học sinh"
          className="fixed bottom-0 z-40 w-full max-w-[480px] md:max-w-[640px] border-t border-border bg-surface/95 backdrop-blur"
        >
          <ul className="grid grid-cols-5">
            {STUDENT_MENU.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === '/student'
                  ? pathname === '/student'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                        isActive ? 'bg-indigo-100' : ''
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}
