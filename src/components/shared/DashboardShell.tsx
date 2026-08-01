'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Loader2,
  LayoutDashboard,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Receipt,
  ShieldCheck,
  Users,
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
  PackageOpen,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { OrgTreeSelector } from '@/components/shared/OrgTreeSelector'
import { UserMenu } from '@/components/shared/UserMenu'
import { useMyRole } from '@/lib/hooks/useMyRole'
import { useMyMenuKeys } from '@/lib/hooks/useMyMenuKeys'
import { useMyModuleFlags } from '@/lib/hooks/useMyModuleFlags'
import type { MenuKey } from '@/lib/auth/menuRegistry'
import type { Role } from '@/lib/auth/roles'

// ============================================================
// MA TRẬN PHÂN QUYỀN MENU (2 TẦNG)
// - Menu gom thành NHÓM LỚN, bấm vào xổ cây mục con.
// - Tầng 1 (mặc định): mỗi mục khai báo roles được phép thấy.
// - Tầng 2 (động): mục có `menuKey` chịu ma trận phân quyền
//   trong DB (menu_permissions - /admin/permissions). Super admin
//   cấp cho QL cơ sở; QL cơ sở cấp tiếp cho cấp dưới. Không được
//   cấp -> ẨN menu + middleware chặn URL.
// ============================================================

type MenuLeaf = {
  label: string
  href: string
  icon: LucideIcon
  roles?: Role[]
  /** Key trong menuRegistry - chịu phân quyền động; không có = luôn hiện theo roles */
  menuKey?: MenuKey
}

type MenuGroup = {
  label: string
  icon: LucideIcon
  children: MenuLeaf[]
}

type MenuEntry = MenuLeaf | MenuGroup

const MANAGERS: Role[] = ['super_admin', 'campus_admin']
const ACADEMIC: Role[] = ['super_admin', 'campus_admin', 'academic_staff']

const MENU: MenuEntry[] = [
  { label: 'Tổng quan', href: '/', icon: LayoutDashboard },
  {
    // Học sinh gộp Import thành TAB trong trang -> chỉ còn 1 mục menu
    label: 'Học sinh',
    href: '/students',
    icon: GraduationCap,
    roles: [...ACADEMIC, 'admission_staff'],
    menuKey: 'students',
  },
  {
    label: 'Tuyển sinh & Truyền thông',
    icon: Megaphone,
    children: [
      {
        label: 'Tuyển sinh (CRM)',
        href: '/crm/leads',
        icon: Megaphone,
        roles: [...ACADEMIC, 'admission_staff'],
        menuKey: 'crm',
      },
      {
        label: 'Thông báo chung',
        href: '/announcements',
        icon: BellRing,
        roles: ACADEMIC,
        menuKey: 'announcements',
      },
    ],
  },
  {
    label: 'Đào tạo & Học vụ',
    icon: BookOpen,
    children: [
      {
        label: 'Lớp học',
        href: '/classes',
        icon: BookOpen,
        roles: ACADEMIC,
        menuKey: 'classes',
      },
      {
        label: 'Điểm danh',
        href: '/attendance',
        icon: ClipboardCheck,
        roles: [...ACADEMIC, 'teacher'],
        menuKey: 'attendance',
      },
      {
        label: 'Vận hành Giáo vụ & Khảo thí',
        href: '/staff/classes',
        icon: Briefcase,
        roles: ACADEMIC,
        menuKey: 'staff_ops',
      },
      {
        label: 'Cảnh báo học vụ',
        href: '/academic/warnings',
        icon: AlertTriangle,
        roles: ACADEMIC,
        menuKey: 'academic_warnings',
      },
    ],
  },
  {
    label: 'Giáo viên',
    icon: Calendar,
    children: [
      {
        label: 'Lịch dạy',
        href: '/teacher/schedule',
        icon: Calendar,
        roles: [...ACADEMIC, 'teacher'],
        menuKey: 'teacher_schedule',
      },
      {
        label: 'Duyệt đơn từ',
        href: '/academic/requests',
        icon: Inbox,
        roles: ACADEMIC,
        menuKey: 'teacher_requests',
      },
      {
        label: 'Đánh giá giáo viên',
        href: '/academic/evaluations',
        icon: Star,
        roles: ACADEMIC,
        menuKey: 'evaluations',
      },
    ],
  },
  {
    label: 'Nhân sự & Lương',
    icon: Users,
    children: [
      {
        label: 'Tài khoản & Nhân viên',
        href: '/campus-admin/users',
        icon: Users,
        roles: MANAGERS,
        menuKey: 'staff_users',
      },
      {
        label: 'Lương & Hợp đồng',
        href: '/hr/contracts',
        icon: FileSignature,
        roles: [...MANAGERS, 'accountant'],
        menuKey: 'payroll_contracts',
      },
    ],
  },
  {
    label: 'Tài chính & Tài sản',
    icon: Wallet,
    children: [
      {
        label: 'Học phí & Công nợ',
        href: '/finance/invoices',
        icon: Receipt,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'finance_invoices',
      },
      {
        label: 'Tài sản & Khấu hao',
        href: '/assets',
        icon: Boxes,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'assets',
      },
    ],
  },
  {
    label: 'Kho tri thức AI',
    href: '/ai/knowledge-base',
    icon: BookMarked,
    roles: [...ACADEMIC, 'teacher'],
    menuKey: 'ai_kb',
  },
  {
    label: 'Tổ chức & Cài đặt',
    icon: Settings,
    children: [
      {
        label: 'Cơ sở & Chi nhánh',
        href: '/admin/organizations',
        icon: Building2,
        roles: MANAGERS,
        menuKey: 'organizations',
      },
      {
        label: 'Cài đặt Cơ sở',
        href: '/settings',
        icon: Settings,
        roles: MANAGERS,
        menuKey: 'settings_org',
      },
      {
        label: 'Phân quyền truy cập',
        href: '/admin/permissions',
        icon: ShieldCheck,
        roles: MANAGERS,
        menuKey: 'permissions',
      },
    ],
  },
]

// ============================================================
// MENU RIÊNG CHO SUPER ADMIN - CHỈ 2 việc:
// 1. Quản lý Cơ sở: tạo/sửa cơ sở + quản lý tài khoản Admin của
//    từng cơ sở (nút "Quản lý Admin" ngay trong cây cơ sở).
// 2. Phân quyền Module: cấp module cho cơ sở dùng (Hành chính,
//    Nhân sự, Điểm danh, Kế toán...) qua tầng License.
// MỌI cài đặt/vận hành khác thuộc Admin CƠ SỞ tự cá nhân hóa.
// ============================================================
const SUPER_MENU: MenuEntry[] = [
  { label: 'Quản lý Đơn vị', href: '/admin/organizations', icon: Building2 },
  { label: 'Phân quyền Module', href: '/admin/licenses', icon: PackageOpen },
  { label: 'Trung tâm Module', href: '/admin/modules', icon: Boxes },
]

const GROUPS_STORAGE_KEY = 'gdtx-menu-groups'

function isGroup(entry: MenuEntry): entry is MenuGroup {
  return 'children' in entry
}

function canSee(role: Role | null | undefined, roles?: Role[]): boolean {
  if (!roles) return true
  // Chưa xác định xong role -> tạm hiện để tránh sidebar "trống" khi load.
  if (role === undefined) return true
  if (role === null) return false
  return roles.includes(role)
}

/** Tầng 2: ma trận phân quyền động (menu_permissions). super_admin bỏ qua. */
function grantedByMatrix(
  role: Role | null | undefined,
  menuKeys: MenuKey[] | null | undefined,
  leafKey?: MenuKey
): boolean {
  if (!leafKey) return true
  if (role === 'super_admin') return true
  // Đang tải hoặc không có ghi đè -> theo ma trận mặc định (đã lọc bằng roles)
  if (menuKeys === undefined || menuKeys === null) return true
  return menuKeys.includes(leafKey)
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const role = useMyRole()
  const menuKeys = useMyMenuKeys()
  const moduleFlags = useMyModuleFlags()

  // Phản hồi TỨC THÌ: spinner trên item vừa bấm, xóa khi pathname đổi.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  // Super Admin dùng menu KIẾN TRÚC riêng (khởi tạo cơ sở/admin/phân quyền);
  // các role khác dùng menu vận hành đầy đủ, lọc theo 2 tầng phân quyền.
  const baseMenu = role === 'super_admin' ? SUPER_MENU : MENU

  // Lọc menu: tầng 1 theo role mặc định + tầng 2 theo ma trận động
  // + tầng 3: module bị Super Admin TẮT (module_flags - 046)
  const visibleMenu = useMemo(() => {
    const disabledModules = moduleFlags?.modules ?? []
    const allowLeaf = (leaf: MenuLeaf) =>
      canSee(role, leaf.roles) &&
      grantedByMatrix(role, menuKeys, leaf.menuKey) &&
      !(leaf.menuKey && role !== 'super_admin' && disabledModules.includes(leaf.menuKey))
    const result: MenuEntry[] = []
    for (const entry of baseMenu) {
      if (isGroup(entry)) {
        const children = entry.children.filter(allowLeaf)
        if (children.length > 0) result.push({ ...entry, children })
      } else if (allowLeaf(entry)) {
        result.push(entry)
      }
    }
    return result
  }, [role, menuKeys, moduleFlags, baseMenu])

  // Mục ACTIVE = leaf có href khớp DÀI NHẤT (tránh /students sáng cùng /students/import)
  const activeHref = useMemo(() => {
    let best = ''
    for (const entry of visibleMenu) {
      const leaves = isGroup(entry) ? entry.children : [entry]
      for (const leaf of leaves) {
        const match =
          leaf.href === '/'
            ? pathname === '/'
            : pathname === leaf.href || pathname.startsWith(leaf.href + '/')
        if (match && leaf.href.length > best.length) best = leaf.href
      }
    }
    return best
  }, [visibleMenu, pathname])

  // Trạng thái mở/đóng nhóm: nhớ trong localStorage + tự mở nhóm chứa trang hiện tại
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUPS_STORAGE_KEY)
      if (raw) setExpanded(JSON.parse(raw) as Record<string, boolean>)
    } catch {
      /* localStorage hỏng -> dùng mặc định */
    }
  }, [])
  useEffect(() => {
    if (!activeHref) return
    const owner = baseMenu.find(
      (entry) => isGroup(entry) && entry.children.some((leaf) => leaf.href === activeHref)
    )
    if (owner) {
      setExpanded((prev) =>
        prev[owner.label] ? prev : { ...prev, [owner.label]: true }
      )
    }
  }, [activeHref, baseMenu])

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* bỏ qua khi không ghi được */
      }
      return next
    })
  }

  function renderLeaf(leaf: MenuLeaf, nested: boolean) {
    const Icon = leaf.icon
    const isActive = leaf.href === activeHref
    const isPending = pendingHref === leaf.href && !isActive
    return (
      <Link
        key={leaf.href}
        href={leaf.href}
        onClick={() => {
          if (!isActive) setPendingHref(leaf.href)
          onNavigate?.()
        }}
        aria-current={isActive ? 'page' : undefined}
        className={`flex cursor-pointer items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          nested ? 'min-h-10 px-3 py-2' : 'min-h-11 px-3.5 py-2.5'
        } ${
          isActive
            ? 'border border-[#c9a227]/30 bg-[#c9a227]/10 text-[#e5c369] shadow-sm'
            : isPending
              ? 'bg-white/10 text-stone-100'
              : 'text-stone-400 hover:bg-white/5 hover:text-stone-100'
        }`}
      >
        {isPending ? (
          <Loader2
            className={`shrink-0 animate-spin text-[#e5c369] ${nested ? 'h-4 w-4' : 'h-5 w-5'}`}
            aria-hidden="true"
          />
        ) : (
          <Icon className={`shrink-0 ${nested ? 'h-4 w-4' : 'h-5 w-5'}`} aria-hidden="true" />
        )}
        {leaf.label}
      </Link>
    )
  }

  return (
    <>
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#c9a227]/40 bg-gradient-to-br from-[#292524] to-[#0c0a09] text-[#e5c369]">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-heading text-lg font-bold tracking-tight text-stone-100">
          EDU <span className="text-gold-gradient">SYSTEM</span>
        </span>
      </div>
      <div className="gold-hairline mx-5" aria-hidden="true" />
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menu chính">
        {visibleMenu.map((entry) => {
          if (!isGroup(entry)) return renderLeaf(entry, false)

          const GroupIcon = entry.icon
          const containsActive = entry.children.some((leaf) => leaf.href === activeHref)
          const isOpen = expanded[entry.label] ?? containsActive
          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                aria-expanded={isOpen}
                className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  containsActive && !isOpen
                    ? 'text-[#e5c369]'
                    : 'text-stone-300 hover:bg-white/5 hover:text-stone-100'
                }`}
              >
                <GroupIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2 pt-0.5">
                  {entry.children.map((leaf) => renderLeaf(leaf, true))}
                </div>
              )}
            </div>
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
          <div className="ml-auto flex items-center gap-2">
            <OrgTreeSelector />
            <UserMenu />
          </div>
        </header>

        {/* Full-width: tận dụng toàn bộ màn hình desktop, không lề trống */}
        <main className="w-full flex-1 p-4 sm:p-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
