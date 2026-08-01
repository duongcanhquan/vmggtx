'use server'

import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  importStudentRowSchema,
  importStudentSchema,
  requiredId,
  studentCreateSchema,
  studentUpdateSchema,
  zodFail,
  type ActionResult,
} from '@/lib/validation/schemas'
import { validateCustomValues, type CustomFieldDef } from '@/lib/customFields'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { generateStudentCode } from '@/lib/utils/studentCode'

export type ImportRowInput = {
  maSV: string
  fullName: string
  email: string
  phone: string
  address: string
}

export type RowStatus = 'valid' | 'duplicate' | 'invalid'

export type ValidatedRow = {
  input: ImportRowInput
  /** Giá trị sau khi AI/luật chuẩn hóa (chỉ áp dụng cho dòng không sai định dạng) */
  normalized: { fullName: string; address: string }
  status: RowStatus
  message: string
  /** Tên đơn vị nơi hồ sơ trùng đang theo học (chỉ có khi status = duplicate) */
  duplicateOrgName?: string
}

export type ValidateResult =
  | { error: string }
  | {
      error?: undefined
      rows: ValidatedRow[]
      /** true = chuẩn hóa bằng gpt-4o-mini; false = fallback luật local (chưa có OPENAI_API_KEY) */
      usedAI: boolean
      /** true = dò trùng trên DB thật; false = dò trên dữ liệu mẫu (DB chưa sẵn sàng) */
      usedDb: boolean
    }

// ---- Fallback chuẩn hóa bằng luật local (khi AI không khả dụng) ----

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  hn: 'Hà Nội',
  'ha noi': 'Hà Nội',
  hanoi: 'Hà Nội',
  hcm: 'TP. Hồ Chí Minh',
  tphcm: 'TP. Hồ Chí Minh',
  'tp hcm': 'TP. Hồ Chí Minh',
  sg: 'TP. Hồ Chí Minh',
  'sai gon': 'TP. Hồ Chí Minh',
  dn: 'Đà Nẵng',
  'da nang': 'Đà Nẵng',
  hp: 'Hải Phòng',
  ct: 'Cần Thơ',
}

function titleCaseVi(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function normalizeLocally(row: ImportRowInput): { fullName: string; address: string } {
  const addressKey = row.address.trim().toLowerCase()
  return {
    fullName: titleCaseVi(row.fullName),
    address: ADDRESS_ABBREVIATIONS[addressKey] ?? titleCaseVi(row.address),
  }
}

// ---- Chuẩn hóa bằng AI (Check 2) ----

const normalizationSchema = z.object({
  students: z.array(
    z.object({
      fullName: z.string().describe('Họ tên đã viết hoa đúng chuẩn tiếng Việt'),
      address: z.string().describe('Địa chỉ đầy đủ, mở rộng các viết tắt (hn -> Hà Nội)'),
    })
  ),
})

async function normalizeWithAI(
  rows: ImportRowInput[]
): Promise<{ normalized: { fullName: string; address: string }[]; usedAI: boolean }> {
  if (!process.env.OPENAI_API_KEY) {
    return { normalized: rows.map(normalizeLocally), usedAI: false }
  }

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: normalizationSchema,
      abortSignal: AbortSignal.timeout(30_000),
      prompt: `Bạn là công cụ chuẩn hóa dữ liệu học sinh Việt Nam. Với MỖI học sinh trong danh sách sau,
trả về đúng thứ tự: họ tên viết hoa chuẩn tiếng Việt (VD: "nguyễn văn a" -> "Nguyễn Văn A"),
địa chỉ mở rộng viết tắt (VD: "hn" -> "Hà Nội", "hcm"/"sg" -> "TP. Hồ Chí Minh").
Không thêm/bớt phần tử, không bịa thông tin mới.

Danh sách (${rows.length} học sinh):
${JSON.stringify(rows.map((r) => ({ fullName: r.fullName, address: r.address })))}`,
    })

    // AI phải trả đủ số lượng, nếu lệch thì fallback luật local cho an toàn
    if (object.students.length !== rows.length) {
      return { normalized: rows.map(normalizeLocally), usedAI: false }
    }
    return { normalized: object.students, usedAI: true }
  } catch {
    return { normalized: rows.map(normalizeLocally), usedAI: false }
  }
}

// ---- Dò trùng lặp toàn hệ thống (Check 1) ----

type ExistingStudent = { email: string | null; phone: string | null; orgName: string }

// Dữ liệu mẫu để demo khi DB chưa sẵn sàng
const MOCK_EXISTING: ExistingStudent[] = [
  { email: 'an.nguyen@example.com', phone: '0901234567', orgName: 'Chi nhánh Cầu Giấy' },
  { email: 'binh.tran@example.com', phone: '0912345678', orgName: 'Chi nhánh Quận 1' },
]

async function findExistingStudents(
  emails: string[],
  phones: string[]
): Promise<{ existing: ExistingStudent[]; usedDb: boolean }> {
  try {
    const supabase = createClient()
    const orFilter = [
      emails.length ? `email.in.(${emails.join(',')})` : null,
      phones.length ? `phone.in.(${phones.join(',')})` : null,
    ]
      .filter(Boolean)
      .join(',')

    if (!orFilter) return { existing: [], usedDb: true }

    const { data, error } = await supabase
      .from('profiles')
      .select('email, phone, organizations(name)')
      .or(orFilter)
      .is('deleted_at', null)

    if (error) {
      return { existing: MOCK_EXISTING, usedDb: false }
    }
    return {
      existing: (data ?? []).map((row) => {
        const org = row.organizations as { name: string } | { name: string }[] | null
        const orgName = Array.isArray(org) ? org[0]?.name : org?.name
        return {
          email: row.email,
          phone: row.phone,
          orgName: orgName ?? 'đơn vị khác trong hệ thống',
        }
      }),
      usedDb: true,
    }
  } catch {
    return { existing: MOCK_EXISTING, usedDb: false }
  }
}

// ---- Validation định dạng (QA GATE: dùng Zod, SĐT chuẩn VN 10 số) ----

/** Chuẩn hóa SĐT về dạng 10 số bắt đầu bằng 0 (chấp nhận input +84) */
function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s.-]/g, '').replace(/^\+84/, '0')
}

function getFormatErrors(row: ImportRowInput): string[] {
  const parsed = importStudentSchema.safeParse({
    fullName: row.fullName,
    email: row.email,
    phone: normalizePhone(row.phone),
    address: row.address,
  })
  if (parsed.success) return []
  return parsed.error.issues.map((issue) => issue.message)
}

/**
 * AI DATA GATEKEEPER - KHÔNG insert ngay, chỉ kiểm tra & chuẩn hóa:
 * - Check định dạng (email/phone/họ tên)          -> dòng đỏ
 * - Check 1 (DB): trùng email/SĐT TOÀN HỆ THỐNG    -> dòng vàng "Nghi ngờ trùng lặp"
 * - Check 2 (AI): chuẩn hóa tên + địa chỉ (gpt-4o-mini + generateObject/Zod)
 */
export async function validateImportData(
  studentsData: ImportRowInput[]
): Promise<ValidateResult> {
  // [SECURITY AUDIT] Gọi AI trả phí + dò trùng DB: bắt buộc đăng nhập
  {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }
  }

  const rows = studentsData.slice(0, 50) // chặn payload quá lớn

  // Phân loại định dạng trước
  const formatErrors = rows.map(getFormatErrors)

  // Check 1: dò trùng toàn hệ thống (chỉ với các dòng đúng định dạng)
  const checkableRows = rows.filter((_, i) => formatErrors[i].length === 0)
  const { existing, usedDb } = await findExistingStudents(
    checkableRows.map((r) => r.email.trim().toLowerCase()),
    checkableRows.map((r) => normalizePhone(r.phone))
  )
  const existingByEmail = new Map(
    existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e])
  )
  const existingByPhone = new Map(existing.filter((e) => e.phone).map((e) => [e.phone!, e]))

  // Check 2: AI chuẩn hóa (các dòng đúng định dạng)
  const { normalized: normalizedList, usedAI } = await normalizeWithAI(checkableRows)
  const normalizedByIndex = new Map<number, { fullName: string; address: string }>()
  let cursor = 0
  rows.forEach((_, i) => {
    if (formatErrors[i].length === 0) {
      normalizedByIndex.set(i, normalizedList[cursor])
      cursor += 1
    }
  })

  const result: ValidatedRow[] = rows.map((row, i) => {
    if (formatErrors[i].length > 0) {
      return {
        input: row,
        normalized: { fullName: row.fullName, address: row.address },
        status: 'invalid' as const,
        message: `Sai định dạng: ${formatErrors[i].join(', ')}.`,
      }
    }

    const normalized = normalizedByIndex.get(i) ?? normalizeLocally(row)
    const email = row.email.trim().toLowerCase()
    const phone = normalizePhone(row.phone)
    const match = existingByEmail.get(email) ?? existingByPhone.get(phone)

    if (match) {
      return {
        input: row,
        normalized,
        status: 'duplicate' as const,
        message: `Nghi ngờ trùng lặp: học sinh này đang học ở ${match.orgName} (trùng ${
          existingByEmail.has(email) ? 'email' : 'số điện thoại'
        }).`,
        duplicateOrgName: match.orgName,
      }
    }

    return {
      input: row,
      normalized,
      status: 'valid' as const,
      message: 'Hợp lệ, sẵn sàng import.',
    }
  })

  return { rows: result, usedAI, usedDb }
}

// ============================================================
// Danh sách Học sinh cho trang /students (SmartTable)
// ============================================================

export type StudentRow = {
  id: string
  /** Mã học viên hiển thị (sinh từ UUID) */
  code: string
  full_name: string
  email: string | null
  phone: string | null
  org_name: string
  /** 'active' = Đang học, 'paused' = Bảo lưu */
  status: 'active' | 'paused'
  /** Giá trị các trường động của cơ sở (migration 019) */
  custom_metadata: Record<string, unknown>
}

const MOCK_STUDENT_ROWS: StudentRow[] = ([
  { id: 'st-01', code: 'HV-3F8A21', full_name: 'Nguyễn Văn Toàn', email: 'toan.nguyen@student.gdtx.edu.vn', org_name: 'Chi nhánh Cầu Giấy', status: 'active' },
  { id: 'st-02', code: 'HV-7B2C90', full_name: 'Đỗ Thu Hà', email: 'ha.do@student.gdtx.edu.vn', org_name: 'Chi nhánh Đống Đa', status: 'active' },
  { id: 'st-03', code: 'HV-1D4E55', full_name: 'Vũ Đức Mạnh', email: 'manh.vu@student.gdtx.edu.vn', org_name: 'Chi nhánh Cầu Giấy', status: 'paused' },
  { id: 'st-04', code: 'HV-9A0B37', full_name: 'Hoàng Ngọc Lan', email: 'lan.hoang@student.gdtx.edu.vn', org_name: 'Cơ sở Hà Nội 1', status: 'active' },
  { id: 'st-05', code: 'HV-5C6D12', full_name: 'Trần Bảo Long', email: 'long.tran@student.gdtx.edu.vn', org_name: 'Chi nhánh Đống Đa', status: 'active' },
  { id: 'st-06', code: 'HV-2E8F44', full_name: 'Phạm Thị Mai', email: 'mai.pham@student.gdtx.edu.vn', org_name: 'Cơ sở Hà Nội 1', status: 'active' },
  { id: 'st-07', code: 'HV-6A1B78', full_name: 'Lê Hoàng Nam', email: 'nam.le@student.gdtx.edu.vn', org_name: 'Chi nhánh Cầu Giấy', status: 'paused' },
  { id: 'st-08', code: 'HV-4D9C03', full_name: 'Bùi Minh Châu', email: 'chau.bui@student.gdtx.edu.vn', org_name: 'Chi nhánh Đống Đa', status: 'active' },
  { id: 'st-09', code: 'HV-8B3A66', full_name: 'Đặng Quốc Việt', email: 'viet.dang@student.gdtx.edu.vn', org_name: 'Cơ sở Hà Nội 1', status: 'active' },
  { id: 'st-10', code: 'HV-0C7D29', full_name: 'Ngô Thanh Trúc', email: 'truc.ngo@student.gdtx.edu.vn', org_name: 'Chi nhánh Cầu Giấy', status: 'active' },
  { id: 'st-11', code: 'HV-3A5E81', full_name: 'Dương Gia Bảo', email: 'bao.duong@student.gdtx.edu.vn', org_name: 'Chi nhánh Đống Đa', status: 'active' },
  { id: 'st-12', code: 'HV-7F2B54', full_name: 'Cao Khánh Linh', email: 'linh.cao@student.gdtx.edu.vn', org_name: 'Cơ sở Hà Nội 1', status: 'paused' },
] as Omit<StudentRow, 'phone' | 'custom_metadata'>[]).map((row) => ({
  ...row,
  phone: null,
  custom_metadata: {},
}))

/**
 * Học sinh (role = 'student') thuộc org đang chọn + mọi chi nhánh con/cháu.
 * Fallback dữ liệu demo khi chưa đăng nhập / DB trống.
 */
export async function getStudents(
  orgId: string | null
): Promise<{ data: StudentRow[]; demo: boolean }> {
  if (!orgId) {
    return { data: MOCK_STUDENT_ROWS, demo: true }
  }

  try {
    const supabase = createClient()

    const orgIds = await getDescendantOrgIds(supabase, orgId)

    const scope = orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds]
    let { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, custom_metadata, student_code, organizations(name)')
      .eq('role', 'student')
      .in('org_id', scope)
      .is('deleted_at', null)
      .order('full_name')

    // DB chưa chạy migration 028 (thiếu cột student_code) -> truy vấn lại không có cột
    if (error && /student_code/i.test(error.message)) {
      const retry = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, custom_metadata, organizations(name)')
        .eq('role', 'student')
        .in('org_id', scope)
        .is('deleted_at', null)
        .order('full_name')
      data = retry.data as typeof data
      error = retry.error
    }

    if (error || !data || data.length === 0) {
      return { data: MOCK_STUDENT_ROWS, demo: true }
    }

    const rows: StudentRow[] = data.map((row) => {
      const org = row.organizations as { name: string } | { name: string }[] | null
      return {
        id: row.id,
        code:
          ((row as { student_code?: string | null }).student_code ?? null) ||
          `HV-${row.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        full_name: row.full_name,
        email: row.email,
        phone: (row.phone as string | null) ?? null,
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        // Chưa có cột trạng thái riêng: hồ sơ chưa xóa mềm = đang học
        status: 'active' as const,
        custom_metadata: (row.custom_metadata as Record<string, unknown>) ?? {},
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: MOCK_STUDENT_ROWS, demo: true }
  }
}

// ============================================================
// Thêm / Sửa Học sinh - có TRƯỜNG DỮ LIỆU ĐỘNG (migration 019)
// Giá trị động được validate 2 TẦNG theo định nghĩa org_custom_fields
// (client: StudentForm, server: validateCustomValues) rồi lưu vào
// cột profiles.custom_metadata.
// ============================================================

/** Định nghĩa trường động của HỌC SINH cho 1 org (server-side) */
async function fetchStudentFieldDefs(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<CustomFieldDef[]> {
  const { data } = await supabase
    .from('org_custom_fields')
    .select('id, entity_type, field_name, field_label, field_type, options, is_required')
    .eq('org_id', orgId)
    .eq('entity_type', 'student')
    .is('deleted_at', null)
    .order('created_at')

  return (data ?? []).map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    fieldName: row.field_name,
    fieldLabel: row.field_label,
    fieldType: row.field_type,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    isRequired: row.is_required,
  }))
}

/**
 * Tạo học sinh mới (auth user + profile) kèm custom_metadata.
 * BẢO MẬT: is_authorized(academic_staff+) trên org đích; org_id lấy
 * từ tham số nhưng luôn qua cửa kiểm tra subtree; Admin client chỉ
 * chạy SAU khi qua cửa.
 */
export async function createStudent(
  orgId: string,
  rawValues: unknown
): Promise<ActionResult> {
  const orgParsed = requiredId('Thiếu org_id: vui lòng chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  const parsed = studentCreateSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgParsed.data,
      p_required_role: 'academic_staff',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền thêm học sinh cho cơ sở này.' }
    }

    // Validate trường động THEO ĐỊNH NGHĨA của org (tầng server)
    const defs = await fetchStudentFieldDefs(supabase, orgParsed.data)
    const customResult = validateCustomValues(defs, values.custom)
    if ('error' in customResult) return { error: customResult.error }

    // Tạo auth user bằng Admin client (bỏ qua email xác nhận)
    const admin = createAdminClient()
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: values.email,
      password: values.password,
      email_confirm: true,
    })
    if (createError || !created.user) {
      return { error: `Không thể tạo tài khoản: ${createError?.message ?? 'lỗi không rõ'}` }
    }

    // Mã học viên theo quy tắc của cơ sở (null nếu chưa chạy migration 028)
    const studentCode = await generateStudentCode(admin, orgParsed.data)

    const baseProfile: Record<string, unknown> = {
      id: created.user.id,
      full_name: values.fullName,
      email: values.email,
      phone: values.phone || null,
      role: 'student',
      org_id: orgParsed.data,
      custom_metadata: customResult.data,
    }
    const profileWithCode = studentCode
      ? { ...baseProfile, student_code: studentCode }
      : baseProfile
    let { error: profileError } = await admin.from('profiles').insert(profileWithCode)
    // Cột student_code chưa có (thiếu 028) -> tạo lại KHÔNG kèm mã
    if (profileError && /student_code/i.test(profileError.message)) {
      const retry = await admin.from('profiles').insert(baseProfile)
      profileError = retry.error
    }
    if (profileError) {
      // Rollback: không để auth user mồ côi
      await admin.auth.admin.deleteUser(created.user.id)
      return { error: `Không thể tạo hồ sơ: ${profileError.message}` }
    }

    revalidatePath('/students')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tạo học sinh.',
    }
  }
}

// ============================================================
// MASS IMPORT - Nhập học sinh hàng loạt từ Excel/CSV.
//
// Client đã parse file + validate Zod từng dòng (chỉ gửi lên dữ
// liệu sạch), server VẪN validate lại toàn bộ trước khi chạm DB.
//
// [BẢO MẬT] org_id KHÔNG BAO GIỜ lấy từ file Excel: mọi dòng đều
// bị ép org_id = orgId đã qua cửa is_authorized. Nhân viên sửa
// file để import sang cơ sở khác sẽ vô tác dụng.
// ============================================================

const MAX_IMPORT_ROWS = 200

// Đào tạo kép (035): mỗi dòng BẮT BUỘC có MaSV - khóa upsert cốt lõi
const bulkImportSchema = z
  .array(importStudentRowSchema)
  .min(1, 'File không có dòng dữ liệu nào.')
  .max(MAX_IMPORT_ROWS, `Mỗi lần import tối đa ${MAX_IMPORT_ROWS} dòng.`)

export type BulkImportRowOutcome = {
  rowIndex: number
  fullName: string
  outcome: 'inserted' | 'updated' | 'failed'
  message?: string
}

export type BulkImportResult =
  | { error: string }
  | {
      error?: undefined
      successCount: number
      failedCount: number
      rows: BulkImportRowOutcome[]
    }

export async function bulkImportStudents(
  rawRows: unknown,
  orgId: string
): Promise<BulkImportResult> {
  const orgParsed = requiredId('Thiếu org_id: vui lòng chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  const parsed = bulkImportSchema.safeParse(rawRows)
  if (!parsed.success) return zodFail(parsed.error)
  const rows = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgParsed.data,
      p_required_role: 'academic_staff',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền import học sinh cho cơ sở này.' }
    }

    const admin = createAdminClient()

    // Subtree được phép thao tác: chỉ UPDATE học sinh trong phạm vi này
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: orgParsed.data,
    })
    const scopeOrgIds = new Set<string>((subtree as string[] | null) ?? [orgParsed.data])
    scopeOrgIds.add(orgParsed.data)

    // MaSV trùng lặp NGAY trong file -> chặn toàn bộ (khóa upsert phải duy nhất)
    const codes = rows.map((row) => row.maSV.trim())
    const duplicateCodes = [...new Set(codes.filter((code, i) => codes.indexOf(code) !== i))]
    if (duplicateCodes.length > 0) {
      return {
        error: `MaSV bị trùng lặp trong file: ${duplicateCodes.slice(0, 5).join(', ')}${
          duplicateCodes.length > 5 ? '…' : ''
        }`,
      }
    }

    // ===== Tra trước hồ sơ theo MaSV (KHÓA UPSERT CHÍNH - migration 035) =====
    // DB chưa chạy 035 (thiếu cột) -> masvSupported=false, fallback SĐT như cũ.
    type ExistingProfile = {
      id: string
      phone: string | null
      org_id: string | null
      role: string
      MaSV?: string | null
    }
    let masvSupported = true
    const existingByMasv = new Map<string, ExistingProfile>()
    {
      const { data, error } = await admin
        .from('profiles')
        .select('id, phone, org_id, role, MaSV')
        .in('MaSV', codes)
        .is('deleted_at', null)
      if (error) {
        if (/MaSV|does not exist/i.test(error.message)) {
          masvSupported = false
        } else {
          return { error: `Lỗi tra cứu MaSV: ${error.message}` }
        }
      } else {
        for (const profile of (data ?? []) as ExistingProfile[]) {
          if (profile.MaSV) existingByMasv.set(profile.MaSV, profile)
        }
      }
    }

    // Tra hồ sơ trùng SĐT (fallback khi MaSV chưa tồn tại trong hệ thống)
    const phones = rows.map((row) => normalizePhone(row.phone))
    const { data: existingProfiles } = await admin
      .from('profiles')
      .select(masvSupported ? 'id, phone, org_id, role, MaSV' : 'id, phone, org_id, role')
      .in('phone', phones)
      .is('deleted_at', null)
    const existingByPhone = new Map(
      ((existingProfiles ?? []) as unknown as ExistingProfile[]).map((profile) => [
        profile.phone as string,
        profile,
      ])
    )

    const outcomes: BulkImportRowOutcome[] = []

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const code = row.maSV.trim()
      const phone = normalizePhone(row.phone)
      const byMasv = masvSupported ? existingByMasv.get(code) : undefined
      const byPhone = existingByPhone.get(phone)
      const existing = byMasv ?? byPhone

      try {
        if (existing) {
          // ===== UPDATE: trùng MaSV (ưu tiên) hoặc trùng SĐT =====
          if (existing.role !== 'student') {
            outcomes.push({
              rowIndex: index,
              fullName: row.fullName,
              outcome: 'failed',
              message: `${byMasv ? 'MaSV' : 'SĐT'} này đang thuộc một tài khoản KHÔNG phải học sinh.`,
            })
            continue
          }
          if (!existing.org_id || !scopeOrgIds.has(existing.org_id)) {
            outcomes.push({
              rowIndex: index,
              fullName: row.fullName,
              outcome: 'failed',
              message: `Học sinh trùng ${byMasv ? 'MaSV' : 'SĐT'} đang thuộc cơ sở NGOÀI phạm vi của bạn — không được ghi đè.`,
            })
            continue
          }
          // Khớp theo SĐT nhưng hồ sơ đó đã mang MaSV KHÁC -> xung đột định danh
          if (!byMasv && masvSupported && byPhone?.MaSV && byPhone.MaSV !== code) {
            outcomes.push({
              rowIndex: index,
              fullName: row.fullName,
              outcome: 'failed',
              message: `SĐT này thuộc học sinh mang MaSV "${byPhone.MaSV}" (khác "${code}") — kiểm tra lại file.`,
            })
            continue
          }

          const updatePayload: Record<string, unknown> = {
            full_name: row.fullName,
            address: row.address || null,
            phone,
          }
          // Map MaSV vào profiles khi upsert (gán mã cho hồ sơ khớp SĐT chưa có mã)
          if (masvSupported) updatePayload.MaSV = code

          const { error: updateError } = await admin
            .from('profiles')
            .update(updatePayload)
            .eq('id', existing.id)
          if (updateError) throw new Error(updateError.message)

          outcomes.push({
            rowIndex: index,
            fullName: row.fullName,
            outcome: 'updated',
            message: byMasv
              ? 'Trùng MaSV — đã cập nhật hồ sơ hiện có.'
              : 'Trùng SĐT — đã cập nhật hồ sơ và gán MaSV.',
          })
        } else {
          // ===== INSERT: học sinh mới (auth user + profile) =====
          const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: row.email,
            // Mật khẩu ngẫu nhiên - học sinh dùng luồng quên mật khẩu/OTP để vào
            password: `Hs!${crypto.randomUUID()}`,
            email_confirm: true,
          })
          if (createError || !created.user) {
            throw new Error(createError?.message ?? 'Không tạo được tài khoản auth.')
          }

          const importProfile: Record<string, unknown> = {
            id: created.user.id,
            full_name: row.fullName,
            email: row.email,
            phone,
            address: row.address || null,
            role: 'student',
            // [BẢO MẬT] Ép cứng org đích - không nhận từ file
            org_id: orgParsed.data,
          }
          if (masvSupported) importProfile.MaSV = code
          const importCode = await generateStudentCode(admin, orgParsed.data)
          const importProfileWithCode = importCode
            ? { ...importProfile, student_code: importCode }
            : importProfile
          let { error: profileError } = await admin
            .from('profiles')
            .insert(importProfileWithCode)
          if (profileError && /student_code/i.test(profileError.message)) {
            const retry = await admin.from('profiles').insert(importProfile)
            profileError = retry.error
          }
          if (profileError) {
            await admin.auth.admin.deleteUser(created.user.id)
            if (/uq_profiles_masv|MaSV/i.test(profileError.message)) {
              throw new Error(`MaSV "${code}" đã tồn tại trong hệ thống — không thể tạo trùng.`)
            }
            throw new Error(profileError.message)
          }

          outcomes.push({ rowIndex: index, fullName: row.fullName, outcome: 'inserted' })
        }
      } catch (rowError) {
        outcomes.push({
          rowIndex: index,
          fullName: row.fullName,
          outcome: 'failed',
          message: rowError instanceof Error ? rowError.message : 'Lỗi không xác định.',
        })
      }
    }

    revalidatePath('/students')
    const failedCount = outcomes.filter((o) => o.outcome === 'failed').length
    return {
      successCount: outcomes.length - failedCount,
      failedCount,
      rows: outcomes,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi import học sinh.',
    }
  }
}

/** Cập nhật hồ sơ học sinh (họ tên, SĐT + custom_metadata). */
export async function updateStudent(
  studentId: string,
  rawValues: unknown
): Promise<ActionResult> {
  const idParsed = requiredId('Thiếu ID học sinh.').safeParse(studentId)
  if (!idParsed.success) return zodFail(idParsed.error)

  const parsed = studentUpdateSchema.safeParse(rawValues)
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const { data: student } = await supabase
      .from('profiles')
      .select('id, org_id, role')
      .eq('id', idParsed.data)
      .eq('role', 'student')
      .is('deleted_at', null)
      .maybeSingle()
    if (!student?.org_id) {
      return { error: 'Học sinh không tồn tại hoặc ngoài phạm vi của bạn.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: student.org_id,
      p_required_role: 'academic_staff',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền sửa hồ sơ học sinh của cơ sở này.' }
    }

    const defs = await fetchStudentFieldDefs(supabase, student.org_id)
    const customResult = validateCustomValues(defs, values.custom)
    if ('error' in customResult) return { error: customResult.error }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: values.fullName,
        phone: values.phone || null,
        custom_metadata: customResult.data,
      })
      .eq('id', idParsed.data)
    if (error) return { error: `Không thể cập nhật hồ sơ: ${error.message}` }

    revalidatePath('/students')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi sửa hồ sơ.',
    }
  }
}

/**
 * XÓA MỀM hồ sơ học sinh (set deleted_at) - yêu cầu quyền tối thiểu
 * CAMPUS_ADMIN trên org của học sinh (xóa hồ sơ là thao tác nhạy cảm,
 * cao hơn mức academic_staff của sửa hồ sơ). RLS campusadmin_update_subtree
 * (migration 005) cho phép UPDATE trong subtree nên dùng session client.
 */
export async function deleteStudent(studentId: string): Promise<ActionResult> {
  const idParsed = requiredId('Thiếu ID học sinh.').safeParse(studentId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const { data: student } = await supabase
      .from('profiles')
      .select('id, org_id, full_name')
      .eq('id', idParsed.data)
      .eq('role', 'student')
      .is('deleted_at', null)
      .maybeSingle()
    if (!student?.org_id) {
      return { error: 'Học sinh không tồn tại hoặc ngoài phạm vi của bạn.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: student.org_id,
      p_required_role: 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return {
        error:
          'TỪ CHỐI: Xóa hồ sơ học sinh yêu cầu quyền Quản lý cơ sở (campus_admin) trên chi nhánh của học sinh.',
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', idParsed.data)
    if (error) return { error: `Không thể xóa hồ sơ: ${error.message}` }

    revalidatePath('/students')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi xóa hồ sơ.',
    }
  }
}
