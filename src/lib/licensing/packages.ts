import { MENU_SECTIONS, type MenuKey } from '@/lib/auth/menuRegistry'

// ============================================================
// DANH MỤC MODULE BÁN & GÓI DỊCH VỤ (tầng LICENSE - migration 044)
// - Đơn vị bán = MenuKey của menuRegistry (mỗi tính năng 1 module,
//   tick chọn khi mở cơ sở hoặc mua thêm).
// - Gói = tổ hợp module định sẵn; chọn "Tùy chỉnh" để tick tay.
// - settings_global là công cụ riêng của super_admin, KHÔNG bán.
// ============================================================

/** Các module có thể bán cho cơ sở (loại trừ công cụ super_admin) */
export const SELLABLE_MODULE_KEYS: MenuKey[] = MENU_SECTIONS.map((s) => s.key).filter(
  (key) => key !== 'settings_global'
)

/** Module lõi luôn có trong MỌI gói (không vận hành nổi nếu thiếu) */
export const CORE_MODULE_KEYS: MenuKey[] = [
  'students',
  'classes',
  'attendance',
  'announcements',
  'teachers',
  'staff_users',
  'settings_org',
  'organizations',
  'permissions',
]

export interface LicensePlan {
  key: string
  label: string
  description: string
  moduleKeys: MenuKey[]
}

export const LICENSE_PLANS: LicensePlan[] = [
  {
    key: 'basic',
    label: 'Gói Cơ bản',
    description: 'Quản lý học viên, lớp học, điểm danh, lịch dạy - đủ vận hành lớp.',
    moduleKeys: [...CORE_MODULE_KEYS, 'teacher_schedule'],
  },
  {
    key: 'advanced',
    label: 'Gói Nâng cao',
    description: 'Thêm Tài chính - Học phí, Lương & Hợp đồng, CRM tuyển sinh, Giáo vụ & Khảo thí.',
    moduleKeys: [
      ...CORE_MODULE_KEYS,
      'teacher_schedule',
      'teacher_requests',
      'academic_warnings',
      'evaluations',
      'finance_invoices',
      'payroll_contracts',
      'crm',
      'staff_ops',
    ],
  },
  {
    key: 'full',
    label: 'Gói Toàn diện',
    description: 'Toàn bộ module, gồm AI - Kho tri thức và Quản lý tài sản.',
    moduleKeys: [...SELLABLE_MODULE_KEYS],
  },
]

export const CUSTOM_PLAN_KEY = 'custom'

export function planByKey(key: string): LicensePlan | null {
  return LICENSE_PLANS.find((plan) => plan.key === key) ?? null
}

export function planLabel(key: string): string {
  return planByKey(key)?.label ?? 'Tùy chỉnh'
}
