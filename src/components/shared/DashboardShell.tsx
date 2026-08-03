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
  CalendarRange,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  BookOpenCheck,
  BarChart3,
  DoorOpen,
  Receipt,
  ShieldCheck,
  Users,
  Menu,
  X,
  FileSignature,
  GraduationCap,
  Inbox,
  AlertTriangle,
  Boxes,
  Calculator,
  Megaphone,
  Settings,
  BookMarked,
  Layers,
  Car,
  Star,
  Wallet,
  MonitorPlay,
  Plane,
  FileStack,
  PenSquare,
  CheckSquare,
  CalendarCog,
  Sparkles,
  SlidersHorizontal,
  RefreshCcw,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react'
import { OrgTreeSelector } from '@/components/shared/OrgTreeSelector'
import { UserMenu } from '@/components/shared/UserMenu'
import { useMyRole } from '@/lib/hooks/useMyRole'
import { useMyMenuKeys } from '@/lib/hooks/useMyMenuKeys'
import { useMyMenuGrants } from '@/lib/hooks/useMyMenuGrants'
import { useMyModuleFlags } from '@/lib/hooks/useMyModuleFlags'
import type { MenuKey } from '@/lib/auth/menuRegistry'
import type { Role } from '@/lib/auth/roles'
import { OrgBrandMark } from '@/components/shared/OrgBrandMark'

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
    label: 'Báo cáo',
    icon: BarChart3,
    children: [
      {
        label: 'Tổng hợp vận hành',
        href: '/reports',
        icon: BarChart3,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'reports',
      },
      {
        label: 'Báo cáo học vụ',
        href: '/reports/academic',
        icon: BookOpenCheck,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'reports',
      },
      {
        label: 'Báo cáo khảo thí',
        href: '/reports/exams',
        icon: FileStack,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'exams',
      },
    ],
  },
  {
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
        label: 'Chương trình môn học',
        href: '/academic/subjects',
        icon: BookMarked,
        roles: ACADEMIC,
        menuKey: 'classes',
      },
      {
        label: 'Lớp hành chính',
        href: '/classes/groups',
        icon: Layers,
        roles: ACADEMIC,
        menuKey: 'classes',
      },
      {
        label: 'Học phần',
        href: '/classes',
        icon: BookOpen,
        roles: ACADEMIC,
        menuKey: 'classes',
      },
      {
        label: 'LMS Online',
        href: '/academic/lms',
        icon: MonitorPlay,
        roles: ACADEMIC,
        menuKey: 'lms',
      },
      {
        label: 'Xếp lịch / TKB',
        href: '/academic/schedule',
        icon: CalendarRange,
        roles: ACADEMIC,
        menuKey: 'staff_ops',
      },
      {
        label: 'Thời khóa biểu tuần',
        href: '/staff/timetable',
        icon: Calendar,
        roles: ACADEMIC,
        menuKey: 'staff_ops',
      },
      {
        label: 'Điều phối lịch (dạy thay/bù)',
        href: '/staff/schedule-management',
        icon: CalendarCog,
        roles: ACADEMIC,
        menuKey: 'staff_ops',
      },
      {
        label: 'Điểm danh',
        href: '/attendance',
        icon: ClipboardCheck,
        roles: [...ACADEMIC, 'teacher'],
        menuKey: 'attendance',
      },
      {
        label: 'Lớp vận hành (Staff)',
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
      {
        label: 'Phân công công việc',
        href: '/academic/tasks',
        icon: ClipboardList,
        roles: ACADEMIC,
        menuKey: 'work_tasks',
      },
    ],
  },
  {
    label: 'Hành chính & CSVC',
    icon: Building2,
    children: [
      {
        label: 'Đặt phòng & thiết bị',
        href: '/facilities',
        icon: CalendarPlus,
        roles: [...ACADEMIC, 'teacher'],
        menuKey: 'facilities',
      },
      {
        label: 'Đặt xe công vụ',
        href: '/facilities/vehicles',
        icon: Car,
        roles: [...ACADEMIC, 'teacher'],
        menuKey: 'facilities',
      },
      {
        label: 'Danh mục phòng / TB / xe',
        href: '/academic/rooms',
        icon: DoorOpen,
        roles: ACADEMIC,
        menuKey: 'facilities',
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
    label: 'Khảo thí',
    icon: PenSquare,
    children: [
      {
        label: 'Trung tâm Khảo thí',
        href: '/staff/exam-office',
        icon: ShieldCheck,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Ngân hàng đề',
        href: '/staff/exam-bank',
        icon: FileStack,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Kỳ thi',
        href: '/staff/exams',
        icon: PenSquare,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Lịch thi & Giám thị',
        href: '/staff/exam-schedule',
        icon: CalendarClock,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Tổ chức thi & Thi lại',
        href: '/staff/assessments',
        icon: RefreshCcw,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Quản lý & công bố điểm',
        href: '/staff/exam-grades',
        icon: CheckSquare,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Xuất thông tin thi',
        href: '/staff/exam-export',
        icon: FileSpreadsheet,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Bảng điểm tổng',
        href: '/academic/transcripts',
        icon: BookOpenCheck,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Báo cáo thi cử',
        href: '/reports/exams',
        icon: BarChart3,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Lộ trình học tập HV',
        href: '/staff/learning-pathways',
        icon: GraduationCap,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
      {
        label: 'Xét duyệt kết quả',
        href: '/staff/results-approval',
        icon: CheckSquare,
        roles: ACADEMIC,
        menuKey: 'exams',
      },
    ],
  },
  {
    label: 'Giáo viên',
    icon: Users,
    children: [
      {
        label: 'Danh sách giáo viên',
        href: '/teachers',
        icon: Users,
        roles: ACADEMIC,
        menuKey: 'teachers',
      },
      {
        label: 'Lịch dạy của tôi',
        href: '/teacher/schedule',
        icon: Calendar,
        roles: ['teacher', 'campus_admin', 'academic_staff', 'super_admin'],
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
        label: 'Đợt đánh giá GV',
        href: '/academic/campaigns',
        icon: ClipboardList,
        roles: ACADEMIC,
        menuKey: 'evaluations',
      },
      {
        label: 'Báo cáo đánh giá GV',
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
        label: 'Tổ chức nhân sự',
        href: '/campus-admin/users',
        icon: Users,
        roles: MANAGERS,
        menuKey: 'staff_users',
      },
      {
        label: 'Chức danh & mẫu quyền',
        href: '/campus-admin/job-titles',
        icon: ShieldCheck,
        roles: MANAGERS,
        menuKey: 'staff_users',
      },
      {
        label: 'Hồ sơ & giấy tờ',
        href: '/hr/personnel',
        icon: Briefcase,
        roles: [...MANAGERS, 'accountant', 'academic_staff'],
        menuKey: 'hr_personnel',
      },
      {
        label: 'Lương & Hợp đồng',
        href: '/hr/contracts',
        icon: FileSignature,
        roles: [...MANAGERS, 'accountant'],
        menuKey: 'payroll_contracts',
      },
      {
        label: 'Kỳ tính lương',
        href: '/finance/payroll',
        icon: Calculator,
        roles: [...MANAGERS, 'accountant'],
        menuKey: 'payroll_contracts',
      },
      {
        label: 'Ngày công & Phép',
        href: '/hr/attendance',
        icon: CalendarClock,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'hr_leave',
      },
      {
        label: 'Xin nghỉ phép',
        href: '/hr/my-leave',
        icon: Plane,
        roles: [
          'teacher',
          'academic_staff',
          'admission_staff',
          'accountant',
          'campus_admin',
          'super_admin',
        ],
        menuKey: 'hr_leave',
      },
    ],
  },
  {
    label: 'Tài chính',
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
        label: 'Công thức học phí',
        href: '/finance/tuition-rules',
        icon: Calculator,
        roles: [...ACADEMIC, 'accountant'],
        menuKey: 'finance_invoices',
      },
      {
        label: 'Kỳ tính lương',
        href: '/finance/payroll',
        icon: Wallet,
        roles: [...MANAGERS, 'accountant'],
        menuKey: 'payroll_contracts',
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
        label: 'Cài đặt AI theo cơ sở',
        href: '/settings/ai',
        icon: Sparkles,
        roles: MANAGERS,
        menuKey: 'settings_org',
      },
      {
        label: 'Trường tùy chỉnh',
        href: '/settings/custom-fields',
        icon: SlidersHorizontal,
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
      {
        label: 'Hướng dẫn sử dụng',
        href: '/hdsd',
        icon: BookOpen,
        roles: [...ACADEMIC, 'admission_staff', 'accountant', 'teacher'],
      },
    ],
  },
]

// ============================================================
// MENU RIÊNG CHO SUPER ADMIN - CHỈ 3 việc:
// 1. Tổng quan: bao nhiêu Đơn vị, license nào sắp hết hạn.
// 2. Quản lý Đơn vị: tạo/sửa Đơn vị (Trường) + gán Admin Đơn vị.
//    Cơ sở/Trung tâm BÊN TRONG chỉ xem — Admin Đơn vị tự tổ chức.
// 3. Module & Gói dịch vụ: chọn Đơn vị -> gán gói, ghép/gỡ module.
// MỌI cài đặt/vận hành khác thuộc Admin ĐƠN VỊ tự cá nhân hóa.
// ============================================================
const SUPER_MENU: MenuEntry[] = [
  { label: 'Tổng quan', href: '/admin', icon: LayoutDashboard },
  { label: 'Quản lý Đơn vị', href: '/admin/organizations', icon: Building2 },
  { label: 'Gói dịch vụ', href: '/admin/modules', icon: Boxes },
  {
    label: 'Cài đặt chung',
    href: '/admin/settings',
    icon: Settings,
    menuKey: 'settings_global',
  },
]

const GROUPS_STORAGE_KEY = 'gdtx-menu-groups-v2'

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

/** Tầng 2: ma trận + license (get_my_menu_keys).
 *  super_admin bỏ qua. campus_admin bị CAP bởi module đã mua khi
 *  menuKeys !== null (D12); fail-open khi chưa có license. */
function grantedByMatrix(
  role: Role | null | undefined,
  menuKeys: MenuKey[] | null | undefined,
  leafKey?: MenuKey
): boolean {
  if (!leafKey) return true
  if (role === 'super_admin') return true
  // Đang tải hoặc không có ghi đè/license -> theo ma trận mặc định (roles)
  if (menuKeys === undefined || menuKeys === null) return true
  return menuKeys.includes(leafKey)
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const role = useMyRole()
  const menuKeys = useMyMenuKeys()
  const menuGrants = useMyMenuGrants()
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
  // + QUYỀN KIÊM NHIỆM (049): key được gán riêng cho user LUÔN hiện,
  //   bất kể vai trò mặc định (trừ khi module bị tắt).
  const visibleMenu = useMemo(() => {
    const disabledModules = moduleFlags?.modules ?? []
    const grants = menuGrants ?? []
    const allowLeaf = (leaf: MenuLeaf) =>
      ((canSee(role, leaf.roles) && grantedByMatrix(role, menuKeys, leaf.menuKey)) ||
        (!!leaf.menuKey && grants.includes(leaf.menuKey))) &&
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
  }, [role, menuKeys, menuGrants, moduleFlags, baseMenu])

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
            ? 'border border-[#7e8ef0]/40 bg-gradient-to-r from-[#5d68e8]/30 to-[#925df2]/20 text-white shadow-[0_4px_18px_-6px_rgba(93,104,232,0.55)]'
            : isPending
              ? 'bg-white/10 text-white'
              : 'text-[#9aa5d8] hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        {isPending ? (
          <Loader2
            className={`shrink-0 animate-spin text-[#a5b5f7] ${nested ? 'h-4 w-4' : 'h-5 w-5'}`}
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
      <div className="flex h-16 items-center px-5">
        <OrgBrandMark size="md" tone="dark" showWordmark />
      </div>
      <div className="gold-hairline mx-5" aria-hidden="true" />
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menu chính">
        {visibleMenu.map((entry) => {
          if (!isGroup(entry)) return renderLeaf(entry, false)

          const GroupIcon = entry.icon
          const containsActive = entry.children.some((leaf) => leaf.href === activeHref)
          // Mặc định MỞ hết nhóm để hiện đủ module đã phát triển (user đóng tay thì nhớ localStorage)
          const isOpen = expanded[entry.label] ?? true
          return (
            <div key={entry.label}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.label)}
                aria-expanded={isOpen}
                className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  containsActive && !isOpen
                    ? 'text-[#c9b5fc]'
                    : 'text-[#b8c1e8] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <GroupIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#7a83b8] transition-transform duration-200 ${
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

/** Nền sidebar "đêm chàm" — gradient indigo sâu + vệt aurora tím dùng chung desktop + drawer */
const SIDEBAR_BG =
  'bg-[radial-gradient(120%_80%_at_100%_0%,rgba(146,93,242,0.22),transparent_55%),linear-gradient(170deg,#232457_0%,#1c1b4b_55%,#12122e_100%)]'

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
        <header className="glass-strong sticky top-0 z-20 flex h-16 items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 sm:px-6">
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
