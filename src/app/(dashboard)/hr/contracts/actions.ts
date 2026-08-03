'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contractSchema, requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// Module Lương & Hợp đồng - phần HỢP ĐỒNG GIÁO VIÊN
// (/hr/contracts - dành cho Campus Admin)
//
// Cơ chế nhân sự GDTX:
//   full_time (biên chế) : lương cơ bản + tiết vượt nghĩa vụ tính
//                          theo đơn giá; trích BH trên insurance_salary
//                          (0 = dùng base_salary).
//   visiting (thỉnh giảng): lương = số tiết dạy thực tế * đơn giá;
//                          không BH, chỉ trừ thuế TNCN (nếu có).
//   hourly (khoán giờ)    : tính như thỉnh giảng - trả theo tiết.
//   probation (thử việc)  : legacy, tính như biên chế.
// ============================================================

export type ContractType = 'full_time' | 'visiting' | 'hourly' | 'probation'

export type ContractRow = {
  id: string
  teacher_id: string
  teacher_name: string
  org_id: string
  org_name: string
  contract_type: ContractType
  /** NULL = bị che bởi Secure View (user không có can_view_financials) */
  base_salary: number | null
  insurance_salary: number | null
  base_hourly_rate: number | null
  required_hours_per_month: number
  insurance_percentage: number
  tax_percentage: number
  start_date: string | null
  end_date: string | null
  probation_end_date: string | null
  is_active: boolean
  /** true = số tiền đã bị Secure View che (migration 015) */
  financials_masked: boolean
}

export type TeacherOption = { id: string; full_name: string }

type ActionResult = { error: string } | { error?: undefined }

/**
 * Quyền của người đang đăng nhập với dữ liệu tài chính nhạy cảm.
 * campus_admin / super_admin luôn được xem (D30); role khác theo
 * profiles.can_view_financials (migration 015 + 071).
 */
export async function getViewerPermissions(): Promise<{
  canViewFinancials: boolean
  demo: boolean
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { canViewFinancials: false, demo: false }

    const { data } = await supabase
      .from('profiles')
      .select('role, can_view_financials')
      .eq('id', user.id)
      .maybeSingle()

    const role = data?.role as string | undefined
    if (role === 'super_admin' || role === 'campus_admin') {
      return { canViewFinancials: true, demo: false }
    }
    return { canViewFinancials: data?.can_view_financials === true, demo: false }
  } catch {
    return { canViewFinancials: false, demo: false }
  }
}

/** Giáo viên thuộc org (và chi nhánh con) để đổ vào dropdown chọn GV */
export async function getTeachersInScope(
  orgId: string
): Promise<{ data: TeacherOption[]; demo: boolean }> {
  try {
    const supabase = createClient()
    const { data: orgIds, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) throw orgError

    const ids = (orgIds ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'teacher')
      .in('org_id', ids)
      .is('deleted_at', null)
      .order('full_name')
    if (error) {
      console.error('[QA-FIX C] getTeachersInScope:', error.message)
      return { data: [], demo: false }
    }

    return { data: data ?? [], demo: false }
  } catch {
    return { data: [], demo: false }
  }
}

/**
 * Danh sách hợp đồng trong subtree của org đang chọn.
 *
 * [BẢO MẬT 015] Query từ SECURE VIEW vw_teacher_contracts_secure thay vì
 * bảng gốc: số tiền tự động NULL nếu user không có can_view_financials.
 * View không có FK nên tên giáo viên/cơ sở được fetch riêng rồi ghép.
 */
export async function getContracts(
  orgId: string
): Promise<{ data: ContractRow[]; demo: boolean }> {
  try {
    const supabase = createClient()
    const { data: orgIds, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) throw orgError

    const ids = (orgIds ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )

    const { data, error } = await supabase
      .from('vw_teacher_contracts_secure')
      .select(
        'id, teacher_id, org_id, contract_type, base_salary, insurance_salary, base_hourly_rate, required_hours_per_month, insurance_percentage, tax_percentage, start_date, end_date, probation_end_date, is_active, financials_masked'
      )
      .in('org_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[QA-FIX C] getContracts:', error.message)
      return { data: [], demo: false }
    }
    if (!data || data.length === 0) {
      return { data: [], demo: false }
    }

    // Ghép tên giáo viên + tên cơ sở (view không embed được qua FK)
    const teacherIds = Array.from(new Set(data.map((row) => row.teacher_id)))
    const contractOrgIds = Array.from(new Set(data.map((row) => row.org_id)))
    const [teacherResult, orgResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds)
        .is('deleted_at', null),
      supabase
        .from('organizations')
        .select('id, name')
        .in('id', contractOrgIds)
        .is('deleted_at', null),
    ])
    const teacherNameById = new Map(
      (teacherResult.data ?? []).map((t) => [t.id, t.full_name])
    )
    const orgNameById = new Map((orgResult.data ?? []).map((o) => [o.id, o.name]))

    // Campus Admin / Super Admin luôn xem số tiền (D30) — kể cả khi
    // get_my_can_view_financials chưa cập nhật (migration 071 chưa chạy).
    let amountById = new Map<
      string,
      {
        base_salary: number | null
        insurance_salary: number | null
        base_hourly_rate: number | null
      }
    >()
    const needsUnmask = data.some((row) => row.financials_masked === true)
    if (needsUnmask) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: me } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (me?.role === 'campus_admin' || me?.role === 'super_admin') {
          const { data: authorized } = await supabase.rpc('is_authorized', {
            p_user_id: user.id,
            p_target_org_id: orgId,
            p_required_role: 'campus_admin',
          })
          if (authorized === true) {
            const admin = createAdminClient()
            const { data: raw } = await admin
              .from('teacher_contracts')
              .select('id, base_salary, insurance_salary, base_hourly_rate')
              .in(
                'id',
                data.map((row) => row.id)
              )
              .is('deleted_at', null)
            amountById = new Map(
              (raw ?? []).map((row) => [
                row.id as string,
                {
                  base_salary:
                    row.base_salary === null ? null : Number(row.base_salary),
                  insurance_salary:
                    row.insurance_salary === null
                      ? null
                      : Number(row.insurance_salary),
                  base_hourly_rate:
                    row.base_hourly_rate === null
                      ? null
                      : Number(row.base_hourly_rate),
                },
              ])
            )
          }
        }
      }
    }

    const rows: ContractRow[] = data.map((row) => {
      const unlocked = amountById.get(row.id)
      const baseSalary = unlocked
        ? unlocked.base_salary
        : row.base_salary === null
          ? null
          : Number(row.base_salary)
      const insuranceSalary = unlocked
        ? unlocked.insurance_salary
        : row.insurance_salary === null
          ? null
          : Number(row.insurance_salary)
      const hourlyRate = unlocked
        ? unlocked.base_hourly_rate
        : row.base_hourly_rate === null
          ? null
          : Number(row.base_hourly_rate)
      return {
        id: row.id,
        teacher_id: row.teacher_id,
        teacher_name: teacherNameById.get(row.teacher_id) ?? '—',
        org_id: row.org_id,
        org_name: orgNameById.get(row.org_id) ?? '—',
        contract_type: row.contract_type as ContractType,
        base_salary: baseSalary,
        insurance_salary: insuranceSalary,
        base_hourly_rate: hourlyRate,
        required_hours_per_month: row.required_hours_per_month,
        insurance_percentage: Number(row.insurance_percentage),
        tax_percentage: Number(row.tax_percentage),
        start_date: row.start_date,
        end_date: row.end_date,
        probation_end_date:
          (row as { probation_end_date?: string | null }).probation_end_date ?? null,
        is_active: row.is_active,
        financials_masked: unlocked ? false : row.financials_masked === true,
      }
    })
    return { data: rows, demo: false }
  } catch {
    console.error('[QA-FIX C] getContracts exception')
    return { data: [], demo: false }
  }
}

/**
 * Upsert hợp đồng giáo viên: hợp đồng active cũ tại org (nếu có) tự
 * động ngưng hiệu lực rồi ghi bản mới (unique index 1 active/GV/org),
 * nên gọi lặp lại luôn cho ra đúng 1 hợp đồng hiệu lực.
 *
 * LUỒNG BẢO MẬT:
 * 1. Zod validate toàn bộ input TRƯỚC khi chạm Supabase.
 * 2. auth.getUser: phải đăng nhập.
 * 3. rpc is_authorized(user, orgId, 'campus_admin'): người thao tác
 *    phải là Campus Admin trở lên VÀ org đích thuộc cây của họ —
 *    client truyền org_id lạ sẽ bị chặn tại đây.
 */
export async function upsertTeacherContract(formData: FormData): Promise<ActionResult> {
  // ===== QA GATE: mọi input qua Zod trước khi chạm Supabase =====
  const orgParsed = requiredId(
    'Thiếu org_id: vui lòng chọn cấp quản lý ở góc trên bên phải.'
  ).safeParse(String(formData.get('orgId') ?? ''))
  if (!orgParsed.success) return zodFail(orgParsed.error)
  const orgId = orgParsed.data

  const parsed = contractSchema.safeParse({
    teacherId: String(formData.get('teacherId') ?? ''),
    contractType: String(formData.get('contractType') ?? ''),
    baseSalary: Number(formData.get('baseSalary') ?? Number.NaN),
    insuranceSalary: Number(formData.get('insuranceSalary') ?? Number.NaN),
    baseHourlyRate: Number(formData.get('baseHourlyRate') ?? Number.NaN),
    requiredHoursPerMonth: Number(formData.get('requiredHoursPerMonth') ?? Number.NaN),
    insurancePercentage: Number(formData.get('insurancePercentage') ?? Number.NaN),
    taxPercentage: Number(formData.get('taxPercentage') ?? Number.NaN),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    probationEndDate: String(formData.get('probationEndDate') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const values = parsed.data

  try {
    const supabase = createClient()

    // ===== [BẢO MẬT] Đăng nhập + đúng quyền + đúng cây tổ chức =====
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) {
      return { error: 'Bạn chưa đăng nhập. Chức năng này yêu cầu quyền Campus Admin.' }
    }

    // [QA-FIX C] Menu payroll_contracts = campus_admin + accountant
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
        error:
          'TỪ CHỐI: Chỉ Quản lý cơ sở hoặc Kế toán được tạo/sửa hợp đồng giáo viên.',
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
        error:
          'TỪ CHỐI: Cơ sở này không thuộc quyền quản lý của bạn.',
      }
    }

    // Giáo viên phải tồn tại và đúng role teacher
    const { data: teacher } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', values.teacherId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!teacher || teacher.role !== 'teacher') {
      return { error: 'Giáo viên không tồn tại hoặc hồ sơ không phải role teacher.' }
    }

    // Ngưng hiệu lực hợp đồng active cũ (mỗi GV chỉ 1 hợp đồng active/org)
    const { error: deactivateError } = await supabase
      .from('teacher_contracts')
      .update({ is_active: false })
      .eq('teacher_id', values.teacherId)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .is('deleted_at', null)
    if (deactivateError) {
      return { error: `Không thể ngưng hợp đồng cũ: ${deactivateError.message}` }
    }

    const { error: insertError } = await supabase.from('teacher_contracts').insert({
      org_id: orgId,
      teacher_id: values.teacherId,
      contract_type: values.contractType,
      base_salary: values.baseSalary,
      insurance_salary: values.insuranceSalary,
      base_hourly_rate: values.baseHourlyRate,
      required_hours_per_month: values.requiredHoursPerMonth,
      insurance_percentage: values.insurancePercentage,
      tax_percentage: values.taxPercentage,
      start_date: values.startDate || null,
      end_date: values.endDate || null,
      probation_end_date: values.probationEndDate || null,
      is_active: true,
    })
    if (insertError) {
      if (/probation_end_date/i.test(insertError.message)) {
        return {
          error:
            'Database chưa có cột ngày hết thử việc. Chạy migration 072_hr_personnel_dossier.sql.',
        }
      }
      return { error: `Không thể tạo hợp đồng: ${insertError.message}` }
    }

    revalidatePath('/hr/contracts')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi lưu hợp đồng.',
    }
  }
}
