'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Loader2, Menu, X, type LucideIcon } from 'lucide-react'
import { UserMenu } from '@/components/shared/UserMenu'
import { OrgBrandMark } from '@/components/shared/OrgBrandMark'
import { ModuleAskAi } from '@/components/ai/ModuleAskAi'

// ============================================================
// PortalShell — khung layout Back-Office dùng chung (Admin/Staff).
// Sidebar desktop: mặc định icon-rail; hover/focus → menu đầy đủ
// (overlay, không đẩy nội dung). Mobile dùng drawer.
// Header có slot bên phải (OrgTreeSelector / badge tên cơ sở).
// ============================================================

export type PortalNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export type PortalNavGroup = {
  /** Nhãn nhóm (VD: "Hành chính", "Khảo thí"); bỏ trống = không hiện */
  label?: string
  items: PortalNavItem[]
}

type PortalShellProps = {
  /** Tên portal hiển thị dưới logo (VD: "Admin Portal") */
  portalName: string
  navGroups: PortalNavGroup[]
  /** Hiện nút nổi Hỏi AI theo module (Staff/Admin vận hành) */
  showAskAi?: boolean
  /** Slot bên phải header (OrgTreeSelector, badge cơ sở…) */
  headerRight?: ReactNode
  children: ReactNode
}

function NavLinks({
  navGroups,
  collapsed,
  onNavigate,
}: {
  navGroups: PortalNavGroup[]
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  // Phản hồi TỨC THÌ: spinner ngay trên item vừa bấm cho tới khi trang mới vào
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Menu chính">
      {navGroups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex}>
          {group.label && !collapsed && (
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-500">
              {group.label}
            </p>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
              const isPending = pendingHref === item.href && !isActive
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (!isActive) setPendingHref(item.href)
                    onNavigate?.()
                  }}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'border border-[#5d68e8]/30 bg-[#5d68e8]/10 text-[#a5b5f7] shadow-sm'
                      : isPending
                        ? 'bg-white/10 text-stone-100'
                        : 'text-stone-400 hover:bg-white/5 hover:text-stone-100'
                  }`}
                >
                  {isPending ? (
                    <Loader2
                      className="h-5 w-5 shrink-0 animate-spin text-[#a5b5f7]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  )}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function Brand({ portalName, collapsed }: { portalName: string; collapsed: boolean }) {
  return (
    <div
      className={`flex h-16 items-center border-b border-white/10 px-4 ${
        collapsed ? 'justify-center px-2' : ''
      }`}
    >
      {collapsed ? (
        <OrgBrandMark size="md" tone="dark" />
      ) : (
        <OrgBrandMark size="md" tone="dark" showWordmark subtitle={portalName} />
      )}
    </div>
  )
}

/** Nền sidebar tối sang trọng dùng chung desktop + drawer */
const SIDEBAR_BG =
  'bg-[radial-gradient(120%_80%_at_100%_0%,rgba(146,93,242,0.22),transparent_55%),linear-gradient(170deg,#232457_0%,#1c1b4b_55%,#12122e_100%)]'

export function PortalShell({
  portalName,
  navGroups,
  showAskAi = false,
  headerRight,
  children,
}: PortalShellProps) {
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const collapsed = !desktopExpanded

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ===== Sidebar desktop: rail icon; hover mở rộng overlay ===== */}
      <aside
        onMouseEnter={() => setDesktopExpanded(true)}
        onMouseLeave={() => setDesktopExpanded(false)}
        onFocusCapture={() => setDesktopExpanded(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDesktopExpanded(false)
          }
        }}
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden transition-[width,box-shadow] duration-200 ease-out lg:flex ${SIDEBAR_BG} ${
          collapsed ? 'w-[76px]' : 'w-64 shadow-lg'
        }`}
      >
        <Brand portalName={portalName} collapsed={collapsed} />
        <NavLinks navGroups={navGroups} collapsed={collapsed} />
      </aside>

      {/* ===== Drawer mobile/tablet ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-lg ${SIDEBAR_BG}`}
          >
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-stone-400 transition-colors duration-200 hover:bg-white/10 hover:text-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <Brand portalName={portalName} collapsed={false} />
            <NavLinks
              navGroups={navGroups}
              collapsed={false}
              onNavigate={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* ===== Header + nội dung: luôn chừa rail 76px ===== */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[76px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Mở menu"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-foreground transition-colors duration-200 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {headerRight}
            <UserMenu />
          </div>
        </header>

        {/* Full-width: tận dụng toàn bộ màn hình desktop, không lề trống */}
        <main className="w-full flex-1 p-3 sm:p-4 xl:px-6">
          {children}
        </main>
        {showAskAi ? <ModuleAskAi /> : null}
      </div>
    </div>
  )
}
