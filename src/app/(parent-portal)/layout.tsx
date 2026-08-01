'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CalendarDays, Home, Medal } from 'lucide-react'

// ============================================================
// Layout PARENT PORTAL - Sổ Liên Lạc Điện Tử cho Phụ huynh.
// Mobile-First tuyệt đối:
//  - Nội dung bó trong max-w-[480px] md:max-w-[640px], căn giữa trên desktop.
//  - Bottom Navigation Bar cố định (chuẩn app điện thoại).
//  - Trang /parent/login ẩn bottom nav (chưa có session).
// ============================================================

const PARENT_MENU = [
  { label: 'Trang chủ', href: '/dashboard', icon: Home },
  { label: 'Lịch học', href: '/parent/schedule', icon: CalendarDays },
  { label: 'Sổ điểm', href: '/parent/grades', icon: Medal },
  { label: 'Thông báo', href: '/parent/notifications', icon: Bell },
]

export default function ParentPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isLogin = pathname === '/parent/login' || pathname === '/login'

  return (
    <div className="flex min-h-dvh justify-center bg-slate-100">
      {/* Khung điện thoại: max 480px, căn giữa trên desktop */}
      <div className="relative flex min-h-dvh w-full max-w-[480px] md:max-w-[640px] flex-col bg-background shadow-xl">
        <main className={`flex-1 ${isLogin ? '' : 'pb-20'}`}>{children}</main>

        {/* ===== Bottom Navigation Bar ===== */}
        {!isLogin && (
          <nav
            aria-label="Menu phụ huynh"
            className="fixed bottom-0 z-40 w-full max-w-[480px] md:max-w-[640px] border-t border-border bg-surface/95 backdrop-blur"
          >
            <ul className="grid grid-cols-4">
              {PARENT_MENU.map((item) => {
                const Icon = item.icon
                const isActive = pathname.startsWith(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-primary'
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
        )}
      </div>
    </div>
  )
}
