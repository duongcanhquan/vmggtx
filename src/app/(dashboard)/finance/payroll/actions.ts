'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { payrollRunSchema, zodFail } from '@/lib/validation/schemas'
import {
  calculateTeacherPayrollBatch,
  type PayrollContractType,
} from '@/lib/services/payrollService'

// ============================================================
// "Chạy Bảng Lương Tháng" (/finance/payroll)
//
// runMonthlyPayroll(orgId, month, year):
//   1. [Bảo mật] Đăng nhập + is_authorized(campus_admin, orgId).
//   2. Lấy TẤT CẢ giáo viên thuộc orgId (và chi nhánh con).
//   3. Gọi Engine calculateTeacherPayroll cho từng giáo viên.
//   4. Lưu kết quả vào payrolls (status='draft', kèm contract_snapshot).
//      Bảng lương đã approved/paid KHÔNG bị ghi đè.
//   5. Trả về danh sách chi tiết để Kế toán dò lại trên Table.
// ============================================================

export type PayrollTableRow = {
  teacher_id: string
  teacher_name: string
  contract_type: PayrollContractType | null
  total_hours_taught: number
  regular_pay: number
  teaching_pay: number
  insurance_deduction: number
  tax_deduction: number
  net_pay: number
  /** 'saved' = đã lưu draft | 'locked' = đã duyệt/chi, bỏ qua | 'no_contract' */
  outcome: 'saved' | 'locked' | 'no_contract'
  note: string
}

export type RunPayrollResult =
  | { error: string }
  | { error?: undefined; rows: PayrollTableRow[] }

export async function runMonthlyPayroll(
  orgId: string,
  month: number,
  year: number
): Promise<RunPayrollResult> {
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
      return { error: 'Bạn chưa đăng nhập. Chạy bảng lương yêu cầu quyền Campus Admin.' }
    }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: orgId,
      p_required_role: 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return {
        error:
          'TỪ CHỐI: Bạn không phải Campus Admin, hoặc cơ sở này không thuộc quyền quản lý của bạn.',
      }
    }

    // ===== Toàn bộ giáo viên trong subtree của org đang chọn =====
    const { data: orgIdRows, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) return { error: `Lỗi đọc cây tổ chức: ${orgError.message}` }
    const orgIds = (orgIdRows ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )

    const { data: teachers, error: teacherError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'teacher')
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('full_name')
    if (teacherError) return { error: `Lỗi đọc giáo viên: ${teacherError.message}` }
    if (!teachers || teachers.length === 0) {
      return { error: 'Không có giáo viên nào trong cơ sở này.' }
    }

    // Bảng lương đã duyệt/đã chi trong kỳ -> khóa, không ghi đè
    const { data: lockedPayrolls } = await supabase
      .from('payrolls')
      .select('teacher_id')
      .in('teacher_id', teachers.map((t) => t.id))
      .eq('month', month)
      .eq('year', year)
      .neq('status', 'draft')
      .is('deleted_at', null)
    const lockedTeacherIds = new Set((lockedPayrolls ?? []).map((p) => p.teacher_id))

    // ===== [CHỐNG N+1] Engine tính HÀNG LOẠT: 2 query cho cả danh sách
    // (thay vì 2-3 query x số giáo viên), upsert draft GỘP 1 LẦN =====
    const batchResults = await calculateTeacherPayrollBatch(
      teachers.map((t) => t.id),
      orgId,
      month,
      year,
      orgIds
    )

    const rows: PayrollTableRow[] = []
    const draftUpserts: Record<string, unknown>[] = []

    for (const teacher of teachers) {
      const result = batchResults.get(teacher.id)

      if (!result || result.error !== undefined) {
        // Không có hợp đồng / lỗi lẻ: đưa vào bảng để Kế toán biết, không chặn cả kỳ
        rows.push({
          teacher_id: teacher.id,
          teacher_name: teacher.full_name,
          contract_type: null,
          total_hours_taught: 0,
          regular_pay: 0,
          teaching_pay: 0,
          insurance_deduction: 0,
          tax_deduction: 0,
          net_pay: 0,
          outcome: 'no_contract',
          note: result?.error ?? 'Không tính được lương cho giáo viên này.',
        })
        continue
      }

      const payroll = result.payroll
      const locked = lockedTeacherIds.has(teacher.id)

      if (!locked) {
        draftUpserts.push({
          org_id: payroll.orgId,
          teacher_id: payroll.teacherId,
          month,
          year,
          contract_snapshot: payroll.contractSnapshot,
          total_hours_taught: payroll.totalHoursTaught,
          regular_pay: payroll.regularPay,
          teaching_pay: payroll.teachingPay,
          total_allowance: payroll.totalAllowance,
          insurance_deduction: payroll.insuranceDeduction,
          tax_deduction: payroll.taxDeduction,
          net_pay: payroll.netPay,
          status: 'draft',
        })
      }

      rows.push({
        teacher_id: teacher.id,
        teacher_name: teacher.full_name,
        contract_type: payroll.contractType,
        total_hours_taught: payroll.totalHoursTaught,
        regular_pay: payroll.regularPay,
        teaching_pay: payroll.teachingPay,
        insurance_deduction: payroll.insuranceDeduction,
        tax_deduction: payroll.taxDeduction,
        net_pay: payroll.netPay,
        outcome: locked ? 'locked' : 'saved',
        note: locked
          ? 'Bảng lương kỳ này đã duyệt/đã chi - giữ nguyên, không ghi đè.'
          : 'Đã lưu nháp (draft).',
      })
    }

    // ===== Lưu draft GỘP 1 lần =====
    if (draftUpserts.length > 0) {
      const { error: upsertError } = await supabase
        .from('payrolls')
        .upsert(draftUpserts, { onConflict: 'teacher_id,month,year' })
      if (upsertError) {
        return { error: `Không thể lưu bảng lương: ${upsertError.message}` }
      }
    }

    revalidatePath('/finance/payroll')
    return { rows }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi chạy bảng lương.',
    }
  }
}
