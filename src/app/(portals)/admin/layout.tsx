'use client'

import {
  BarChart3,
  Building2,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react'
import { PortalShell, type PortalNavGroup } from '@/components/shared/PortalShell'
import { OrgTreeSelector } from '@/components/shared/OrgTreeSelector'

// ============================================================
// Layout ADMIN PORTAL (/admin/*) — dành cho Quản lý.
// Header BẮT BUỘC có OrgTreeSelector để lọc dữ liệu toàn cục theo
// Cụm/Cơ sở/Chi nhánh. Sidebar thu gọn được, nhớ trạng thái.
// ============================================================

const ADMIN_NAV: PortalNavGroup[] = [
  {
    items: [
      { label: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
      { label: 'Quản lý Cơ sở', href: '/admin/organizations', icon: Building2 },
      { label: 'Quản lý Nhân sự', href: '/campus-admin/users', icon: Users },
      { label: 'Cài đặt Hệ thống', href: '/settings', icon: Settings },
      { label: 'Báo cáo Doanh thu', href: '/admin/revenue', icon: BarChart3 },
    ],
  },
]

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      portalName="Admin Portal"
      navGroups={ADMIN_NAV}
      storageKey="gdtx-sidebar-admin"
      headerRight={<OrgTreeSelector />}
    >
      {children}
    </PortalShell>
  )
}
