'use server'

import { createClient } from '@/lib/supabase/server'

/** Đơn giá mock: 200.000 VND / buổi dạy */
const RATE_PER_SESSION = 200_000

export type PayrollRow = {
  teacherId: string
  teacherName: string
  totalSessions: number
  totalAmount: number
}

export type PayrollResult = { data: PayrollRow[]; error?: string }

type SessionRow = {
  id: string
  teacher_id: string | null
}

/**
 * Tính lương giáo viên theo tháng cho một cơ sở (bản mock v1 -
 * engine chính thức nằm ở src/lib/services/payrollService.ts).
 * - campusId: bắt buộc (multi-tenant) - lọc trực tiếp bằng cột org_id
 *   trên class_sessions (schema đa tầng 001, cột campus_id đã bỏ),
 *   roll-up cả chi nhánh con qua get_descendant_org_ids.
 * - month: dạng 'YYYY-MM' (VD: '2026-07').
 * - Logic mock: mỗi buổi dạy = 200.000 VND, group theo teacher_id.
 */
export async function calculatePayroll(
  campusId: string | null,
  month: string
): Promise<PayrollResult> {
  if (!campusId) {
    return { data: [], error: 'Chưa chọn cơ sở (campus_id trống).' }
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { data: [], error: 'Tháng không hợp lệ (định dạng YYYY-MM).' }
  }

  // Khoảng thời gian của tháng: [đầu tháng, đầu tháng sau)
  const monthStart = `${month}-01T00:00:00+07:00`
  const [year, monthNum] = month.split('-').map(Number)
  const next = monthNum === 12 ? `${year + 1}-01` : `${year}-${String(monthNum + 1).padStart(2, '0')}`
  const monthEnd = `${next}-01T00:00:00+07:00`

  try {
    const supabase = createClient()

    // ===== [SECURITY AUDIT] AUTH + QUYỀN: dữ liệu lương là nhạy cảm =====
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { data: [], error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }
    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: campusId,
      p_required_role: 'campus_admin',
    })
    if (authorized !== true) {
      return { data: [], error: 'TỪ CHỐI: Bạn không có quyền xem bảng lương cơ sở này.' }
    }

    // Scope đa tầng: org đang chọn + toàn bộ chi nhánh con
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: campusId,
    })
    const orgIds: string[] = (subtree as string[] | null) ?? [campusId]

    // Buổi học trong tháng, thuộc org trong scope, chưa xóa mềm
    const { data: sessions, error: sessionError } = await supabase
      .from('class_sessions')
      .select('id, teacher_id')
      .in('org_id', orgIds.length > 0 ? orgIds : [campusId])
      .is('deleted_at', null)
      .gte('start_time', monthStart)
      .lt('start_time', monthEnd)

    if (sessionError) {
      return { data: [], error: `Lỗi tải buổi học: ${sessionError.message}` }
    }

    // Group by teacher_id (bỏ qua buổi chưa phân công giáo viên)
    const sessionCountByTeacher = new Map<string, number>()
    for (const session of (sessions ?? []) as SessionRow[]) {
      if (!session.teacher_id) continue
      sessionCountByTeacher.set(
        session.teacher_id,
        (sessionCountByTeacher.get(session.teacher_id) ?? 0) + 1
      )
    }

    const teacherIds = [...sessionCountByTeacher.keys()]
    if (teacherIds.length === 0) {
      return { data: [] }
    }

    // JOIN profiles để lấy tên giáo viên
    const { data: teachers, error: teacherError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds)
      .is('deleted_at', null)

    if (teacherError) {
      return { data: [], error: `Lỗi tải danh sách giáo viên: ${teacherError.message}` }
    }

    const nameById = new Map(
      (teachers ?? []).map((t: { id: string; full_name: string }) => [t.id, t.full_name])
    )

    const rows: PayrollRow[] = teacherIds
      .map((teacherId) => {
        const totalSessions = sessionCountByTeacher.get(teacherId) ?? 0
        return {
          teacherId,
          teacherName: nameById.get(teacherId) ?? '(Không rõ tên)',
          totalSessions,
          totalAmount: totalSessions * RATE_PER_SESSION,
        }
      })
      .sort((a, b) => b.totalAmount - a.totalAmount)

    return { data: rows }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { data: [], error: `Không thể kết nối database: ${message}` }
  }
}
