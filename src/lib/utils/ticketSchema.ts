// ============================================================
// Schema form ĐỘNG cho Cổng dịch vụ E-Ticketing (migration 032).
// form_schema (jsonb) của ticket_categories = mảng TicketFormField,
// UI form được sinh tự động từ đây — thêm mẫu đơn mới không cần code.
// Client-safe: không import server-only module.
// ============================================================

export type TicketFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select'

export type TicketFormField = {
  key: string
  label: string
  type: TicketFieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

const VALID_TYPES: TicketFieldType[] = ['text', 'textarea', 'number', 'date', 'select']

/** Parse form_schema từ jsonb — bỏ qua field hỏng thay vì crash */
export function parseFormSchema(raw: unknown): TicketFormField[] {
  if (!Array.isArray(raw)) return []
  const fields: TicketFormField[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const field = item as Record<string, unknown>
    if (typeof field.key !== 'string' || !field.key.trim()) continue
    if (typeof field.label !== 'string' || !field.label.trim()) continue
    const type = VALID_TYPES.includes(field.type as TicketFieldType)
      ? (field.type as TicketFieldType)
      : 'text'
    fields.push({
      key: field.key.trim(),
      label: field.label.trim(),
      type,
      required: field.required === true,
      options: Array.isArray(field.options)
        ? field.options.filter((o): o is string => typeof o === 'string')
        : undefined,
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
    })
  }
  return fields
}

/**
 * Validate payload người dùng điền theo schema.
 * Trả về message lỗi đầu tiên, hoặc null nếu hợp lệ.
 */
export function validateTicketPayload(
  fields: TicketFormField[],
  payload: Record<string, string>
): string | null {
  for (const field of fields) {
    const value = (payload[field.key] ?? '').trim()
    if (field.required && !value) {
      return `Vui lòng điền "${field.label}".`
    }
    if (!value) continue
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      return `"${field.label}" phải là số.`
    }
    if (field.type === 'date' && Number.isNaN(new Date(value).getTime())) {
      return `"${field.label}" không phải ngày hợp lệ.`
    }
    if (field.type === 'select' && field.options?.length && !field.options.includes(value)) {
      return `"${field.label}" không nằm trong các lựa chọn cho phép.`
    }
    if (value.length > 2000) {
      return `"${field.label}" quá dài (tối đa 2000 ký tự).`
    }
  }
  return null
}

/** Lọc payload: chỉ giữ các key có trong schema (chống nhét dữ liệu lạ) */
export function sanitizeTicketPayload(
  fields: TicketFormField[],
  payload: Record<string, string>
): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const field of fields) {
    const value = (payload[field.key] ?? '').trim()
    if (value) clean[field.key] = value.slice(0, 2000)
  }
  return clean
}

export const TICKET_STATUS_META: Record<
  'pending' | 'in_progress' | 'approved' | 'rejected' | 'resolved',
  { label: string; className: string }
> = {
  pending: { label: 'Chờ xử lý', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'Đang xử lý', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  approved: { label: 'Đã duyệt', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Từ chối', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  resolved: { label: 'Hoàn tất', className: 'bg-slate-100 text-slate-600 border-slate-200' },
}
