import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { resolveSetting } from '@/lib/utils/settingsResolver'

// ============================================================
// PAYROLL ENGINE - Máy tính lương giáo viên GDTX.
//
// Thu thập dữ liệu từ Lịch dạy thực tế (class_sessions đã
// 'completed' = giáo viên đã chốt điểm danh) + Hợp đồng active
// (teacher_contracts) để ra con số cuối cùng.
//
// Công thức theo loại hợp đồng:
//   full_time (biên chế):
//     regularPay = base_salary
//     insurance  = insurance_salary * insurance_percentage/100
//                  (insurance_salary = 0 -> dùng base_salary)
//     teachingPay = max(0, tiết dạy - tiết nghĩa vụ) * base_hourly_rate
//     tax = (regularPay + teachingPay) * tax_percentage/100
//   visiting / hourly (thỉnh giảng / khoán giờ):
//     teachingPay = tiết dạy * base_hourly_rate
//     tax = teachingPay * tax_percentage/100
//   netPay = regularPay + teachingPay - insurance - tax
// ============================================================

export type PayrollContractType = 'full_time' | 'visiting' | 'hourly' | 'probation'

/** Bản chụp hợp đồng tại thời điểm tính - lưu vào payrolls.contract_snapshot */
export type ContractSnapshot = {
  contract_id: string
  contract_type: PayrollContractType
  base_salary: number
  insurance_salary: number
  base_hourly_rate: number
  required_hours_per_month: number
  insurance_percentage: number
  tax_percentage: number
  start_date: string | null
  end_date: string | null
  snapshot_at: string
}

export type TeacherPayroll = {
  teacherId: string
  /** org của HỢP ĐỒNG (cơ sở trả lương), không phải org truyền vào */
  orgId: string
  month: number
  year: number
  contractType: PayrollContractType
  totalHoursTaught: number
  /** Buổi completed nhưng chưa điểm danh — không tính lương (D-HR7) */
  sessionsMissingAttendance: number
  regularPay: number
  teachingPay: number
  totalAllowance: number
  insuranceDeduction: number
  taxDeduction: number
  netPay: number
  contractSnapshot: ContractSnapshot
}

export type PayrollCalcResult =
  | { error: string }
  | { error?: undefined; payroll: TeacherPayroll }

const roundVnd = (value: number) => Math.round(value)

/** Loại hợp đồng trả 100% theo tiết (không lương cứng, không BHXH) */
const PER_HOUR_TYPES: PayrollContractType[] = ['visiting', 'hourly']

/** Row hợp đồng đọc từ vw_teacher_contracts_secure */
type SecureContractRow = {
  id: string
  teacher_id?: string
  org_id: string
  contract_type: string
  base_salary: number | null
  insurance_salary: number | null
  base_hourly_rate: number | null
  required_hours_per_month: number
  insurance_percentage: number | null
  tax_percentage: number | null
  start_date: string | null
  end_date: string | null
  financials_masked: boolean | null
}

/**
 * TÍNH THUẦN (không query): áp công thức lương theo loại hợp đồng.
 * Dùng chung cho bản tính lẻ và bản tính hàng loạt.
 */
function computePayroll(
  teacherId: string,
  contract: SecureContractRow,
  totalHoursTaught: number,
  taxPercentage: number,
  month: number,
  year: number,
  sessionsMissingAttendance = 0
): TeacherPayroll {
  let regularPay = 0
  let teachingPay = 0
  let insurance = 0
  let tax = 0
  const totalAllowance = 0 // phụ cấp (rate_modifiers) - nối sau

  const contractType = contract.contract_type as PayrollContractType
  const baseSalary = Number(contract.base_salary)
  const insuranceSalary = Number(contract.insurance_salary)
  const baseHourlyRate = Number(contract.base_hourly_rate)
  const requiredHours = contract.required_hours_per_month
  const insurancePct = Number(contract.insurance_percentage) / 100
  const taxPct = taxPercentage / 100

  if (PER_HOUR_TYPES.includes(contractType)) {
    // CASE visiting / hourly: trả trọn theo tiết, khấu trừ thuế tại nguồn
    teachingPay = roundVnd(totalHoursTaught * baseHourlyRate)
    tax = roundVnd(teachingPay * taxPct)
  } else {
    // CASE full_time (probation tính như full_time)
    regularPay = roundVnd(baseSalary)
    insurance = roundVnd(
      (insuranceSalary > 0 ? insuranceSalary : baseSalary) * insurancePct
    )
    if (totalHoursTaught > requiredHours) {
      teachingPay = roundVnd((totalHoursTaught - requiredHours) * baseHourlyRate)
    }
    tax = roundVnd((regularPay + teachingPay) * taxPct)
  }

  const netPay = regularPay + teachingPay + totalAllowance - insurance - tax

  return {
    teacherId,
    orgId: contract.org_id,
    month,
    year,
    contractType,
    totalHoursTaught,
    sessionsMissingAttendance,
    regularPay,
    teachingPay,
    totalAllowance,
    insuranceDeduction: insurance,
    taxDeduction: tax,
    netPay,
    contractSnapshot: {
      contract_id: contract.id,
      contract_type: contractType,
      base_salary: baseSalary,
      insurance_salary: insuranceSalary,
      base_hourly_rate: baseHourlyRate,
      required_hours_per_month: requiredHours,
      insurance_percentage: Number(contract.insurance_percentage),
      tax_percentage: taxPercentage,
      start_date: contract.start_date,
      end_date: contract.end_date,
      snapshot_at: new Date().toISOString(),
    },
  }
}

/**
 * Lấy tập session_id CÓ ÍT NHẤT 1 record điểm danh (không xóa mềm).
 * Chia lô 200 id/query để tránh vượt giới hạn URL của PostgREST.
 */
async function fetchAttendedSessionIds(
  supabase: ReturnType<typeof createClient>,
  sessionIds: string[]
): Promise<{ error: string } | { error?: undefined; ids: Set<string> }> {
  const ids = new Set<string>()
  const CHUNK = 200
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('attendance')
      .select('session_id')
      .in('session_id', chunk)
      .is('deleted_at', null)
    if (error) return { error: `Lỗi đối chiếu điểm danh: ${error.message}` }
    for (const row of data ?? []) ids.add(row.session_id)
  }
  return { ids }
}

/**
 * [CHỐNG N+1] Tính lương HÀNG LOẠT cho nhiều giáo viên với đúng 2 query
 * (+ 1 lần resolve thuế mặc định cho mỗi org có hợp đồng thiếu thuế):
 *   1. Toàn bộ hợp đồng active của danh sách GV (1 query .in())
 *   2. Toàn bộ buổi dạy completed trong tháng của danh sách GV (1 query)
 * Thay cho việc gọi calculateTeacherPayroll lặp (2-3 query/giáo viên).
 *
 * options.sessionStatus:
 *   'completed' (mặc định) = lương THẬT theo tiết đã chốt điểm danh
 *   'scheduled'            = DỰ BÁO ngân sách theo tiết ĐÃ XẾP LỊCH tương lai
 */
export async function calculateTeacherPayrollBatch(
  teacherIds: string[],
  orgId: string,
  month: number,
  year: number,
  precomputedOrgIds?: string[],
  options?: { sessionStatus?: 'completed' | 'scheduled' }
): Promise<Map<string, PayrollCalcResult>> {
  const results = new Map<string, PayrollCalcResult>()
  if (teacherIds.length === 0) return results

  const supabase = createClient()

  // Scope tổ chức
  let orgIds: string[]
  if (precomputedOrgIds) {
    orgIds = precomputedOrgIds
  } else {
    const { data: orgIdRows, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) {
      const fail = { error: `Lỗi đọc cây tổ chức: ${orgError.message}` }
      for (const id of teacherIds) results.set(id, fail)
      return results
    }
    orgIds = (orgIdRows ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )
  }

  const monthStart = new Date(year, month - 1, 1).toISOString()
  const monthEnd = new Date(year, month, 1).toISOString()

  // ===== 2 QUERY GỘP: hợp đồng + buổi dạy của TẤT CẢ giáo viên =====
  const [contractsRes, sessionsRes] = await Promise.all([
    supabase
      .from('vw_teacher_contracts_secure')
      .select(
        'id, teacher_id, org_id, contract_type, base_salary, insurance_salary, base_hourly_rate, required_hours_per_month, insurance_percentage, tax_percentage, start_date, end_date, financials_masked'
      )
      .in('teacher_id', teacherIds)
      .in('org_id', orgIds)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('class_sessions')
      .select('id, teacher_id')
      .in('teacher_id', teacherIds)
      .in('org_id', orgIds)
      .eq('status', options?.sessionStatus ?? 'completed')
      .gte('start_time', monthStart)
      .lt('start_time', monthEnd)
      .is('deleted_at', null),
  ])

  if (contractsRes.error) {
    const fail = { error: `Lỗi đọc hợp đồng: ${contractsRes.error.message}` }
    for (const id of teacherIds) results.set(id, fail)
    return results
  }
  if (sessionsRes.error) {
    const fail = { error: `Lỗi đếm tiết dạy: ${sessionsRes.error.message}` }
    for (const id of teacherIds) results.set(id, fail)
    return results
  }

  // Hợp đồng mới nhất theo giáo viên (đã order created_at desc)
  const contractByTeacher = new Map<string, SecureContractRow>()
  for (const row of (contractsRes.data ?? []) as SecureContractRow[]) {
    const tid = row.teacher_id as string
    if (!contractByTeacher.has(tid)) contractByTeacher.set(tid, row)
  }

  // [AUDIT CROSS-MODULE] Lương THẬT chỉ trả cho buổi 'completed' CÓ
  // record điểm danh (giáo viên thực sự đứng lớp và chốt sổ). Buổi bị
  // đánh completed "chay" không điểm danh -> KHÔNG tính tiền.
  // Chế độ dự báo ('scheduled') là tương lai nên bỏ qua check này.
  const sessions = (sessionsRes.data ?? []) as { id: string; teacher_id: string }[]
  let payableSessions = sessions
  if ((options?.sessionStatus ?? 'completed') === 'completed' && sessions.length > 0) {
    const attendedIds = await fetchAttendedSessionIds(
      supabase,
      sessions.map((s) => s.id)
    )
    if (attendedIds.error !== undefined) {
      const fail = { error: attendedIds.error }
      for (const id of teacherIds) results.set(id, fail)
      return results
    }
    payableSessions = sessions.filter((s) => attendedIds.ids.has(s.id))
  }

  // Đếm tiết dạy theo giáo viên + tiết bị loại vì thiếu điểm danh
  const hoursByTeacher = new Map<string, number>()
  const skippedByTeacher = new Map<string, number>()
  for (const session of sessions) {
    const paid = payableSessions.some((p) => p.id === session.id)
    if (paid) {
      hoursByTeacher.set(
        session.teacher_id,
        (hoursByTeacher.get(session.teacher_id) ?? 0) + 1
      )
    } else if ((options?.sessionStatus ?? 'completed') === 'completed') {
      skippedByTeacher.set(
        session.teacher_id,
        (skippedByTeacher.get(session.teacher_id) ?? 0) + 1
      )
    }
  }

  // Thuế mặc định resolve 1 LẦN cho mỗi org (cache), chỉ khi hợp đồng thiếu
  const taxDefaultByOrg = new Map<string, number>()
  async function resolveTaxDefault(contractOrgId: string): Promise<number> {
    const cached = taxDefaultByOrg.get(contractOrgId)
    if (cached !== undefined) return cached
    const resolved = (await resolveSetting('tax_rate_default', contractOrgId)).value
    taxDefaultByOrg.set(contractOrgId, resolved)
    return resolved
  }

  for (const teacherId of teacherIds) {
    const contract = contractByTeacher.get(teacherId)
    if (!contract) {
      results.set(teacherId, {
        error: 'Giáo viên chưa có hợp đồng đang hiệu lực trong cơ sở này.',
      })
      continue
    }
    if (contract.financials_masked === true) {
      results.set(teacherId, {
        error:
          'TỪ CHỐI: Bạn chưa được cấp quyền xem dữ liệu tài chính (can_view_financials) nên không thể tính lương.',
      })
      continue
    }

    const taxPercentage =
      contract.tax_percentage === null || contract.tax_percentage === undefined
        ? await resolveTaxDefault(contract.org_id)
        : Number(contract.tax_percentage)

    results.set(teacherId, {
      payroll: computePayroll(
        teacherId,
        contract,
        hoursByTeacher.get(teacherId) ?? 0,
        taxPercentage,
        month,
        year,
        skippedByTeacher.get(teacherId) ?? 0
      ),
    })
  }

  return results
}

/**
 * Tính lương 1 giáo viên trong 1 tháng (chạy trên Server).
 *
 * @param teacherId  Giáo viên cần tính
 * @param orgId      Cơ sở gốc (hợp đồng được tìm trong subtree của org này)
 * @param month 1-12, @param year VD 2026
 * @param precomputedOrgIds Tối ưu khi gọi lặp cho nhiều GV: truyền sẵn
 *        danh sách org con để khỏi gọi RPC get_descendant_org_ids từng lần.
 */
export async function calculateTeacherPayroll(
  teacherId: string,
  orgId: string,
  month: number,
  year: number,
  precomputedOrgIds?: string[]
): Promise<PayrollCalcResult> {
  const supabase = createClient()

  // ===== Scope tổ chức: orgId + toàn bộ chi nhánh con =====
  let orgIds: string[]
  if (precomputedOrgIds) {
    orgIds = precomputedOrgIds
  } else {
    const { data: orgIdRows, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) return { error: `Lỗi đọc cây tổ chức: ${orgError.message}` }
    orgIds = (orgIdRows ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )
  }

  // ===== BƯỚC 1a: Hợp đồng ACTIVE của giáo viên =====
  // [BẢO MẬT 015] Đọc qua SECURE VIEW: nếu user không có
  // can_view_financials, số tiền trả về NULL -> chặn ngay bên dưới,
  // KHÔNG bao giờ tính lương trên dữ liệu bị che.
  const { data: contract, error: contractError } = await supabase
    .from('vw_teacher_contracts_secure')
    .select(
      'id, org_id, contract_type, base_salary, insurance_salary, base_hourly_rate, required_hours_per_month, insurance_percentage, tax_percentage, start_date, end_date, financials_masked'
    )
    .eq('teacher_id', teacherId)
    .in('org_id', orgIds)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (contractError) return { error: `Lỗi đọc hợp đồng: ${contractError.message}` }
  if (!contract) {
    return { error: 'Giáo viên chưa có hợp đồng đang hiệu lực trong cơ sở này.' }
  }
  if (contract.financials_masked === true) {
    return {
      error:
        'TỪ CHỐI: Bạn chưa được cấp quyền xem dữ liệu tài chính (can_view_financials) nên không thể tính lương.',
    }
  }

  // ===== BƯỚC 1b: Tổng số tiết ĐÃ DẠY trong tháng =====
  // Chỉ đếm class_sessions status='completed' VÀ có record điểm danh
  // (buổi completed "chay" không điểm danh -> không tính tiền).
  // [ĐA TẦNG] Bắt buộc lọc org_id: chỉ đếm tiết dạy TRONG cơ sở trả lương
  // (giáo viên có thể dạy nhiều chi nhánh - cơ sở khác tự trả phần của họ).
  const monthStart = new Date(year, month - 1, 1).toISOString()
  const monthEnd = new Date(year, month, 1).toISOString()

  const { data: sessionRows, error: sessionError } = await supabase
    .from('class_sessions')
    .select('id')
    .eq('teacher_id', teacherId)
    .in('org_id', orgIds)
    .eq('status', 'completed')
    .gte('start_time', monthStart)
    .lt('start_time', monthEnd)
    .is('deleted_at', null)
  if (sessionError) return { error: `Lỗi đếm tiết dạy: ${sessionError.message}` }

  let totalHoursTaught = 0
  let sessionsMissingAttendance = 0
  if ((sessionRows ?? []).length > 0) {
    const attended = await fetchAttendedSessionIds(
      supabase,
      (sessionRows ?? []).map((s) => s.id)
    )
    if (attended.error !== undefined) return { error: attended.error }
    totalHoursTaught = (sessionRows ?? []).filter((s) => attended.ids.has(s.id)).length
    sessionsMissingAttendance = (sessionRows ?? []).length - totalHoursTaught
  }

  // [CẤU HÌNH ĐỘNG] Hợp đồng KHÔNG ghi rõ thuế -> dùng tax_rate_default
  // phân giải qua settingsResolver (Cơ sở -> Cụm -> HQ -> default 10%).
  const taxPercentage =
    contract.tax_percentage === null || contract.tax_percentage === undefined
      ? (await resolveSetting('tax_rate_default', contract.org_id)).value
      : Number(contract.tax_percentage)

  // ===== BƯỚC 2-5: áp công thức chung =====
  return {
    payroll: computePayroll(
      teacherId,
      contract as SecureContractRow,
      totalHoursTaught,
      taxPercentage,
      month,
      year,
      sessionsMissingAttendance
    ),
  }
}
