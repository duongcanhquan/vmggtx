'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ============================================================
// SectionTabs - thanh TAB gom các trang cùng một mục nghiệp vụ
// (VD: "Lương & Hợp đồng" = tab Hợp đồng + tab Kỳ tính lương).
// Mỗi tab là một route riêng; tab active xác định theo pathname.
// ============================================================

export interface SectionTab {
  label: string
  href: string
  icon?: LucideIcon
}

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  // Tab active = href khớp dài nhất (tránh /students sáng cùng /students/import)
  let activeHref = ''
  for (const tab of tabs) {
    const match = pathname === tab.href || pathname.startsWith(tab.href + '/')
    if (match && tab.href.length > activeHref.length) activeHref = tab.href
  }

  return (
    <div
      role="tablist"
      className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1 shadow-sm sm:w-fit"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.href === activeHref
        const isPending = pendingHref === tab.href && !isActive
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) setPendingHref(tab.href)
            }}
            className={`flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : isPending
                  ? 'bg-indigo-50 text-primary'
                  : 'text-muted-foreground hover:bg-indigo-50 hover:text-foreground'
            }`}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              Icon && <Icon className="h-4 w-4" aria-hidden="true" />
            )}
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
