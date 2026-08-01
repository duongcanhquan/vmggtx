'use server'

import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSetting } from '@/lib/utils/settingsResolver'

// ============================================================
// GHI NHẬN HÀNH VI + CẢNH BÁO TÂM LÝ (migration 038)
//
// logBehavior: giáo viên chấm điểm rèn luyện (âm = phạt, dương =
// thưởng) cho nhiều học sinh ngay trên màn điểm danh. SAU MỖI LẦN
// ghi nhận, action tính TỔNG điểm trong THÁNG của từng học sinh;
// rớt dưới ngưỡng (setting behavior_alert_threshold, mặc định -15)
// -> TỰ ĐỘNG tạo ticket "Tư vấn Tâm lý Đặc biệt" gán cho
// academic_staff của cơ sở để hẹn gặp học sinh.
//
// [BẢO MẬT] Quyền ghi = giáo viên CỦA BUỔI hoặc academic_staff của
// org (giống submitAttendance). Ticket cảnh báo tạo bằng admin
// client SAU KHI đã xác thực - giáo viên không có quyền RLS tự gán
// ticket cho người khác.
// ============================================================

const ALERT_CATEGORY_NAME = 'Tư vấn Tâm lý Đặc biệt'

export type BehaviorLogRow = {
  id: string
  studentId: string
  studentName: string
  points: number
  category: string
  description: string | null
  createdAt: string
}

export type BehaviorContext = {
  /** Tổng điểm rèn luyện THÁNG NÀY theo từng học sinh */
  monthTotals: Record<string, number>
  /** Ngưỡng cảnh báo tâm lý đang áp dụng (VD: -15) */
  threshold: number
  /** Các ghi nhận gần nhất của học sinh trong lớp (tháng này) */
  recentLogs: BehaviorLogRow[]
  /** true = database chưa chạy migration 038 */
  migrationMissing: boolean
}

export type LogBehaviorResult =
  | { error: string }
  | {
      error?: undefined
      /** Tổng điểm tháng MỚI của từng học sinh vừa ghi nhận */
      monthTotals: Record<string, number>
      /** Học sinh vừa RỚT DƯỚI NGƯỠNG -> đã tạo ticket tư vấn tâm lý */
      alertedStudents: string[]
    }

/** Mốc đầu THÁNG theo giờ Việt Nam (+7) - server có thể chạy UTC */
function vnMonthStartUtc(): Date {
  const vnOffsetMs = 7 * 3600_000
  const nowVn = new Date(Date.now() + vnOffsetMs)
  return new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), 1) - vnOffsetMs)
}

/** Quyền ghi nhận: giáo viên của buổi HOẶC academic_staff của org */
async function requireSessionWriter(sessionId: string): Promise<
  | { error: string }
  | { error?: undefined; userId: string; orgId: string; classId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }

  const { data: session } = await supabase
    .from('class_sessions')
    .select('org_id, teacher_id, class_id')
    .eq('id', sessionId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!session) return { error: 'Buổi học không tồn tại hoặc đã bị xóa.' }

  if (session.teacher_id !== user.id) {
    const { data: authorized } = await isAuthorizedRpc(supabase, {
      p_user_id: user.id,
      p_target_org_id: session.org_id,
      p_required_role: 'academic_staff',
      p_menu_key: 'attendance',
    })
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền ghi nhận hành vi cho buổi học này.' }
    }
  }
  return { userId: user.id, orgId: session.org_id, classId: session.class_id }
}

/**
 * Tổng điểm rèn luyện tháng + ghi nhận gần đây của học sinh trong lớp.
 */
export async function getBehaviorContext(
  sessionId: string
): Promise<{ error: string } | ({ error?: undefined } & BehaviorContext)> {
  try {
    const auth = await requireSessionWriter(sessionId)
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()

    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('class_id', auth.classId)
      .eq('status', 'active')
      .is('deleted_at', null)
    const studentIds = (enrollments ?? []).map((row) => row.student_id)

    const [thresholdResult, logsResult] = await Promise.all([
      resolveSetting('behavior_alert_threshold', auth.orgId),
      studentIds.length > 0
        ? supabase
            .from('behavior_logs')
            .select(
              'id, student_id, points, category, description, created_at, profiles!behavior_logs_student_id_fkey(full_name)'
            )
            .in('student_id', studentIds)
            .gte('created_at', vnMonthStartUtc().toISOString())
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
    ])

    // Bảng chưa tồn tại = chưa chạy migration 038
    if (logsResult.error !== null) {
      return { monthTotals: {}, threshold: thresholdResult.value, recentLogs: [], migrationMissing: true }
    }

    const monthTotals: Record<string, number> = {}
    const recentLogs: BehaviorLogRow[] = []
    for (const row of logsResult.data ?? []) {
      monthTotals[row.student_id] = (monthTotals[row.student_id] ?? 0) + row.points
      if (recentLogs.length < 15) {
        const profile = row.profiles as { full_name?: string } | { full_name?: string }[] | null
        recentLogs.push({
          id: row.id,
          studentId: row.student_id,
          studentName:
            (Array.isArray(profile) ? profile[0]?.full_name : profile?.full_name) ?? 'Học viên',
          points: row.points,
          category: row.category,
          description: row.description,
          createdAt: row.created_at,
        })
      }
    }

    return {
      monthTotals,
      threshold: thresholdResult.value,
      recentLogs,
      migrationMissing: false,
    }
  } catch {
    return { error: 'Không tải được dữ liệu điểm rèn luyện.' }
  }
}

/**
 * Ghi nhận hành vi cho 1+ học sinh và chạy TRIGGER CẢNH BÁO TÂM LÝ.
 */
export async function logBehavior(input: {
  sessionId: string
  studentIds: string[]
  points: number
  category: string
  description?: string
}): Promise<LogBehaviorResult> {
  try {
    // ===== Validate =====
    const points = Math.trunc(Number(input.points))
    if (!Number.isFinite(points) || points === 0 || points < -100 || points > 100) {
      return { error: 'Điểm phải là số nguyên khác 0, trong khoảng -100 đến 100.' }
    }
    const category = (input.category ?? '').trim().slice(0, 100)
    if (!category) return { error: 'Vui lòng chọn/nhập hạng mục hành vi.' }
    const description = (input.description ?? '').trim().slice(0, 500) || null
    const studentIds = [...new Set(input.studentIds ?? [])]
    if (studentIds.length === 0) return { error: 'Chọn ít nhất một học sinh.' }
    if (studentIds.length > 100) return { error: 'Quá nhiều học sinh trong một lần ghi nhận.' }

    const auth = await requireSessionWriter(input.sessionId)
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()

    // Chỉ nhận học sinh THUỘC LỚP của buổi (chống ghi chéo lớp/cơ sở)
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('student_id')
      .eq('class_id', auth.classId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .in('student_id', studentIds)
    const validIds = new Set((enrollments ?? []).map((row) => row.student_id))
    const targets = studentIds.filter((id) => validIds.has(id))
    if (targets.length === 0) {
      return { error: 'Học sinh được chọn không thuộc lớp của buổi học này.' }
    }

    // ===== Ghi log (admin client SAU khi đã xác thực quyền ở trên) =====
    const admin = createAdminClient()
    const { error: insertError } = await admin.from('behavior_logs').insert(
      targets.map((studentId) => ({
        org_id: auth.orgId,
        student_id: studentId,
        recorded_by: auth.userId,
        points,
        category,
        description,
        session_id: input.sessionId,
      }))
    )
    if (insertError) {
      if (insertError.code === '42P01') {
        return { error: 'Database chưa chạy migration 038_behavioral_tracking.sql.' }
      }
      return { error: `Không lưu được ghi nhận: ${insertError.message}` }
    }

    // ===== TRIGGER CẢNH BÁO TÂM LÝ =====
    const [thresholdResult, sumsResult] = await Promise.all([
      resolveSetting('behavior_alert_threshold', auth.orgId),
      admin
        .from('behavior_logs')
        .select('student_id, points')
        .in('student_id', targets)
        .gte('created_at', vnMonthStartUtc().toISOString())
        .is('deleted_at', null),
    ])
    const threshold = thresholdResult.value

    const monthTotals: Record<string, number> = Object.fromEntries(
      targets.map((id) => [id, 0])
    )
    for (const row of sumsResult.data ?? []) {
      monthTotals[row.student_id] = (monthTotals[row.student_id] ?? 0) + row.points
    }

    const belowThreshold = targets.filter((id) => (monthTotals[id] ?? 0) < threshold)
    const alertedStudents: string[] = []

    if (belowThreshold.length > 0) {
      // 1) Danh mục "Tư vấn Tâm lý Đặc biệt" của org (tự tạo nếu chưa có;
      //    active=false để KHÔNG hiện ở cổng dịch vụ của học sinh)
      let categoryId: string | null = null
      const { data: existingCategory } = await admin
        .from('ticket_categories')
        .select('id')
        .eq('org_id', auth.orgId)
        .eq('name', ALERT_CATEGORY_NAME)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (existingCategory) {
        categoryId = existingCategory.id
      } else {
        const { data: newCategory } = await admin
          .from('ticket_categories')
          .insert({
            org_id: auth.orgId,
            name: ALERT_CATEGORY_NAME,
            description:
              'Ticket hệ thống TỰ SINH khi điểm rèn luyện tháng của học sinh rớt dưới ngưỡng cảnh báo — giáo vụ/tư vấn viên hẹn gặp học sinh.',
            audience: 'all',
            active: false,
            form_schema: [
              { key: 'student_name', label: 'Học sinh', type: 'text', required: true },
              { key: 'month_points', label: 'Điểm rèn luyện tháng', type: 'number', required: true },
              { key: 'summary', label: 'Tóm tắt', type: 'textarea', required: false },
            ],
          })
          .select('id')
          .single()
        categoryId = newCategory?.id ?? null
      }
      if (categoryId === null) {
        return { monthTotals, alertedStudents: [] }
      }

      // 2) Người nhận: một academic_staff của org (tư vấn viên/giáo vụ)
      const { data: counselor } = await admin
        .from('profiles')
        .select('id')
        .eq('org_id', auth.orgId)
        .eq('role', 'academic_staff')
        .is('deleted_at', null)
        .order('full_name')
        .limit(1)
        .maybeSingle()

      // 3) Tên học sinh + chống tạo ticket TRÙNG trong tháng
      const monthKey = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7)
      const [namesResult, openTicketsResult] = await Promise.all([
        admin
          .from('profiles')
          .select('id, full_name')
          .in('id', belowThreshold),
        admin
          .from('tickets')
          .select('id, payload')
          .eq('category_id', categoryId)
          .in('status', ['pending', 'in_progress'])
          .is('deleted_at', null),
      ])
      const nameById = new Map(
        (namesResult.data ?? []).map((row) => [row.id, row.full_name as string])
      )
      const alreadyOpen = new Set(
        (openTicketsResult.data ?? [])
          .map((row) => (row.payload as { student_id?: string } | null)?.student_id)
          .filter(Boolean)
      )

      const newTickets = belowThreshold
        .filter((id) => !alreadyOpen.has(id))
        .map((studentId) => ({
          org_id: auth.orgId,
          category_id: categoryId,
          requester_id: auth.userId, // giáo viên/giáo vụ vừa ghi nhận
          status: 'pending',
          assigned_to: counselor?.id ?? null,
          payload: {
            trigger: 'behavior_alert',
            student_id: studentId,
            student_name: nameById.get(studentId) ?? 'Học viên',
            month: monthKey,
            month_points: monthTotals[studentId] ?? 0,
            threshold,
            summary: `Điểm rèn luyện tháng ${monthKey} là ${monthTotals[studentId] ?? 0} (dưới ngưỡng ${threshold}). Ghi nhận gần nhất: ${category}${description ? ` - ${description}` : ''}. Đề nghị hẹn gặp tư vấn tâm lý.`,
          },
        }))

      if (newTickets.length > 0) {
        const { error: ticketError } = await admin.from('tickets').insert(newTickets)
        if (!ticketError) {
          for (const ticket of newTickets) {
            alertedStudents.push(ticket.payload.student_name)
          }
        }
      }
    }

    return { monthTotals, alertedStudents }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }
}
