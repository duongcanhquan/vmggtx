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
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Receipt,
  UserPlus,
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
  Globe,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { OrgTreeSelector } from '@/components/shared/OrgTreeSelector'
import { useMyRole } from '@/lib/hooks/useMyRole'
import type { Role } from '@/lib/auth/roles'

// ============================================================
// MA TRẬN PHÂN QUYỀN MENU
// - Menu gom thành NHÓM LỚN, bấm vào xổ cây mục con.
// - Mỗi mục khai báo roles được phép thấy; không khai báo = mọi
//   role nhân sự đều thấy.
// - Đây là lớp che UI; middleware (ROUTE_RULES) + Server Action
//   là lớp chặn thật sự — cả 2 phải khớp nhau.
// ============================================================

type MenuLeaf = {
  label: string
  href: string
  icon: LucideIcon
  roles?: Role[]
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
    label: 'Tuyển sinh & Truyền thông',
    icon: Megaphone,
    children: [
      {
        label: 'Tuyển sinh (CRM)',
        href: '/crm/leads',
        icon: Megaphone,
        roles: [...ACADEMIC, 'admission_staff'],
      },
      {
        label: 'Thông báo chung',
        href: '/announcements',
        icon: BellRing,
        roles: ACADEMIC,
      },
    ],
  },
  {
    label: 'Đào tạo & Học vụ',
    icon: BookOpen,
    children: [
      { label: 'Lớp học', href: '/classes', icon: BookOpen, roles: ACADEMIC },
      {
        label: 'Điểm danh',
        href: '/attendance',
        icon: ClipboardCheck,
        roles: [...ACADEMIC, 'teacher'],
      },
      {
        label: 'Vận hành (Giáo vụ)',
        href: '/staff/classes',
        icon: Briefcase,
        roles: ACADEMIC,
      },
      {
        label: 'Lịch dạy (GV)',
        href: '/teacher/schedule',
        icon: Calendar,
        roles: [...ACADEMIC, 'teacher'],
      },
      {
        label: 'Duyệt đơn GV',
        href: '/academic/requests',
        icon: Inbox,
        roles: ACADEMIC,
      },
      {
        label: 'Cảnh báo học vụ',
        href: '/academic/warnings',
        icon: AlertTriangle,
        roles: ACADEMIC,
      },
    ],
  },
  {
    label: 'Quản lý Nhân sự',
    icon: Users,
    children: [
      {
        label: 'Học sinh',
        href: '/students',
        icon: GraduationCap,
        roles: [...ACADEMIC, 'admission_staff'],
      },
      {
        label: 'Import Học sinh',
        href: '/students/import',
        icon: UserPlus,
        roles: [...ACADEMIC, 'admission_staff'],
      },
      {
        label: 'Tài khoản & Nhân viên',
        href: '/campus-admin/users',
        icon: Users,
        roles: MANAGERS,
      },
      {
        label: 'Đánh giá GV',
        href: '/academic/evaluations',
        icon: Star,
        roles: ACADEMIC,
      },
      {
        label: 'Lương & Hợp đồng',
        href: '/hr/contracts',
        icon: FileSignature,
        roles: [...MANAGERS, 'accountant'],
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
      },
      {
        label: 'Tài sản & Khấu hao',
        href: '/assets',
        icon: Boxes,
        roles: [...ACADEMIC, 'accountant'],
      },
    ],
  },
  {
    label: 'Kho tri thức AI',
    href: '/ai/knowledge-base',
    icon: BookMarked,
    roles: [...ACADEMIC, 'teacher'],
  },
  {
    label: 'Cài đặt',
    icon: Settings,
    children: [
      { label: 'Cài đặt Cơ sở', href: '/settings', icon: Settings, roles: MANAGERS },
      {
        label: 'Cài đặt Toàn cục',
        href: '/admin/settings',
        icon: Globe,
        roles: ['super_admin'],
      },
    ],
  },
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const role = useMyRole()

  // Phản hồi TỨC THÌ: spinner trên item vừa bấm, xóa khi pathname đổi.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  // Lọc menu theo ma trận role
  const visibleMenu = useMemo(() => {
    const result: MenuEntry[] = []
    for (const entry of MENU) {
      if (isGroup(entry)) {
        const children = entry.children.filter((leaf) => canSee(role, leaf.roles))
        if (children.length > 0) result.push({ ...entry, children })
      } else if (canSee(role, entry.roles)) {
        result.push(entry)
      }
    }
    return result
  }, [role])

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
    const owner = MENU.find(
      (entry) => isGroup(entry) && entry.children.some((leaf) => leaf.href === activeHref)
    )
    if (owner) {
      setExpanded((prev) =>
        prev[owner.label] ? prev : { ...prev, [owner.label]: true }
      )
    }
  }, [activeHref])

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
          GDTX <span className="text-gold-gradient">ERP</span>
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
