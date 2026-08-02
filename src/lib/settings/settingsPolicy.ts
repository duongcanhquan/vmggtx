import type { OrgConfig } from '@/lib/validation/schemas'

// ============================================================
// CHÍNH SÁCH GHI ĐÈ CÀI ĐẶT [ORG_MODEL.md G5]
// Admin ĐƠN VỊ quyết định cho từng NHÓM quy định: cơ sở bên dưới
// được kế thừa & ghi đè, bị khóa cứng, hay bắt buộc tự cấu hình.
// Chính sách lưu trong org_settings.config.override_policies của
// CHÍNH Đơn vị (type='campus') — cơ sở con chỉ đọc.
// ============================================================

export type SettingGroupKey = 'academic' | 'communication' | 'finance' | 'identity' | 'crm'

export type OverridePolicy = 'inherit' | 'locked' | 'required'

export const SETTING_GROUPS: {
  key: SettingGroupKey
  label: string
  fields: (keyof OrgConfig)[]
}[] = [
  {
    key: 'academic',
    label: 'Học vụ',
    fields: ['max_absence_warning', 'grading_locked_days'],
  },
  {
    key: 'communication',
    label: 'Giao tiếp / SMS',
    fields: ['auto_attendance_sms'],
  },
  {
    key: 'finance',
    label: 'Tài chính',
    fields: ['require_manager_approval_for_refunds'],
  },
  {
    key: 'identity',
    label: 'Mã học viên',
    fields: ['org_code', 'student_code_format'],
  },
  {
    key: 'crm',
    label: 'Tuyển sinh / CRM',
    fields: [
      'crm_ai_enabled',
      'crm_require_cccd',
      'crm_require_parent',
      'crm_require_career',
      'crm_ai_tone',
      'crm_default_follow_up_hours',
      'crm_ai_system_note',
    ],
  },
]

export const POLICY_OPTIONS: {
  value: OverridePolicy
  label: string
  hint: string
}[] = [
  {
    value: 'inherit',
    label: 'Kế thừa · được ghi đè',
    hint: 'Cơ sở dùng quy định chung, được tự chỉnh theo địa bàn nếu cần.',
  },
  {
    value: 'locked',
    label: 'Khóa cứng',
    hint: 'Toàn Đơn vị dùng chung — cơ sở chỉ xem, không tự đổi được.',
  },
  {
    value: 'required',
    label: 'Bắt buộc tự cấu hình',
    hint: 'Mỗi cơ sở phải tự khai báo riêng, không dựa bản chung.',
  },
]

export type OverridePolicies = Partial<Record<SettingGroupKey, OverridePolicy>>

export function isOverridePolicy(value: unknown): value is OverridePolicy {
  return value === 'inherit' || value === 'locked' || value === 'required'
}

/** Đọc chính sách từ config JSONB thô (fail-soft: thiếu/hỏng = inherit) */
export function parseOverridePolicies(raw: unknown): OverridePolicies {
  if (!raw || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const result: OverridePolicies = {}
  for (const group of SETTING_GROUPS) {
    const value = source[group.key]
    if (isOverridePolicy(value)) result[group.key] = value
  }
  return result
}
