'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Loader2,
  LayoutDashboard,
  BellRing,
  BookOpen,
  Briefcase,
  Calendar,
  ClipboardCheck,
  Receipt,
  UserPlus,
  Users,
  Wallet,
  Menu,
  X,
  GraduationCap,
  FileSignature,
  Inbox,
  AlertTriangle,
  Boxes,
  Megaphone,
  Settings,
  BookMarked,
  Globe,
  Star,
} from 'lucide-react'
import { OrgTreeSelector } from '@/components/shared/OrgTreeSelector'

const MENU_ITEMS = [
  { label: 'Tổng quan', href: '/', icon: LayoutDashboard },
  { label: 'Tuyển sinh (CRM)', href: '/crm/leads', icon: Megaphone },
  { label: 'Lớp học', href: '/classes', icon: BookOpen },
  { label: 'Điểm danh', href: '/attendance', icon: ClipboardCheck },
  { label: 'Học sinh', href: '/students', icon: GraduationCap },
  { label: 'Import Học sinh', href: '/students/import', icon: UserPlus },
  { label: 'Nhân sự', href: '/campus-admin/users', icon: Users },
  { label: 'Vận hành (Giáo vụ)', href: '/staff/classes', icon: Briefcase },
  { label: 'Lịch dạy (GV)', href: '/teacher/schedule', icon: Calendar },
  { label: 'Duyệt đơn GV', href: '/academic/requests', icon: Inbox },
  { label: 'Thông báo chung', href: '/announcements', icon: BellRing },
  { label: 'Học phí & Công nợ', href: '/finance/invoices', icon: Receipt },
  { label: 'Tính lương', href: '/finance/payroll', icon: Wallet },
  { label: 'Lương & Hợp đồng', href: '/hr/contracts', icon: FileSignature },
  { label: 'Tài sản & Khấu hao', href: '/assets', icon: Boxes },
  { label: 'Cảnh báo học vụ', href: '/academic/warnings', icon: AlertTriangle },
  { label: 'Đánh giá GV', href: '/academic/evaluations', icon: Star },
  { label: 'Kho tri thức AI', href: '/ai/knowledge-base', icon: BookMarked },
  { label: 'Cài đặt Cơ sở', href: '/settings', icon: Settings },
  { label: 'Cài đặt Toàn cục', href: '/admin/settings', icon: Globe },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  // Phản hồi TỨC THÌ: đánh dấu item vừa bấm bằng spinner ngay khi click,
  // xóa khi pathname đổi (trang mới đã vào).
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  return (
    <>
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#c9a227]/40 bg-gradient-to-br from-[#292524] to-[#0c0a09] text-[#e5c369]">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-heading text-lg font-bold tracking-tight text-stone-100">
          GDTX <span className="text-gold-gradient">ERP</span>
        </span>
      </div>
      <div className="gold-hairline mx-5" aria-hidden="true" />
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menu chính">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const isPending = pendingHref === item.href && !isActive
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (!isActive) setPendingHref(item.href)
                onNavigate?.()
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? 'border border-[#c9a227]/30 bg-[#c9a227]/10 text-[#e5c369] shadow-sm'
                  : isPending
                    ? 'bg-white/10 text-stone-100'
                    : 'text-stone-400 hover:bg-white/5 hover:text-stone-100'
              }`}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#e5c369]" aria-hidden="true" />
              ) : (
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}

/** Nền sidebar tối sang trọng dùng chung desktop + drawer */
const SIDEBAR_BG =
  'bg-[linear-gradient(170deg,#221f1c_0%,#1c1917_55%,#141110_100%)]'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop (>= lg) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex ${SIDEBAR_BG}`}
      >
        <SidebarContent />
      </aside>

      {/* Drawer mobile/tablet */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-lg ${SIDEBAR_BG}`}
          >
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-3 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-stone-400 transition-colors duration-200 hover:bg-white/10 hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Vùng phải: header + nội dung */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Mở menu"
            onClick={() => setSidebarOpen(true)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-foreground transition-colors duration-200 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="ml-auto">
            <OrgTreeSelector />
          </div>
        </header>

        <main className="mx-auto w-full max-w-screen-2xl flex-1 p-4 sm:p-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
