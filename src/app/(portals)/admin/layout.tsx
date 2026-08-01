'use client'

import {
  BarChart3,
  Blocks,
  Building2,
  LayoutDashboard,
  PackageOpen,
  PiggyBank,
  Settings,
  TicketCheck,
  Users,
} from 'lucide-react'
import { PortalShell, type PortalNavGroup } from '@/components/shared/PortalShell'
import { OrgTreeSelector } from '@/components/shared/OrgTreeSelector'
import { useMyRole } from '@/lib/hooks/useMyRole'

// ============================================================
// Layout ADMIN PORTAL (/admin/*).
// - super_admin: CHỈ Quản lý Cơ sở + Phân quyền Module (License).
//   Việc vận hành/cài đặt chi tiết thuộc Admin cơ sở.
// - campus_admin: nav vận hành đầy đủ trong phạm vi cơ sở mình.
// Header BẮT BUỘC có OrgTreeSelector để lọc dữ liệu toàn cục theo
// Cụm/Cơ sở/Chi nhánh. Sidebar thu gọn được, nhớ trạng thái.
// ============================================================

const SUPER_NAV: PortalNavGroup[] = [
  {
    items: [
      { label: 'Quản lý Cơ sở', href: '/admin/organizations', icon: Building2 },
      { label: 'Phân quyền Module', href: '/admin/licenses', icon: PackageOpen },
      { label: 'Trung tâm Module', href: '/admin/modules', icon: Blocks },
    ],
  },
]

const ADMIN_NAV: PortalNavGroup[] = [
  {
    items: [
      { label: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
      { label: 'Quản lý Cơ sở', href: '/admin/organizations', icon: Building2 },
      { label: 'Quản lý Nhân sự', href: '/campus-admin/users', icon: Users },
      { label: 'Cổng dịch vụ', href: '/admin/requests', icon: TicketCheck },
      { label: 'Cài đặt Hệ thống', href: '/settings', icon: Settings },
      { label: 'Báo cáo Doanh thu', href: '/admin/revenue', icon: BarChart3 },
      { label: 'Dự báo Ngân sách', href: '/admin/budget', icon: PiggyBank },
    ],
  },
]

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  const role = useMyRole()
  const isSuper = role === 'super_admin'
  return (
    <PortalShell
      portalName={isSuper ? 'Super Admin' : 'Admin Portal'}
      navGroups={isSuper ? SUPER_NAV : ADMIN_NAV}
      storageKey="gdtx-sidebar-admin"
      headerRight={<OrgTreeSelector />}
    >
      {children}
    </PortalShell>
  )
}
