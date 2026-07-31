import { z, type ZodTypeAny } from 'zod'

// ============================================================
// TRƯỜNG DỮ LIỆU ĐỘNG (Dynamic Custom Fields) - lõi dùng chung.
//
// File này KHÔNG có 'use server' / 'use client': cả Form (client,
// để render + validate realtime) lẫn Server Action (để validate
// lần 2 trước khi chạm DB) đều import cùng một bộ luật -> hai tầng
// validation không bao giờ lệch nhau.
// ============================================================

export const CUSTOM_FIELD_ENTITIES = ['student', 'teacher', 'class'] as const
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number]

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  student: 'Học sinh',
  teacher: 'Giáo viên',
  class: 'Lớp học',
}

export const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Chữ (text)',
  number: 'Số (number)',
  date: 'Ngày (date)',
  boolean: 'Có/Không (boolean)',
  select: 'Danh sách chọn (select)',
}

/** Định nghĩa 1 trường động (1 dòng trong org_custom_fields) */
export type CustomFieldDef = {
  id: string
  entityType: CustomFieldEntity
  fieldName: string
  fieldLabel: string
  fieldType: CustomFieldType
  options: string[]
  isRequired: boolean
}

/** Giá trị các trường động - object lưu vào cột custom_metadata */
export type CustomMetadata = Record<string, string | number | boolean>

// ---------------------------------------------------------------
// Zod builder: sinh schema validation THEO ĐỊNH NGHĨA của cơ sở
// ---------------------------------------------------------------

/** Coi chuỗi rỗng là "chưa nhập" để check required/optional chuẩn xác */
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

function fieldZod(def: CustomFieldDef): ZodTypeAny {
  const label = def.fieldLabel
  const requiredError = { required_error: `${label} là bắt buộc.` }

  switch (def.fieldType) {
    case 'number': {
      const base = z.coerce
        .number({ ...requiredError, invalid_type_error: `${label} phải là số.` })
        .min(-1_000_000_000, `${label} quá nhỏ.`)
        .max(1_000_000_000, `${label} quá lớn.`)
      return z.preprocess(emptyToUndefined, def.isRequired ? base : base.optional())
    }
    case 'date': {
      const base = z
        .string(requiredError)
        .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} phải là ngày hợp lệ (YYYY-MM-DD).`)
      return z.preprocess(emptyToUndefined, def.isRequired ? base : base.optional())
    }
    case 'boolean':
      // Checkbox: không có khái niệm "bắt buộc" - mặc định false
      return z.coerce.boolean().default(false)
    case 'select': {
      const base = z
        .string({ required_error: `Vui lòng chọn ${label}.` })
        .refine(
          (v) => def.options.includes(v),
          `${label}: giá trị không nằm trong danh sách cho phép.`
        )
      return z.preprocess(emptyToUndefined, def.isRequired ? base : base.optional())
    }
    default: {
      const core = z.string(requiredError).trim().max(500, `${label} tối đa 500 ký tự.`)
      const base = (def.isRequired ? core.min(1, `${label} là bắt buộc.`) : core).refine(
        (v) => !/[<>{}[\];`$]/.test(v),
        `${label} chứa ký tự đặc biệt không được phép.`
      )
      return z.preprocess(emptyToUndefined, def.isRequired ? base : base.optional())
    }
  }
}

/**
 * Sinh z.object cho TOÀN BỘ trường động của 1 entity.
 * Key = field_name (khớp key trong custom_metadata).
 */
export function buildCustomMetadataSchema(defs: CustomFieldDef[]) {
  const shape: Record<string, ZodTypeAny> = {}
  for (const def of defs) {
    shape[def.fieldName] = fieldZod(def)
  }
  return z.object(shape)
}

/**
 * Validate + làm sạch giá trị động (dùng ở SERVER trước khi ghi DB).
 * Trả về object custom_metadata đã loại bỏ giá trị rỗng/undefined.
 */
export function validateCustomValues(
  defs: CustomFieldDef[],
  raw: unknown
): { data: CustomMetadata } | { error: string } {
  const parsed = buildCustomMetadataSchema(defs).safeParse(raw ?? {})
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dữ liệu trường động không hợp lệ.' }
  }

  const cleaned: CustomMetadata = {}
  for (const def of defs) {
    const value = (parsed.data as Record<string, unknown>)[def.fieldName]
    if (value === undefined || value === null) continue
    cleaned[def.fieldName] = value as string | number | boolean
  }
  return { data: cleaned }
}
