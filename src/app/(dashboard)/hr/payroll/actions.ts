'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { payrollRunSchema, zodFail } from '@/lib/validation/schemas'
import type { ContractType } from '../contracts/actions'

// ============================================================
// Module Lương & Hợp đồng - phần TÍNH LƯƠNG THÁNG
//
// calculateMonthlyPayroll(orgId, month, year):
//   a) Lấy hợp đồng ACTIVE của giáo viên thuộc org (và chi nhánh con).
//   b) Đếm TỔNG SỐ GIỜ DẠY THỰC TẾ trong tháng:
//      class_sessions đã KẾT THÚC + có ít nhất 1 bản ghi attendance
//      (= buổi đã dạy thật và giáo viên có check-in/điểm danh).
//   c) visiting / hourly : Lương = giờ dạy * base_hourly_rate - thuế.
//   d) full_time : Lương = base_salary; giờ vượt required_hours_per_month
//      tính overtime theo base_hourly_rate; trích BH trên insurance_salary
//      (0 = dùng base_salary); trừ thuế. (probation tính như full_time)
//   e) Upsert kết quả vào payrolls (status = draft), kèm contract_snapshot
//      (jsonb) làm BẰNG CHỨNG hợp đồng tại thời điểm chốt. Bảng lương đã
//      approved/paid KHÔNG bị ghi đè - trả về cảnh báo thay vì sửa.
// ============================================================

export type PayrollResultRow = {
  teacher_id: string
  teacher_name: string
  contract_type: ContractType
  total_hours_taught: number
  regular_pay: number
  teaching_pay: number
  total_allowance: number
  insurance_deduction: number
  tax_deduction: number
  net_pay: number
  skipped: boolean // true = đã approved/paid, không ghi đè
}

export type PayrollRunResult =
  | { error: string }
  | { error?: undefined; rows: PayrollResultRow[]; warnings: string[] }

/** Chia mảng thành lô nhỏ cho mệnh đề .in() (tránh URL quá dài) */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const roundVnd = (value: number) => Math.round(value)

/** Loại hợp đồng trả 100% theo tiết (không có lương cứng, không BH) */
const PER_HOUR_TYPES: ContractType[] = ['visiting', 'hourly']

export async function calculateMonthlyPayroll(
  orgId: string,
  month: number,
  year: number
): Promise<PayrollRunResult> {
  // ===== QA GATE: mọi input qua Zod trước khi chạm Supabase =====
  const parsed = payrollRunSchema.safeParse({ orgId, month, year })
  if (!parsed.success) return zodFail(parsed.error)
  ;({ orgId, month, year } = parsed.data)

  try {
    const supabase = createClient()

    // ===== [BẢO MẬT] Đăng nhập + Campus Admin trên org đích =====
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) {
      return { error: 'Bạn chưa đăng nhập. Tính lương yêu cầu quyền Campus Admin.' }
    }

    // [QA-FIX C] Align menu payroll_contracts: campus_admin + accountant
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .is('deleted_at', null)
      .maybeSingle()
    const role = profile?.role ?? ''
    const roleAllowed =
      role === 'super_admin' || role === 'campus_admin' || role === 'accountant'
    if (!roleAllowed) {
      return {
        error: 'TỪ CHỐI: Chỉ Quản lý cơ sở hoặc Kế toán được tính lương.',
      }
    }
    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgId,
      p_required_role: role === 'accountant' ? 'accountant' : 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return {
        error: 'TỪ CHỐI: Cơ sở này không thuộc quyền quản lý của bạn.',
      }
    }

    // ===== (a) Hợp đồng active trong subtree =====
    const { data: orgIdRows, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) return { error: `Lỗi đọc cây tổ chức: ${orgError.message}` }
    const orgIds = (orgIdRows ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )

    // [BẢO MẬT 015] Đọc qua SECURE VIEW: số tiền NULL nếu user không có
    // can_view_financials -> chặn tính lương ngay bên dưới.
    const { data: contracts, error: contractError } = await supabase
      .from('vw_teacher_contracts_secure')
      .select(
        'id, teacher_id, org_id, contract_type, base_salary, insurance_salary, base_hourly_rate, required_hours_per_month, insurance_percentage, tax_percentage, start_date, end_date, financials_masked'
      )
      .in('org_id', orgIds)
      .eq('is_active', true)
      .is('deleted_at', null)
    if (contractError) return { error: `Lỗi đọc hợp đồng: ${contractError.message}` }
    if (!contracts || contracts.length === 0) {
      return {
        error: 'Không có hợp đồng giáo viên nào đang hiệu lực trong cơ sở này.',
      }
    }
    if (contracts.some((c) => c.financials_masked === true)) {
      return {
        error:
          'TỪ CHỐI: Bạn chưa được cấp quyền xem dữ liệu tài chính (can_view_financials) nên không thể tính lương.',
      }
    }

    // View không embed được qua FK -> fetch tên giáo viên riêng
    const { data: teacherNames } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', contracts.map((c) => c.teacher_id))
    const teacherNameById = new Map(
      (teacherNames ?? []).map((t) => [t.id, t.full_name])
    )

    // ===== (b) Tổng giờ dạy thực tế trong tháng =====
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 1)
    const now = new Date()
    const teacherIds = contracts.map((c) => c.teacher_id)

    // [ĐA TẦNG] Bắt buộc lọc org_id: chỉ tính tiết dạy trong subtree của
    // org trả lương - buổi dạy ở cơ sở khác do cơ sở đó tự chi trả.
    const { data: sessions, error: sessionError } = await supabase
      .from('class_sessions')
      .select('id, teacher_id, start_time, end_time')
      .in('teacher_id', teacherIds)
      .in('org_id', orgIds)
      .gte('start_time', monthStart.toISOString())
      .lt('start_time', monthEnd.toISOString())
      .lte('end_time', now.toISOString()) // chỉ buổi ĐÃ diễn ra
      .is('deleted_at', null)
    if (sessionError) return { error: `Lỗi đọc buổi dạy: ${sessionError.message}` }

    // Buổi "đã dạy thật" = có ít nhất 1 bản ghi điểm danh (GV check-in)
    const checkedInSessionIds = new Set<string>()
    for (const batch of chunk((sessions ?? []).map((s) => s.id), 200)) {
      if (batch.length === 0) continue
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('attendance')
        .select('session_id')
        .in('session_id', batch)
        .is('deleted_at', null)
      if (attendanceError) {
        return { error: `Lỗi đọc điểm danh: ${attendanceError.message}` }
      }
      for (const row of attendanceRows ?? []) checkedInSessionIds.add(row.session_id)
    }

    const hoursByTeacher = new Map<string, number>()
    for (const session of sessions ?? []) {
      if (!checkedInSessionIds.has(session.id)) continue
      const hours =
        (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) /
        3_600_000
      hoursByTeacher.set(
        session.teacher_id,
        (hoursByTeacher.get(session.teacher_id) ?? 0) + hours
      )
    }

    // ===== (c)(d) Tính lương theo loại hợp đồng =====
    const warnings: string[] = []
    const rows: PayrollResultRow[] = []

    // Không ghi đè bảng lương đã duyệt/đã chi
    const { data: lockedPayrolls } = await supabase
      .from('payrolls')
      .select('teacher_id, status')
      .in('teacher_id', teacherIds)
      .eq('month', month)
      .eq('year', year)
      .neq('status', 'draft')
      .is('deleted_at', null)
    const lockedTeacherIds = new Set((lockedPayrolls ?? []).map((p) => p.teacher_id))

    for (const contract of contracts) {
      const teacherName = teacherNameById.get(contract.teacher_id) ?? contract.teacher_id

      const totalHours = Math.round((hoursByTeacher.get(contract.teacher_id) ?? 0) * 100) / 100
      const hourlyRate = Number(contract.base_hourly_rate)
      const baseSalary = Number(contract.base_salary)
      // Căn cứ đóng BHXH: insurance_salary; 0 = dùng lương cơ bản
      const insuranceBase =
        Number(contract.insurance_salary) > 0
          ? Number(contract.insurance_salary)
          : baseSalary
      const requiredHours = contract.required_hours_per_month
      const insuranceRate = Number(contract.insurance_percentage) / 100
      const taxRate = Number(contract.tax_percentage) / 100
      const contractType = contract.contract_type as ContractType

      let regularPay = 0
      let teachingPay = 0
      let insurance = 0
      const totalAllowance = 0 // phụ cấp/rate_modifiers: cấu hình sau

      if (PER_HOUR_TYPES.includes(contractType)) {
        // Thỉnh giảng / khoán giờ: toàn bộ theo tiết, không BH
        teachingPay = roundVnd(totalHours * hourlyRate)
      } else {
        // Biên chế / thử việc: lương cứng + tiết vượt nghĩa vụ
        regularPay = roundVnd(baseSalary)
        const overtimeHours = Math.max(0, totalHours - requiredHours)
        teachingPay = roundVnd(overtimeHours * hourlyRate)
        insurance = roundVnd(insuranceBase * insuranceRate)
      }

      const tax = roundVnd((regularPay + teachingPay + totalAllowance) * taxRate)
      const netPay = regularPay + teachingPay + totalAllowance - insurance - tax

      const skipped = lockedTeacherIds.has(contract.teacher_id)
      if (skipped) {
        warnings.push(
          `Bảng lương ${month}/${year} của ${teacherName} đã duyệt/đã chi - bỏ qua, không ghi đè.`
        )
      }

      rows.push({
        teacher_id: contract.teacher_id,
        teacher_name: teacherName,
        contract_type: contractType,
        total_hours_taught: totalHours,
        regular_pay: regularPay,
        teaching_pay: teachingPay,
        total_allowance: totalAllowance,
        insurance_deduction: insurance,
        tax_deduction: tax,
        net_pay: netPay,
        skipped,
      })

      // ===== (e) Upsert vào payrolls (chỉ bản draft) =====
      if (!skipped) {
        // Bản chụp hợp đồng làm bằng chứng - hợp đồng đổi sau này
        // không làm sai lệch bảng lương đã chốt
        const contractSnapshot = {
          contract_id: contract.id,
          contract_type: contractType,
          base_salary: baseSalary,
          insurance_salary: Number(contract.insurance_salary),
          base_hourly_rate: hourlyRate,
          required_hours_per_month: requiredHours,
          insurance_percentage: Number(contract.insurance_percentage),
          tax_percentage: Number(contract.tax_percentage),
          start_date: contract.start_date,
          end_date: contract.end_date,
          snapshot_at: new Date().toISOString(),
        }

        const { error: upsertError } = await supabase.from('payrolls').upsert(
          {
            org_id: contract.org_id,
            teacher_id: contract.teacher_id,
            month,
            year,
            contract_snapshot: contractSnapshot,
            total_hours_taught: totalHours,
            regular_pay: regularPay,
            teaching_pay: teachingPay,
            total_allowance: totalAllowance,
            insurance_deduction: insurance,
            tax_deduction: tax,
            net_pay: netPay,
            status: 'draft',
          },
          { onConflict: 'teacher_id,month,year' }
        )
        if (upsertError) {
          return { error: `Không thể lưu bảng lương của ${teacherName}: ${upsertError.message}` }
        }
      }
    }

    revalidatePath('/hr/contracts')
    return { rows, warnings }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tính lương tháng.',
    }
  }
}
