'use server'

import { createClient } from '@/lib/supabase/server'
import { payrollRunSchema, zodFail } from '@/lib/validation/schemas'
import {
  calculateTeacherPayrollBatch,
  type PayrollContractType,
} from '@/lib/services/payrollService'

// ============================================================
// DỰ BÁO NGÂN SÁCH LƯƠNG (/admin/budget) - Campus Admin
//
// forecastPayroll(orgId, month, year):
//   TÁI DÙNG engine calculateTeacherPayrollBatch nhưng đếm các buổi
//   ĐÃ XẾP LỊCH (class_sessions.status = 'scheduled') của tháng đích
//   thay vì buổi đã hoàn thành -> giả lập chi phí lương TƯƠNG LAI:
//     - Tổng quỹ lương dự kiến (gross = lương cứng + tiền tiết dạy)
//     - Phân bổ: lương cứng (full_time) / thỉnh giảng-khoán giờ /
//       tăng giờ vượt định mức của biên chế
//     - Phân tích theo MÔN HỌC và theo GIÁO VIÊN (Recharts)
//
// [BẢO MẬT] is_authorized(campus_admin, orgId); engine đọc hợp đồng
// qua secure view -> user thiếu can_view_financials bị chặn số tiền.
// ============================================================

export type ForecastTeacherRow = {
  teacherId: string
  teacherName: string
  contractType: PayrollContractType | null
  /** Số buổi đã xếp lịch trong tháng đích */
  scheduledSessions: number
  /** Lương cứng dự kiến (full_time) */
  fixedPay: number
  /** Tiền tiết dạy dự kiến */
  teachingPay: number
  /** Tổng chi phí gross dự kiến */
  grossPay: number
  note: string
}

export type ForecastSubjectRow = {
  subject: string
  sessions: number
  /** Chi phí tiết dạy quy đổi (số buổi x đơn giá tiết của GV phụ trách) */
  teachingCost: number
}

export type ForecastChartTeacherRow = {
  name: string
  'Lương cứng': number
  'Tiền tiết dạy': number
}

export type PayrollForecast = {
  month: number
  year: number
  /** Tổng quỹ lương gross dự kiến */
  totalFund: number
  /** Phân bổ lương cứng (biên chế) */
  fixedFund: number
  /** Phân bổ thỉnh giảng / khoán giờ */
  visitingFund: number
  /** Tăng giờ vượt định mức của biên chế */
  overtimeFund: number
  totalScheduledSessions: number
  teacherCount: number
  /** Giáo viên có lịch dạy nhưng CHƯA có hợp đồng hiệu lực */
  teachersWithoutContract: string[]
  bySubject: ForecastSubjectRow[]
  byTeacherChart: ForecastChartTeacherRow[]
  teachers: ForecastTeacherRow[]
}

export type ForecastResult = { error: string } | ({ error?: undefined } & PayrollForecast)

const PER_HOUR_TYPES: PayrollContractType[] = ['visiting', 'hourly']

const pick = (value: unknown) => (Array.isArray(value) ? value[0] : value)

export async function forecastPayroll(
  orgId: string,
  month: number,
  year: number
): Promise<ForecastResult> {
  const parsed = payrollRunSchema.safeParse({ orgId, month, year })
  if (!parsed.success) return zodFail(parsed.error)
  ;({ orgId, month, year } = parsed.data)

  try {
    const supabase = createClient()

    // ===== [BẢO MẬT] Campus Admin trên org đích =====
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: orgId,
      p_required_role: 'campus_admin',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Dự báo ngân sách chỉ dành cho Quản lý cơ sở.' }
    }

    // ===== Scope subtree =====
    const { data: orgIdRows, error: orgError } = await supabase.rpc(
      'get_descendant_org_ids',
      { p_org_id: orgId }
    )
    if (orgError) return { error: `Lỗi đọc cây tổ chức: ${orgError.message}` }
    const orgIds = ((orgIdRows ?? []) as ({ id?: string } | string)[]).map((row) =>
      typeof row === 'string' ? row : (row.id as string)
    )
    if (!orgIds.includes(orgId)) orgIds.push(orgId)

    // ===== Buổi ĐÃ XẾP LỊCH của tháng đích (tương lai) =====
    const monthStart = new Date(year, month - 1, 1).toISOString()
    const monthEnd = new Date(year, month, 1).toISOString()

    const { data: sessions, error: sessionsError } = await supabase
      .from('class_sessions')
      .select('id, teacher_id, class_id, classes(name, subjects(name))')
      .in('org_id', orgIds)
      .eq('status', 'scheduled')
      .gte('start_time', monthStart)
      .lt('start_time', monthEnd)
      .is('deleted_at', null)
      .limit(5000)
    if (sessionsError) return { error: `Lỗi đọc lịch dạy: ${sessionsError.message}` }

    const scheduled = (sessions ?? []).filter((s) => s.teacher_id !== null)
    const teacherIds = [...new Set(scheduled.map((s) => s.teacher_id as string))]

    if (teacherIds.length === 0) {
      return {
        month,
        year,
        totalFund: 0,
        fixedFund: 0,
        visitingFund: 0,
        overtimeFund: 0,
        totalScheduledSessions: 0,
        teacherCount: 0,
        teachersWithoutContract: [],
        bySubject: [],
        byTeacherChart: [],
        teachers: [],
      }
    }

    // ===== TÁI DÙNG ENGINE LƯƠNG ở chế độ 'scheduled' + tên GV =====
    const [batch, namesResult] = await Promise.all([
      calculateTeacherPayrollBatch(teacherIds, orgId, month, year, orgIds, {
        sessionStatus: 'scheduled',
      }),
      supabase.from('profiles').select('id, full_name').in('id', teacherIds),
    ])
    const nameById = new Map(
      (namesResult.data ?? []).map((row) => [row.id, (row.full_name as string) ?? 'Giáo viên'])
    )

    // Số buổi xếp lịch theo giáo viên (để hiển thị + chia chi phí theo môn)
    const sessionsByTeacher = new Map<string, number>()
    for (const session of scheduled) {
      const tid = session.teacher_id as string
      sessionsByTeacher.set(tid, (sessionsByTeacher.get(tid) ?? 0) + 1)
    }

    // ===== Tổng hợp theo giáo viên =====
    let totalFund = 0
    let fixedFund = 0
    let visitingFund = 0
    let overtimeFund = 0
    const teachersWithoutContract: string[] = []
    const hourlyRateByTeacher = new Map<string, number>()
    const teachers: ForecastTeacherRow[] = []

    for (const teacherId of teacherIds) {
      const teacherName = nameById.get(teacherId) ?? 'Giáo viên'
      const result = batch.get(teacherId)
      const scheduledSessions = sessionsByTeacher.get(teacherId) ?? 0

      if (!result || result.error !== undefined) {
        teachersWithoutContract.push(teacherName)
        teachers.push({
          teacherId,
          teacherName,
          contractType: null,
          scheduledSessions,
          fixedPay: 0,
          teachingPay: 0,
          grossPay: 0,
          note: result?.error ?? 'Không tính được.',
        })
        continue
      }

      const payroll = result.payroll
      const gross = payroll.regularPay + payroll.teachingPay
      totalFund += gross
      fixedFund += payroll.regularPay
      if (PER_HOUR_TYPES.includes(payroll.contractType)) {
        visitingFund += payroll.teachingPay
      } else {
        overtimeFund += payroll.teachingPay
      }
      hourlyRateByTeacher.set(teacherId, payroll.contractSnapshot.base_hourly_rate)

      teachers.push({
        teacherId,
        teacherName,
        contractType: payroll.contractType,
        scheduledSessions,
        fixedPay: payroll.regularPay,
        teachingPay: payroll.teachingPay,
        grossPay: gross,
        note: '',
      })
    }

    teachers.sort((a, b) => b.grossPay - a.grossPay)

    // ===== Phân tích theo MÔN HỌC =====
    // Chi phí tiết dạy quy đổi mỗi buổi = đơn giá tiết của GV phụ trách
    // (biên chế: chi phí biên của tiết vượt định mức cũng theo đơn giá này)
    const bySubjectMap = new Map<string, ForecastSubjectRow>()
    for (const session of scheduled) {
      const cls = pick(session.classes) as
        | { name?: string; subjects?: unknown }
        | null
      const subjectName =
        ((pick(cls?.subjects) as { name?: string } | null)?.name ??
          cls?.name ??
          'Chưa phân môn') as string
      const rate = hourlyRateByTeacher.get(session.teacher_id as string) ?? 0
      const row =
        bySubjectMap.get(subjectName) ??
        ({ subject: subjectName, sessions: 0, teachingCost: 0 } as ForecastSubjectRow)
      row.sessions += 1
      row.teachingCost += rate
      bySubjectMap.set(subjectName, row)
    }
    const bySubject = [...bySubjectMap.values()].sort(
      (a, b) => b.teachingCost - a.teachingCost
    )

    // ===== Top giáo viên cho biểu đồ =====
    const byTeacherChart: ForecastChartTeacherRow[] = teachers
      .filter((t) => t.grossPay > 0)
      .slice(0, 10)
      .map((t) => ({
        name: t.teacherName,
        'Lương cứng': t.fixedPay,
        'Tiền tiết dạy': t.teachingPay,
      }))

    return {
      month,
      year,
      totalFund,
      fixedFund,
      visitingFund,
      overtimeFund,
      totalScheduledSessions: scheduled.length,
      teacherCount: teacherIds.length,
      teachersWithoutContract,
      bySubject,
      byTeacherChart,
      teachers,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}
