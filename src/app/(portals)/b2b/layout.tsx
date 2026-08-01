'use client'

import { LayoutDashboard, Star, Users } from 'lucide-react'
import { PortalShell, type PortalNavGroup } from '@/components/shared/PortalShell'

// ============================================================
// Layout B2B PORTAL (/b2b/*) — Doanh nghiệp liên kết.
// Sidebar: Bảng điều khiển / Danh sách Thực tập sinh / Đánh giá.
// Middleware chỉ cho role enterprise_partner (và super_admin) vào.
// ============================================================

const B2B_NAV: PortalNavGroup[] = [
  {
    items: [
      { label: 'Bảng điều khiển', href: '/b2b', icon: LayoutDashboard },
      { label: 'Thực tập sinh', href: '/b2b/interns', icon: Users },
      { label: 'Đánh giá', href: '/b2b/reviews', icon: Star },
    ],
  },
]

export default function B2BPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      portalName="Doanh nghiệp đối tác"
      navGroups={B2B_NAV}
      storageKey="gdtx-sidebar-b2b"
    >
      {children}
    </PortalShell>
  )
}
