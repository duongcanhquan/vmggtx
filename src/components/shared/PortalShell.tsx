'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  GraduationCap,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react'

// ============================================================
// PortalShell — khung layout Back-Office dùng chung (Admin/Staff).
// Sidebar dọc kiểu Shadcn: thu gọn được (icon-only), trạng thái
// collapsed LƯU localStorage theo storageKey; mobile dùng drawer.
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
  /** Slot bên phải header (OrgTreeSelector, badge cơ sở…) */
  headerRight?: ReactNode
  /** Key localStorage lưu trạng thái thu gọn sidebar */
  storageKey: string
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

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Menu chính">
      {navGroups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex}>
          {group.label && !collapsed && (
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-indigo-50 hover:text-primary'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
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
      className={`flex h-16 items-center gap-2.5 border-b border-border px-4 ${
        collapsed ? 'justify-center px-2' : ''
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <GraduationCap className="h-5 w-5" aria-hidden="true" />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate font-heading text-base font-bold leading-tight tracking-tight">
            GDTX <span className="text-primary">ERP</span>
          </span>
          <span className="block truncate text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {portalName}
          </span>
        </span>
      )}
    </div>
  )
}

export function PortalShell({
  portalName,
  navGroups,
  headerRight,
  storageKey,
  children,
}: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Khôi phục trạng thái thu gọn (đọc trong effect để tránh lệch hydration)
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === '1')
    } catch {
      /* localStorage bị chặn (private mode) — dùng mặc định */
    }
  }, [storageKey])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* bỏ qua */
      }
      return next
    })
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ===== Sidebar desktop (thu gọn được) ===== */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <Brand portalName={portalName} collapsed={collapsed} />
        <NavLinks navGroups={navGroups} collapsed={collapsed} />
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
            aria-expanded={!collapsed}
            className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>Thu gọn</span>
              </>
            )}
          </button>
        </div>
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
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-lg">
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-200 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {/* ===== Header + nội dung ===== */}
      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
        }`}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Mở menu"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-foreground transition-colors duration-200 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="ml-auto flex items-center gap-3">{headerRight}</div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
