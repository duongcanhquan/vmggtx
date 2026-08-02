import { z } from 'zod'
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES } from '@/lib/customFields'

// ============================================================
// Bộ schema Zod dùng chung cho TOÀN BỘ form trong hệ thống.
// Quy tắc QA:
//   1. MỌI input từ form phải parse qua Zod TRƯỚC KHI chạm Supabase.
//   2. Server Action trả về object lỗi CHUẨN HÓA:
//        thất bại : { error: "Chi tiết lỗi" }
//        thành công: { error: undefined, ...data }
//      (dùng helper `fail` / `zodFail` bên dưới).
//   3. Frontend dùng CHÍNH các schema này với react-hook-form
//      + zodResolver để hiện lỗi đỏ dưới từng ô input.
// ============================================================

/** Kết quả chuẩn của Server Action */
export type ActionResult = { error: string } | { error?: undefined }

/** Tạo object lỗi chuẩn hóa */
export function fail(message: string): { error: string } {
  return { error: message }
}

/** Chuyển lỗi Zod đầu tiên thành object lỗi chuẩn hóa */
export function zodFail(error: z.ZodError): { error: string } {
  const first = error.issues[0]
  return { error: first?.message ?? 'Dữ liệu không hợp lệ.' }
}

// ---------- Khối nguyên tử ----------

/**
 * Ký tự đặc biệt nguy hiểm bị CẤM trong text tự do (tên lớp, họ tên…):
 * phòng chống XSS/Injection ở tầng ứng dụng (dù Supabase đã parameterize).
 */
const DANGEROUS_CHARS = /[<>{}[\]\\`;$]/

export function safeText(label: string, min = 2, max = 120) {
  return z
    .string({ required_error: `${label} không được để trống.` })
    .trim()
    .min(min, `${label} phải có ít nhất ${min} ký tự.`)
    .max(max, `${label} tối đa ${max} ký tự.`)
    .refine(
      (value) => !DANGEROUS_CHARS.test(value),
      `${label} chứa ký tự đặc biệt không được phép (< > { } [ ] ; \` $).`
    )
}

/** Số điện thoại Việt Nam: đúng 10 số, bắt đầu bằng 0 */
export const phoneVNSchema = z
  .string()
  .trim()
  .regex(/^0\d{9}$/, 'Số điện thoại phải đúng định dạng VN (10 số, bắt đầu bằng 0).')

export const emailSchema = z
  .string({ required_error: 'Email không được để trống.' })
  .trim()
  .toLowerCase()
  .email('Email không hợp lệ.')

export const passwordSchema = z
  .string({ required_error: 'Mật khẩu không được để trống.' })
  .min(8, 'Mật khẩu khởi tạo phải có ít nhất 8 ký tự.')
  .max(72, 'Mật khẩu tối đa 72 ký tự.')

/** Chuỗi ngày YYYY-MM-DD, cho phép rỗng */
export const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Ngày không đúng định dạng YYYY-MM-DD.')
  .optional()
  .default('')

/** ID bắt buộc (uuid hoặc mock id trong chế độ demo) */
export function requiredId(message: string) {
  return z.string({ required_error: message }).trim().min(1, message)
}

// ---------- Schema theo từng form ----------

/** Sĩ số tối đa của lớp: rỗng = không giới hạn, có giá trị = 1..500 */
export const maxStudentsSchema = z
  .string()
  .trim()
  .regex(/^\d*$/, 'Sĩ số tối đa phải là số nguyên dương.')
  .refine(
    (value) => value === '' || (parseInt(value, 10) >= 1 && parseInt(value, 10) <= 500),
    'Sĩ số tối đa từ 1 đến 500 (để trống = không giới hạn).'
  )
  .optional()
  .default('')

/** Form Tạo lớp (Admin /classes/new): phần user nhập */
export const classFormSchema = z
  .object({
    name: safeText('Tên lớp'),
    subjectId: requiredId('Vui lòng chọn môn học.'),
    teacherId: z.string().trim().optional().default(''),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    maxStudents: maxStudentsSchema,
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.', path: ['endDate'] }
  )

/** Form Tạo lớp phía server: thêm orgId nhúng từ Zustand */
export const createClassSchema = z
  .object({
    orgId: requiredId('Thiếu org_id: vui lòng chọn cấp quản lý ở góc trên bên phải.'),
    name: safeText('Tên lớp'),
    subjectId: requiredId('Vui lòng chọn môn học.'),
    teacherId: z.string().trim().optional().default(''),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    maxStudents: maxStudentsSchema,
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.', path: ['endDate'] }
  )

/** Form lớp của Giáo vụ (không subject bắt buộc, org lấy từ profile server-side) */
export const staffClassSchema = z
  .object({
    name: safeText('Tên lớp'),
    teacherId: z.string().trim().optional().default(''),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    maxStudents: maxStudentsSchema,
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.', path: ['endDate'] }
  )

/** Form xếp thời khóa biểu (Giáo vụ) */
export const scheduleSessionSchema = z
  .object({
    classId: requiredId('Thiếu ID lớp học.'),
    teacherId: z.string().trim().optional().default(''),
    room: z
      .string()
      .trim()
      .max(50, 'Tên phòng tối đa 50 ký tự.')
      .refine((v) => !DANGEROUS_CHARS.test(v), 'Tên phòng chứa ký tự không được phép.')
      .optional()
      .default(''),
    date: z
      .string({ required_error: 'Vui lòng chọn ngày học.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày học không đúng định dạng.'),
    startTime: z
      .string({ required_error: 'Vui lòng nhập giờ bắt đầu.' })
      .regex(/^\d{2}:\d{2}$/, 'Giờ bắt đầu không đúng định dạng HH:mm.'),
    endTime: z
      .string({ required_error: 'Vui lòng nhập giờ kết thúc.' })
      .regex(/^\d{2}:\d{2}$/, 'Giờ kết thúc không đúng định dạng HH:mm.'),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu.',
    path: ['endTime'],
  })

/** Form Thêm nhân sự (Campus Admin) - KHÔNG BAO GIỜ có super_admin / student */
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: safeText('Họ tên'),
  role: z.enum(
    ['campus_admin', 'academic_staff', 'admission_staff', 'accountant', 'teacher'],
    {
      errorMap: () => ({
        message: 'Role không hợp lệ. Học viên tạo tại menu Học sinh.',
      }),
    }
  ),
  orgId: requiredId('Vui lòng chọn chi nhánh cho nhân sự mới.'),
  phone: z.union([z.literal(''), phoneVNSchema]).default(''),
})

// ====== Quản lý tài sản (/assets - migration 041) ======

export const ASSET_CATEGORIES = [
  'furniture',
  'it_equipment',
  'teaching_device',
  'vehicle',
  'building',
  'software',
  'other',
] as const

export const ASSET_STATUSES = [
  'in_use',
  'in_storage',
  'under_repair',
  'broken',
  'liquidated',
  'lost',
] as const

/** Form Thêm/Sửa tài sản */
export const assetSchema = z
  .object({
    orgId: requiredId('Vui lòng chọn đơn vị sở hữu tài sản.'),
    /** Mã tài sản - để trống sẽ tự sinh TS-YYYY-xxxx */
    code: z.string().trim().max(30, 'Mã tài sản tối đa 30 ký tự.').optional().default(''),
    name: safeText('Tên tài sản'),
    category: z.enum(ASSET_CATEGORIES, {
      errorMap: () => ({ message: 'Nhóm tài sản không hợp lệ.' }),
    }),
    serialNumber: z.string().trim().max(100, 'Số serial tối đa 100 ký tự.').optional().default(''),
    vendor: z.string().trim().max(150, 'Nhà cung cấp tối đa 150 ký tự.').optional().default(''),
    location: z.string().trim().max(150, 'Vị trí tối đa 150 ký tự.').optional().default(''),
    purchaseDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày mua phải theo định dạng YYYY-MM-DD.'),
    purchasePrice: z.coerce
      .number({ invalid_type_error: 'Nguyên giá phải là số.' })
      .min(0, 'Nguyên giá không được âm.')
      .max(100_000_000_000, 'Nguyên giá vượt giới hạn.'),
    salvageValue: z.coerce
      .number({ invalid_type_error: 'Giá trị thu hồi phải là số.' })
      .min(0, 'Giá trị thu hồi không được âm.')
      .default(0),
    usefulLifeMonths: z.coerce
      .number({ invalid_type_error: 'Thời gian khấu hao phải là số tháng.' })
      .int('Thời gian khấu hao phải là số nguyên (tháng).')
      .min(1, 'Tối thiểu 1 tháng.')
      .max(600, 'Tối đa 600 tháng (50 năm).'),
    warrantyUntil: optionalDateSchema,
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional().default(''),
  })
  .refine((data) => data.salvageValue <= data.purchasePrice, {
    message: 'Giá trị thu hồi không được lớn hơn nguyên giá.',
    path: ['salvageValue'],
  })

/** Form Sửa nhân sự (Campus Admin) - đổi tên/role/chi nhánh, KHÔNG có super_admin / student */
export const updateUserSchema = z.object({
  userId: requiredId('Thiếu ID người dùng.'),
  fullName: safeText('Họ tên'),
  role: z.enum(
    ['campus_admin', 'academic_staff', 'admission_staff', 'accountant', 'teacher'],
    {
      errorMap: () => ({
        message: 'Role không hợp lệ. Học viên quản lý tại menu Học sinh.',
      }),
    }
  ),
  orgId: requiredId('Vui lòng chọn chi nhánh.'),
  phone: z.union([z.literal(''), phoneVNSchema]).default(''),
  /** Chức danh (056) — chuỗi rỗng = gỡ gắn */
  jobTitleId: z.union([z.literal(''), requiredId('ID chức danh không hợp lệ.')]).default(''),
})

/** Form Cấp lại mật khẩu (Campus Admin) */
export const resetPasswordSchema = z.object({
  userId: requiredId('Thiếu ID người dùng.'),
  password: passwordSchema,
})

/** Form Thu tiền (Sheet trong /finance/invoices) */
export const paymentSchema = z.object({
  invoiceId: requiredId('Thiếu ID hóa đơn.'),
  amount: z.coerce
    .number({ invalid_type_error: 'Số tiền thu phải là số.' })
    .finite('Số tiền thu không hợp lệ.')
    .positive('Số tiền thu phải lớn hơn 0.'),
  paymentMethod: z.enum(['cash', 'transfer'], {
    errorMap: () => ({ message: 'Phương thức thanh toán không hợp lệ.' }),
  }),
})

/** Ô nhập điểm (Sổ điểm): điểm PHẢI trong khoảng 0-10 */
export const gradeScoreSchema = z.coerce
  .number({ invalid_type_error: 'Điểm phải là số.' })
  .min(0, 'Điểm không được nhỏ hơn 0.')
  .max(10, 'Điểm không được lớn hơn 10.')

/** Form Hợp đồng giáo viên (Module Lương & Hợp đồng - /hr/contracts) */
export const contractSchema = z
  .object({
    teacherId: requiredId('Vui lòng chọn giáo viên.'),
    // hourly = khoán giờ; probation giữ lại cho dữ liệu cũ
    contractType: z.enum(['full_time', 'visiting', 'hourly', 'probation'], {
      errorMap: () => ({ message: 'Loại hợp đồng không hợp lệ.' }),
    }),
    baseSalary: z
      .number({ invalid_type_error: 'Lương cơ bản phải là số.' })
      .min(0, 'Lương cơ bản không được âm.')
      .max(1_000_000_000, 'Lương cơ bản quá lớn.'),
    insuranceSalary: z
      .number({ invalid_type_error: 'Lương đóng BHXH phải là số.' })
      .min(0, 'Lương đóng BHXH không được âm.')
      .max(1_000_000_000, 'Lương đóng BHXH quá lớn.'),
    baseHourlyRate: z
      .number({ invalid_type_error: 'Đơn giá tiết phải là số.' })
      .min(0, 'Đơn giá tiết không được âm.')
      .max(100_000_000, 'Đơn giá tiết quá lớn.'),
    requiredHoursPerMonth: z
      .number({ invalid_type_error: 'Số tiết nghĩa vụ phải là số.' })
      .int('Số tiết nghĩa vụ phải là số nguyên.')
      .min(0, 'Số tiết nghĩa vụ không được âm.')
      .max(500, 'Số tiết nghĩa vụ tối đa 500/tháng.'),
    insurancePercentage: z
      .number({ invalid_type_error: '% bảo hiểm phải là số.' })
      .min(0, '% bảo hiểm không được âm.')
      .max(100, '% bảo hiểm tối đa 100.'),
    taxPercentage: z
      .number({ invalid_type_error: '% thuế phải là số.' })
      .min(0, '% thuế không được âm.')
      .max(100, '% thuế tối đa 100.'),
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.', path: ['endDate'] }
  )
  .refine(
    (data) =>
      !['visiting', 'hourly'].includes(data.contractType) || data.baseHourlyRate > 0,
    {
      message: 'Hợp đồng thỉnh giảng/khoán giờ bắt buộc phải có đơn giá tiết > 0.',
      path: ['baseHourlyRate'],
    }
  )
  .refine(
    (data) =>
      ['visiting', 'hourly'].includes(data.contractType) || data.baseSalary > 0,
    {
      message: 'Hợp đồng biên chế/thử việc bắt buộc phải có lương cơ bản > 0.',
      path: ['baseSalary'],
    }
  )

export type ContractFormValues = z.infer<typeof contractSchema>

/** Lệnh chạy tính lương tháng (calculateMonthlyPayroll) */
export const payrollRunSchema = z.object({
  orgId: requiredId('Thiếu org_id: vui lòng chọn cấp quản lý.'),
  month: z.coerce
    .number({ invalid_type_error: 'Tháng phải là số.' })
    .int('Tháng phải là số nguyên.')
    .min(1, 'Tháng phải từ 1 đến 12.')
    .max(12, 'Tháng phải từ 1 đến 12.'),
  year: z.coerce
    .number({ invalid_type_error: 'Năm phải là số.' })
    .int('Năm phải là số nguyên.')
    .min(2020, 'Năm không hợp lệ.')
    .max(2100, 'Năm không hợp lệ.'),
})

/** Một dòng học sinh trong luồng Import (AI Data Gatekeeper) */
export const importStudentSchema = z.object({
  fullName: safeText('Họ tên', 2, 120),
  email: emailSchema,
  phone: phoneVNSchema,
  address: z
    .string()
    .trim()
    .max(255, 'Địa chỉ tối đa 255 ký tự.')
    .refine((v) => !DANGEROUS_CHARS.test(v), 'Địa chỉ chứa ký tự không được phép.')
    .optional()
    .default(''),
})

// ====== Import đào tạo kép (migration 035): dòng import BẮT BUỘC có MaSV ======

export const maSVSchema = z
  .string()
  .trim()
  .min(2, 'MaSV tối thiểu 2 ký tự.')
  .max(50, 'MaSV tối đa 50 ký tự.')
  .regex(/^[A-Za-z0-9._-]+$/, 'MaSV chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới.')

export const importStudentRowSchema = importStudentSchema.extend({
  maSV: maSVSchema,
})

// ====== Khảo sát Giáo viên ẩn danh (migration 022) ======

const ratingSchema = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} phải là số.` })
    .int(`${label} phải là số nguyên.`)
    .min(1, `${label} tối thiểu 1 sao.`)
    .max(5, `${label} tối đa 5 sao.`)

export const evaluationSubmitSchema = z.object({
  token: z
    .string({ required_error: 'Thiếu mã khảo sát.' })
    .trim()
    .min(6, 'Mã khảo sát không hợp lệ.')
    .max(24, 'Mã khảo sát không hợp lệ.'),
  ratingTeaching: ratingSchema('Kỹ năng sư phạm'),
  ratingAttitude: ratingSchema('Thái độ, nhiệt tình'),
  ratingPunctuality: ratingSchema('Đi dạy đúng giờ'),
  feedbackText: z
    .string()
    .trim()
    .max(500, 'Ý kiến đóng góp tối đa 500 ký tự.')
    .refine((v) => !DANGEROUS_CHARS.test(v), 'Ý kiến chứa ký tự không được phép.')
    .default(''),
})

export type EvaluationSubmitValues = z.output<typeof evaluationSubmitSchema>

/** Form tạo Đợt khảo sát (/academic/campaigns) */
export const campaignSchema = z
  .object({
    orgId: requiredId('Thiếu org_id: vui lòng chọn cơ sở.'),
    name: safeText('Tên đợt khảo sát', 2, 160),
    startDate: z
      .string({ required_error: 'Vui lòng chọn ngày bắt đầu.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu không đúng định dạng YYYY-MM-DD.'),
    endDate: z
      .string({ required_error: 'Vui lòng chọn ngày kết thúc.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày kết thúc không đúng định dạng YYYY-MM-DD.'),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.',
    path: ['endDate'],
  })

export type CampaignValues = z.output<typeof campaignSchema>

// ====== CRM Tuyển sinh (/crm/leads) ======

/** Trạng thái pipeline của Lead - khớp CHECK constraint bảng leads */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'test_scheduled',
  'enrolled',
  'lost',
] as const

/** Nguồn tiếp nhận lead (migration 052) */
export const LEAD_SOURCES = [
  'walk_in',
  'hotline',
  'facebook',
  'zalo',
  'website',
  'referral',
  'school_event',
  'ads',
  'other',
] as const

export const LEAD_PRIORITIES = ['hot', 'warm', 'cold'] as const

export const LEAD_ACTIVITY_TYPES = [
  'call',
  'email',
  'meeting',
  'zalo',
  'sms',
  'note',
  'status_change',
] as const

export const LEAD_GENDERS = ['male', 'female', 'other'] as const
export const LEAD_PARENT_RELATIONS = ['father', 'mother', 'guardian', 'other'] as const

/** Form tạo / sửa Lead (hồ sơ tuyển sinh đầy đủ — migration 052/053) */
export const leadSchema = z.object({
  fullName: safeText('Họ tên', 2, 120),
  phone: phoneVNSchema,
  email: z
    .string()
    .trim()
    .email('Email không hợp lệ.')
    .optional()
    .or(z.literal('')),
  interestedSubjectId: z.string().uuid('Môn quan tâm không hợp lệ.').optional().or(z.literal('')),
  source: z.enum(LEAD_SOURCES).optional().or(z.literal('')),
  priority: z.enum(LEAD_PRIORITIES).optional().default('warm'),
  dateOfBirth: optionalDateSchema,
  gender: z.enum(LEAD_GENDERS).optional().or(z.literal('')),
  cccd: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => !v || /^\d{9}$|^\d{12}$/.test(v.replace(/\s/g, '')),
      'CCCD/CMND phải gồm 9 hoặc 12 chữ số.'
    ),
  address: z
    .string()
    .trim()
    .max(300, 'Địa chỉ tối đa 300 ký tự.')
    .optional()
    .default(''),
  currentSchool: z
    .string()
    .trim()
    .max(160, 'Trường đang học tối đa 160 ký tự.')
    .optional()
    .default(''),
  educationLevel: z
    .string()
    .trim()
    .max(80, 'Trình độ tối đa 80 ký tự.')
    .optional()
    .default(''),
  careerInterest: z
    .string()
    .trim()
    .max(200, 'Ngành nghề quan tâm tối đa 200 ký tự.')
    .optional()
    .default(''),
  interests: z
    .string()
    .trim()
    .max(500, 'Sở thích tối đa 500 ký tự.')
    .optional()
    .default(''),
  preferredSchedule: z
    .string()
    .trim()
    .max(200, 'Lịch học mong muốn tối đa 200 ký tự.')
    .optional()
    .default(''),
  callSummary: z
    .string()
    .trim()
    .max(1000, 'Tóm tắt cuộc gọi tối đa 1000 ký tự.')
    .optional()
    .default(''),
  strengths: z
    .string()
    .trim()
    .max(1000, 'Điểm mạnh tối đa 1000 ký tự.')
    .optional()
    .default(''),
  weaknesses: z
    .string()
    .trim()
    .max(1000, 'Điểm yếu tối đa 1000 ký tự.')
    .optional()
    .default(''),
  needs: z
    .string()
    .trim()
    .max(1000, 'Nhu cầu tối đa 1000 ký tự.')
    .optional()
    .default(''),
  potentialRating: z
    .enum(['high', 'medium', 'low', 'unknown'])
    .optional()
    .or(z.literal('')),
  depositAmount: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => !v || (!Number.isNaN(Number(v.replace(/,/g, ''))) && Number(v.replace(/,/g, '')) >= 0),
      'Số tiền đặt cọc không hợp lệ.'
    ),
  paymentNotes: z
    .string()
    .trim()
    .max(1000, 'Ghi chú đóng tiền tối đa 1000 ký tự.')
    .optional()
    .default(''),
  parentName: z
    .string()
    .trim()
    .max(120, 'Tên phụ huynh tối đa 120 ký tự.')
    .optional()
    .default(''),
  parentPhone: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => !v || /^0\d{9}$/.test(v.replace(/\D/g, '')),
      'SĐT phụ huynh phải gồm 10 số bắt đầu bằng 0.'
    ),
  parentRelation: z.enum(LEAD_PARENT_RELATIONS).optional().or(z.literal('')),
  parentEmail: z
    .string()
    .trim()
    .email('Email phụ huynh không hợp lệ.')
    .optional()
    .or(z.literal('')),
  parent2Name: z
    .string()
    .trim()
    .max(120, 'Tên phụ huynh 2 tối đa 120 ký tự.')
    .optional()
    .default(''),
  parent2Phone: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => !v || /^0\d{9}$/.test(v.replace(/\D/g, '')),
      'SĐT phụ huynh 2 phải gồm 10 số bắt đầu bằng 0.'
    ),
  parent2Relation: z.enum(LEAD_PARENT_RELATIONS).optional().or(z.literal('')),
  nextFollowUpAt: z.string().optional().or(z.literal('')),
  appointmentAt: z.string().optional().or(z.literal('')),
  notes: z
    .string()
    .trim()
    .max(500, 'Ghi chú tối đa 500 ký tự.')
    .refine((v) => !DANGEROUS_CHARS.test(v), 'Ghi chú chứa ký tự không được phép.')
    .optional()
    .default(''),
})

/** Kéo thả đổi trạng thái Lead trên Kanban */
export const leadStatusSchema = z
  .object({
    leadId: requiredId('Thiếu ID lead.'),
    status: z.enum(LEAD_STATUSES, {
      errorMap: () => ({ message: 'Trạng thái lead không hợp lệ.' }),
    }),
    lostReason: z
      .string()
      .trim()
      .max(300, 'Lý do mất lead tối đa 300 ký tự.')
      .optional()
      .default(''),
    appointmentAt: z.string().optional().or(z.literal('')),
    nextFollowUpAt: z.string().optional().or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'lost' && !val.lostReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vui lòng nhập lý do mất lead.',
        path: ['lostReason'],
      })
    }
  })

/** Nhật ký chăm sóc lead */
export const leadActivitySchema = z.object({
  leadId: requiredId('Thiếu ID lead.'),
  activityType: z.enum(LEAD_ACTIVITY_TYPES, {
    errorMap: () => ({ message: 'Loại hoạt động không hợp lệ.' }),
  }),
  description: z
    .string()
    .trim()
    .min(2, 'Nội dung tối thiểu 2 ký tự.')
    .max(1000, 'Nội dung tối đa 1000 ký tự.')
    .refine((v) => !DANGEROUS_CHARS.test(v), 'Nội dung chứa ký tự không được phép.'),
  nextFollowUpAt: z.string().optional().or(z.literal('')),
})

export type LeadSource = (typeof LEAD_SOURCES)[number]
export type LeadPriority = (typeof LEAD_PRIORITIES)[number]
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number]

/** Modal chuyển hóa Lead -> Student chính thức (khi kéo vào cột Enrolled) */
export const convertLeadSchema = z.object({
  leadId: requiredId('Thiếu ID lead.'),
  email: emailSchema,
  password: passwordSchema,
  classId: requiredId('Vui lòng chọn lớp để ghi danh.'),
  tuitionAmount: z.coerce
    .number({ invalid_type_error: 'Học phí phải là số.' })
    .positive('Học phí phải lớn hơn 0.')
    .max(1_000_000_000, 'Học phí quá lớn.'),
  dueDate: optionalDateSchema,
})

// ====== Cấu hình động theo tổ chức (/settings) ======

/** Bộ config chuẩn của org_settings.config (JSONB) - khớp default trong migration 016 */
export const orgConfigSchema = z.object({
  auto_attendance_sms: z.boolean({
    invalid_type_error: 'Giá trị bật/tắt SMS không hợp lệ.',
  }),
  max_absence_warning: z.coerce
    .number({ invalid_type_error: 'Ngưỡng vắng mặt phải là số.' })
    .int('Ngưỡng vắng mặt phải là số nguyên.')
    .min(1, 'Ngưỡng vắng mặt tối thiểu 1 buổi.')
    .max(30, 'Ngưỡng vắng mặt tối đa 30 buổi.'),
  absence_early_warning: z.coerce
    .number({ invalid_type_error: 'Ngưỡng cảnh báo sớm phải là số.' })
    .int('Ngưỡng cảnh báo sớm phải là số nguyên.')
    .min(1, 'Ngưỡng sớm tối thiểu 1 buổi.')
    .max(30, 'Ngưỡng sớm tối đa 30 buổi.')
    .default(2),
  gpa_warning_limit: z.coerce
    .number({ invalid_type_error: 'Ngưỡng ĐTB nguy hiểm phải là số.' })
    .min(0)
    .max(10)
    .default(5),
  gpa_early_warning: z.coerce
    .number({ invalid_type_error: 'Ngưỡng ĐTB sớm phải là số.' })
    .min(0)
    .max(10)
    .default(6),
  grading_locked_days: z.coerce
    .number({ invalid_type_error: 'Số ngày khóa điểm phải là số.' })
    .int('Số ngày khóa điểm phải là số nguyên.')
    .min(0, 'Số ngày khóa điểm không được âm.')
    .max(90, 'Số ngày khóa điểm tối đa 90.'),
  require_manager_approval_for_refunds: z.boolean({
    invalid_type_error: 'Giá trị duyệt hoàn phí không hợp lệ.',
  }),
  /** Mã cơ sở dùng để sinh mã học viên (VD: CS1, CG, HN2) */
  org_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{0,8}$/, 'Mã cơ sở chỉ gồm chữ/số, tối đa 8 ký tự.')
    .default(''),
  /** Quy tắc sinh mã học viên của cơ sở (migration 028) */
  student_code_format: z
    .enum(['org_year_seq', 'org_seq', 'year_org_seq'], {
      invalid_type_error: 'Quy tắc mã học viên không hợp lệ.',
    })
    .default('org_year_seq'),
  /** Cá nhân hóa Dashboard: thứ tự + ẩn/hiện widget (kéo thả ở /dashboard) */
  dashboard_widgets: z
    .array(
      z.object({
        id: z.enum([
          'kpi_students',
          'kpi_revenue',
          'kpi_classes',
          'ops_today',
          'attendance_week',
          'enrollment_status',
          'branch_chart',
          'branch_ranking',
          'absent_today',
        ]),
        visible: z.boolean(),
      })
    )
    .max(12)
    .default([
      { id: 'kpi_students', visible: true },
      { id: 'kpi_revenue', visible: true },
      { id: 'kpi_classes', visible: true },
      { id: 'ops_today', visible: true },
      { id: 'attendance_week', visible: true },
      { id: 'enrollment_status', visible: true },
      { id: 'branch_chart', visible: true },
      { id: 'branch_ranking', visible: true },
      { id: 'absent_today', visible: true },
    ]),
  /** CRM / Tuyển sinh (migration 053) */
  crm_ai_enabled: z.boolean().default(true),
  crm_require_cccd: z.boolean().default(false),
  crm_require_parent: z.boolean().default(true),
  crm_require_career: z.boolean().default(false),
  crm_ai_tone: z.enum(['friendly', 'professional']).default('friendly'),
  crm_default_follow_up_hours: z.coerce
    .number()
    .int()
    .min(1, 'Follow-up tối thiểu 1 giờ.')
    .max(168, 'Follow-up tối đa 168 giờ (7 ngày).')
    .default(24),
  crm_ai_system_note: z
    .string()
    .trim()
    .max(800, 'Ghi chú AI tối đa 800 ký tự.')
    .default(''),
  /** Khung giờ ca TKB (lưới tuần + auto) */
  schedule_slots: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(32),
        label: z.string().trim().min(1).max(40),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .max(16)
    .default([
      { id: 'ca1', label: 'Ca 1', start: '07:30', end: '09:00' },
      { id: 'ca2', label: 'Ca 2', start: '09:15', end: '10:45' },
      { id: 'ca3', label: 'Ca 3', start: '13:30', end: '15:00' },
      { id: 'ca4', label: 'Ca 4', start: '15:15', end: '16:45' },
      { id: 'ca5', label: 'Ca 5', start: '18:00', end: '20:00' },
    ]),
  /** HR: quỹ phép năm + tuần làm việc (0=CN … 6=T7) */
  hr_annual_leave_days: z.coerce
    .number()
    .int()
    .min(0)
    .max(60)
    .default(12),
  hr_work_week: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .default([1, 2, 3, 4, 5]),
})

export type OrgConfig = z.infer<typeof orgConfigSchema>

/** Giá trị mặc định - khớp DEFAULT trong migration 016 */
export const DEFAULT_ORG_CONFIG: OrgConfig = {
  auto_attendance_sms: true,
  max_absence_warning: 3,
  absence_early_warning: 2,
  gpa_warning_limit: 5,
  gpa_early_warning: 6,
  grading_locked_days: 7,
  require_manager_approval_for_refunds: true,
  org_code: '',
  student_code_format: 'org_year_seq',
  dashboard_widgets: [
    { id: 'kpi_students', visible: true },
    { id: 'kpi_revenue', visible: true },
    { id: 'kpi_classes', visible: true },
    { id: 'ops_today', visible: true },
    { id: 'attendance_week', visible: true },
    { id: 'enrollment_status', visible: true },
    { id: 'branch_chart', visible: true },
    { id: 'branch_ranking', visible: true },
    { id: 'absent_today', visible: true },
  ],
  crm_ai_enabled: true,
  crm_require_cccd: false,
  crm_require_parent: true,
  crm_require_career: false,
  crm_ai_tone: 'friendly',
  crm_default_follow_up_hours: 24,
  crm_ai_system_note: '',
  schedule_slots: [
    { id: 'ca1', label: 'Ca 1', start: '07:30', end: '09:00' },
    { id: 'ca2', label: 'Ca 2', start: '09:15', end: '10:45' },
    { id: 'ca3', label: 'Ca 3', start: '13:30', end: '15:00' },
    { id: 'ca4', label: 'Ca 4', start: '15:15', end: '16:45' },
    { id: 'ca5', label: 'Ca 5', start: '18:00', end: '20:00' },
  ],
  hr_annual_leave_days: 12,
  hr_work_week: [1, 2, 3, 4, 5],
}

// ====== Cài đặt toàn cục của SuperAdmin (/admin/settings) ======
// Lưu vào org_settings của HQ -> settingsResolver tự "tràn" xuống
// mọi cơ sở con chưa ghi đè.

export const globalSettingsSchema = z.object({
  openai_api_key: z
    .string()
    .trim()
    .max(200, 'API key tối đa 200 ký tự.')
    .default(''),
  allow_late_checkin_minutes: z.coerce
    .number({ invalid_type_error: 'Số phút điểm danh trễ phải là số.' })
    .int('Số phút điểm danh trễ phải là số nguyên.')
    .min(0, 'Số phút điểm danh trễ không được âm.')
    .max(120, 'Số phút điểm danh trễ tối đa 120.'),
  tax_rate_default: z.coerce
    .number({ invalid_type_error: 'Mức thuế mặc định phải là số.' })
    .min(0, 'Mức thuế không được âm.')
    .max(50, 'Mức thuế mặc định tối đa 50%.'),
})

export type GlobalSettingsInput = z.input<typeof globalSettingsSchema>
export type GlobalSettingsValues = z.output<typeof globalSettingsSchema>

// ====== Hồ sơ Học sinh (StudentForm - có trường động) ======

/** Phần CỐ ĐỊNH của form học sinh. Trường động validate riêng theo org_custom_fields. */
export const studentCreateSchema = z.object({
  fullName: safeText('Họ tên', 2, 120),
  email: emailSchema,
  password: passwordSchema,
  phone: z.union([z.literal(''), phoneVNSchema]).default(''),
  /** Giá trị trường động - server validate lần 2 theo định nghĩa của org */
  custom: z.record(z.unknown()).default({}),
})

export const studentUpdateSchema = z.object({
  fullName: safeText('Họ tên', 2, 120),
  phone: z.union([z.literal(''), phoneVNSchema]).default(''),
  custom: z.record(z.unknown()).default({}),
})

// ====== Trường dữ liệu động (/settings/custom-fields) ======

export const customFieldSchema = z
  .object({
    entityType: z.enum(CUSTOM_FIELD_ENTITIES, {
      errorMap: () => ({ message: 'Loại đối tượng không hợp lệ.' }),
    }),
    fieldName: z
      .string({ required_error: 'Tên biến không được để trống.' })
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z][a-z0-9_]{0,59}$/,
        'Tên biến chỉ gồm chữ thường/số/gạch dưới, bắt đầu bằng chữ (VD: shoe_size).'
      ),
    fieldLabel: safeText('Tên hiển thị', 2, 120),
    fieldType: z.enum(CUSTOM_FIELD_TYPES, {
      errorMap: () => ({ message: 'Kiểu dữ liệu không hợp lệ.' }),
    }),
    /** Danh sách lựa chọn, phân tách bằng dấu phẩy - chỉ dùng khi type = select */
    optionsText: z.string().trim().max(500, 'Danh sách lựa chọn tối đa 500 ký tự.').default(''),
    isRequired: z.boolean().default(false),
  })
  .superRefine((values, ctx) => {
    if (values.fieldType === 'select') {
      const options = values.optionsText.split(',').map((s) => s.trim()).filter(Boolean)
      if (options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['optionsText'],
          message: 'Kiểu "Danh sách chọn" cần ít nhất 2 lựa chọn, phân tách bằng dấu phẩy.',
        })
      }
    }
  })

export type CustomFieldFormInput = z.input<typeof customFieldSchema>
export type CustomFieldFormValues = z.output<typeof customFieldSchema>

// ====== Multi-tenant AI (/settings/ai) ======

export const AI_PROVIDERS = ['openai', 'anthropic', 'google'] as const
export type AIProvider = (typeof AI_PROVIDERS)[number]

export const aiSettingsSchema = z.object({
  aiProvider: z.enum(AI_PROVIDERS, {
    errorMap: () => ({ message: 'Nhà cung cấp AI không hợp lệ.' }),
  }),
  defaultModel: safeText('Model mặc định', 2, 80),
  /**
   * Để trống = GIỮ NGUYÊN key đã lưu (khi chỉ đổi provider/model).
   * Bắt buộc khi org chưa có key nào - Server Action kiểm tra thêm.
   */
  apiKey: z
    .string()
    .trim()
    .max(500, 'API Key tối đa 500 ký tự.')
    .refine(
      (value) => value === '' || value.length >= 20,
      'API Key quá ngắn (tối thiểu 20 ký tự) - kiểm tra lại key đã copy.'
    )
    .default(''),
  isActive: z.boolean().default(true),
})

export type AISettingsFormInput = z.input<typeof aiSettingsSchema>
export type AISettingsFormValues = z.output<typeof aiSettingsSchema>

// ====== Tầng License - bán account cơ sở (/admin/licenses - migration 044) ======

const moduleKeysSchema = z
  .array(z.string().trim().min(1))
  .min(1, 'Phải chọn ít nhất 1 module cho gói dịch vụ.')
  .max(50, 'Danh sách module không hợp lệ.')

const licenseMaxStudentsSchema = z
  .string()
  .trim()
  .regex(/^\d*$/, 'Giới hạn học viên phải là số nguyên dương.')
  .default('')

export const saveLicenseSchema = z.object({
  orgId: requiredId('Thiếu cơ sở cần gán license.'),
  planName: safeText('Tên gói', 2, 50),
  moduleKeys: moduleKeysSchema,
  maxStudents: licenseMaxStudentsSchema, // '' = không giới hạn
  validUntil: optionalDateSchema, // '' = vĩnh viễn
  status: z.enum(['active', 'suspended'], {
    errorMap: () => ({ message: 'Trạng thái license không hợp lệ.' }),
  }),
})

export const provisionCampusSchema = z.object({
  campusName: safeText('Tên cơ sở', 2, 120),
  parentId: z.string().trim().default(''), // '' = gắn dưới gốc hệ thống
  planName: safeText('Tên gói', 2, 50),
  moduleKeys: moduleKeysSchema,
  maxStudents: licenseMaxStudentsSchema,
  validUntil: optionalDateSchema,
  adminEmail: emailSchema,
  adminPassword: passwordSchema,
  adminFullName: safeText('Họ tên admin cơ sở'),
  adminPhone: z.union([z.literal(''), phoneVNSchema]).default(''),
  // Người liên hệ của Đơn vị (khách hàng) — trống thì lấy theo admin
  contactName: z.string().trim().max(120, 'Tên người liên hệ tối đa 120 ký tự.').default(''),
  contactEmail: z.union([z.literal(''), emailSchema]).default(''),
  contactPhone: z.union([z.literal(''), phoneVNSchema]).default(''),
})

/** Super Admin tạo/sửa Admin Đơn vị (khách hàng) */
export const unitAdminCreateSchema = z.object({
  orgId: z.string().uuid('Đơn vị không hợp lệ.'),
  fullName: safeText('Họ tên admin', 2, 120),
  email: emailSchema,
  password: passwordSchema,
  phone: z.union([z.literal(''), phoneVNSchema]).default(''),
})

export const unitAdminUpdateSchema = z.object({
  userId: z.string().uuid('Tài khoản không hợp lệ.'),
  fullName: safeText('Họ tên admin', 2, 120),
  phone: z.union([z.literal(''), phoneVNSchema]).default(''),
  /** Trống = giữ mật khẩu cũ */
  newPassword: z.union([z.literal(''), passwordSchema]).default(''),
})

export type SaveLicenseValues = z.infer<typeof saveLicenseSchema>
export type ProvisionCampusValues = z.infer<typeof provisionCampusSchema>

// Kiểu suy ra cho react-hook-form
export type ClassFormValues = z.infer<typeof classFormSchema>
export type CreateUserFormValues = z.infer<typeof createUserSchema>
export type StaffClassFormValues = z.infer<typeof staffClassSchema>
export type LeadFormValues = z.infer<typeof leadSchema>
export type ConvertLeadFormValues = z.infer<typeof convertLeadSchema>
