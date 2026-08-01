import type { Role } from './roles'

// ============================================================
// DANH MỤC MENU CHUẨN (Menu Registry) - nguồn sự thật DUY NHẤT
// cho ma trận phân quyền động:
// - DashboardShell lọc menu theo key.
// - Trang /admin/permissions render ma trận checkbox theo key.
// - Middleware map pathname -> key để chặn truy cập trực tiếp.
//
// PHÂN QUYỀN 2 TẦNG:
// 1. defaultRoles = ma trận MẶC ĐỊNH theo role (cứng trong code).
// 2. Bảng menu_permissions (043) GHI ĐÈ theo từng cơ sở + role:
//    super_admin cấp cho campus_admin; campus_admin cấp tiếp cho
//    giáo vụ/tuyển sinh/kế toán/giáo viên trong cơ sở của mình.
//    Không được cấp -> KHÔNG thấy menu + KHÔNG vào được URL.
// ============================================================

export type MenuKey =
  | 'crm'
  | 'announcements'
  | 'classes'
  | 'attendance'
  | 'staff_ops'
  | 'academic_warnings'
  | 'teachers'
  | 'teacher_schedule'
  | 'teacher_requests'
  | 'evaluations'
  | 'students'
  | 'staff_users'
  | 'payroll_contracts'
  | 'finance_invoices'
  | 'assets'
  | 'ai_kb'
  | 'settings_org'
  | 'organizations'
  | 'permissions'
  | 'settings_global'

const MANAGERS: Role[] = ['super_admin', 'campus_admin']
const ACADEMIC: Role[] = ['super_admin', 'campus_admin', 'academic_staff']

export interface MenuSection {
  key: MenuKey
  label: string
  /** Ma trận role mặc định (khi cơ sở chưa cấu hình ghi đè) */
  defaultRoles: Role[]
  /** Prefix route để middleware chặn truy cập trực tiếp bằng URL */
  prefixes: string[]
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    key: 'crm',
    label: 'Tuyển sinh (CRM)',
    defaultRoles: [...ACADEMIC, 'admission_staff'],
    prefixes: ['/crm'],
  },
  {
    key: 'announcements',
    label: 'Thông báo chung',
    defaultRoles: ACADEMIC,
    prefixes: ['/announcements'],
  },
  {
    // LƯU Ý: teacher nằm trong defaultRoles vì Gia sư AI theo lớp
    // (/classes/[id]/tutor) do giáo viên + học viên sử dụng.
    key: 'classes',
    label: 'Lớp học (kèm Gia sư AI lớp)',
    defaultRoles: [...ACADEMIC, 'teacher'],
    prefixes: ['/classes'],
  },
  {
    key: 'attendance',
    label: 'Điểm danh',
    defaultRoles: [...ACADEMIC, 'teacher'],
    prefixes: ['/attendance'],
  },
  {
    key: 'staff_ops',
    label: 'Vận hành Giáo vụ & Khảo thí',
    defaultRoles: [...ACADEMIC, 'admission_staff', 'accountant'],
    prefixes: ['/staff'],
  },
  {
    key: 'academic_warnings',
    label: 'Cảnh báo học vụ',
    defaultRoles: ACADEMIC,
    prefixes: ['/academic/warnings'],
  },
  {
    // Danh bạ giảng viên + gán lớp cho giảng viên (admin-side)
    key: 'teachers',
    label: 'Hồ sơ Giảng viên (gán lớp)',
    defaultRoles: ACADEMIC,
    prefixes: ['/teachers'],
  },
  {
    key: 'teacher_schedule',
    label: 'Lịch dạy giáo viên',
    defaultRoles: [...ACADEMIC, 'teacher'],
    prefixes: ['/teacher/schedule'],
  },
  {
    key: 'teacher_requests',
    label: 'Duyệt đơn giáo viên',
    defaultRoles: ACADEMIC,
    prefixes: ['/academic/requests'],
  },
  {
    key: 'evaluations',
    label: 'Đánh giá giáo viên',
    defaultRoles: ACADEMIC,
    prefixes: ['/academic/evaluations', '/academic/campaigns'],
  },
  {
    key: 'students',
    label: 'Hồ sơ học sinh (kèm Import)',
    defaultRoles: [...ACADEMIC, 'admission_staff'],
    prefixes: ['/students'],
  },
  {
    key: 'staff_users',
    label: 'Tài khoản & Nhân viên',
    defaultRoles: MANAGERS,
    prefixes: ['/campus-admin/users'],
  },
  {
    key: 'payroll_contracts',
    label: 'Lương & Hợp đồng',
    defaultRoles: [...MANAGERS, 'accountant'],
    prefixes: ['/hr', '/finance/payroll'],
  },
  {
    key: 'finance_invoices',
    label: 'Học phí & Công nợ',
    defaultRoles: [...ACADEMIC, 'accountant'],
    prefixes: ['/finance/invoices'],
  },
  {
    key: 'assets',
    label: 'Tài sản & Khấu hao',
    defaultRoles: [...ACADEMIC, 'accountant'],
    prefixes: ['/assets'],
  },
  {
    key: 'ai_kb',
    label: 'Kho tri thức AI',
    defaultRoles: [...ACADEMIC, 'teacher'],
    prefixes: ['/ai'],
  },
  {
    key: 'settings_org',
    label: 'Cài đặt Cơ sở',
    defaultRoles: MANAGERS,
    prefixes: ['/settings'],
  },
  {
    // Admin cơ sở tạo/sửa/xóa nhánh con (tối đa 3 cấp dưới 1 cơ sở)
    key: 'organizations',
    label: 'Cơ sở & Chi nhánh',
    defaultRoles: MANAGERS,
    prefixes: ['/admin/organizations'],
  },
  {
    key: 'permissions',
    label: 'Phân quyền truy cập',
    defaultRoles: MANAGERS,
    prefixes: ['/admin/permissions'],
  },
  {
    key: 'settings_global',
    label: 'Cài đặt Toàn cục',
    defaultRoles: ['super_admin'],
    prefixes: ['/admin/settings'],
  },
]

/** Các role mà ma trận có thể cấu hình (student/enterprise dùng portal riêng) */
export const CONFIGURABLE_ROLES = [
  'campus_admin',
  'academic_staff',
  'admission_staff',
  'accountant',
  'teacher',
] as const

export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number]

export const CONFIGURABLE_ROLE_LABELS: Record<ConfigurableRole, string> = {
  campus_admin: 'Quản lý cơ sở',
  academic_staff: 'Giáo vụ',
  admission_staff: 'Tuyển sinh',
  accountant: 'Kế toán',
  teacher: 'Giáo viên',
}

export function isMenuKey(value: unknown): value is MenuKey {
  return (
    typeof value === 'string' &&
    MENU_SECTIONS.some((section) => section.key === value)
  )
}

/** Bộ key mặc định của 1 role (khi chưa có ghi đè trong menu_permissions) */
export function defaultKeysForRole(role: Role): MenuKey[] {
  return MENU_SECTIONS.filter((section) => section.defaultRoles.includes(role)).map(
    (section) => section.key
  )
}

/** Map pathname -> menu key (prefix khớp theo segment, dài nhất thắng) */
export function menuKeyForPath(pathname: string): MenuKey | null {
  let best: { key: MenuKey; length: number } | null = null
  for (const section of MENU_SECTIONS) {
    for (const prefix of section.prefixes) {
      const match = pathname === prefix || pathname.startsWith(`${prefix}/`)
      if (match && (!best || prefix.length > best.length)) {
        best = { key: section.key, length: prefix.length }
      }
    }
  }
  return best?.key ?? null
}
