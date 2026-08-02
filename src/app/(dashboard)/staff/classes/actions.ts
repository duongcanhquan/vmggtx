'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import {
  requiredId,
  scheduleSessionSchema,
  staffClassSchema,
  zodFail,
} from '@/lib/validation/schemas'

// ============================================================
// Giao diện Vận hành - Giáo vụ (academic_staff)
//
// NGUYÊN TẮC BẢO MẬT CỐT LÕI: org_id KHÔNG BAO GIỜ nhận từ client.
// Mọi mutation đều lấy org_id từ profile của CHÍNH user đang đăng
// nhập (server-side). Staff không thể xếp lớp cho chi nhánh khác
// dù có sửa payload, vì client không có chỗ nào để truyền org_id.
// ============================================================

export type StaffContext = {
  userId: string | null
  orgId: string | null
  orgName: string
  fullName: string
  demo: boolean
}

export type StaffClassRow = {
  id: string
  name: string
  teacher_id: string | null
  teacher_name: string
  start_date: string | null
  end_date: string | null
  session_count: number
  /** Sĩ số tối đa - null = không giới hạn */
  max_students: number | null
}

export type StaffActionResult = { error: string } | { error?: undefined }

/**
 * Ngữ cảnh của Staff đang đăng nhập: org_id + tên chi nhánh.
 * Đây chính là giá trị bị KHÓA CỨNG trên form tạo lớp.
 */
export async function getStaffContext(): Promise<StaffContext> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        userId: null,
        orgId: null,
        orgName: '—',
        fullName: '—',
        demo: false,
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, full_name, organizations(name)')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!profile?.org_id) {
      return {
        userId: user.id,
        orgId: null,
        orgName: '—',
        fullName: profile?.full_name || '—',
        demo: false,
      }
    }

    const org = profile.organizations as { name: string } | { name: string }[] | null
    return {
      userId: user.id,
      orgId: profile.org_id,
      orgName: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
      fullName: profile.full_name,
      demo: false,
    }
  } catch {
    return {
      userId: null,
      orgId: null,
      orgName: '—',
      fullName: '—',
      demo: false,
    }
  }
}

/** Danh sách lớp CHỈ CỦA chi nhánh Staff trực thuộc (không gồm chi nhánh khác). */
export async function getStaffClasses(): Promise<{
  data: StaffClassRow[]
  demo: boolean
  loadError?: string | null
}> {
  try {
    const context = await getStaffContext()
    if (!context.orgId) {
      return { data: [], demo: false, loadError: 'Chưa đăng nhập hoặc thiếu org.' }
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('classes')
      .select(
        'id, name, teacher_id, start_date, end_date, max_students, profiles(full_name), class_sessions(count)'
      )
      .eq('org_id', context.orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error || !data) {
      return { data: [], demo: false, loadError: error?.message || 'Không tải được danh sách lớp.' }
    }

    const rows: StaffClassRow[] = data.map((row) => {
      const teacher = row.profiles as { full_name: string } | { full_name: string }[] | null
      const sessions = row.class_sessions as { count: number }[] | null
      return {
        id: row.id,
        name: row.name,
        teacher_id: row.teacher_id,
        teacher_name: Array.isArray(teacher)
          ? teacher[0]?.full_name ?? 'Chưa gán'
          : teacher?.full_name ?? 'Chưa gán',
        start_date: row.start_date,
        end_date: row.end_date,
        session_count: sessions?.[0]?.count ?? 0,
        max_students: row.max_students ?? null,
      }
    })
    return { data: rows, demo: false }
  } catch (e) {
    return {
      data: [],
      demo: false,
      loadError: e instanceof Error ? e.message : 'Lỗi tải danh sách lớp.',
    }
  }
}

/**
 * Xác thực + lấy org_id server-side. Trả về lỗi nếu chưa đăng nhập
 * hoặc không đủ quyền academic_staff trên chính org của mình.
 */
async function requireStaffScope(): Promise<
  { orgId: string; userId: string } | { error: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      error:
        'Bạn chưa đăng nhập. Chức năng này yêu cầu tài khoản Giáo vụ (academic_staff).',
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!profile?.org_id) {
    return { error: 'Tài khoản của bạn chưa được gán vào chi nhánh nào.' }
  }

  // Double-check theo Ma trận RBAC: phải có cấp bậc >= academic_staff
  // trên chính org của mình
  const { data: authorized } = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: profile.org_id,
    p_required_role: 'academic_staff',
    p_menu_key: 'staff_ops',
  })

  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Tài khoản của bạn không có quyền Giáo vụ.' }
  }

  return { orgId: profile.org_id, userId: user.id }
}

/** Kiểm tra lớp thuộc đúng chi nhánh của Staff (chặn thao tác chéo chi nhánh). */
async function assertClassInMyOrg(
  classId: string,
  myOrgId: string
): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: cls, error } = await supabase
    .from('classes')
    .select('id, org_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return { error: `Lỗi kiểm tra lớp học: ${error.message}` }
  if (!cls) return { error: 'Lớp học không tồn tại hoặc đã bị xóa.' }
  if (cls.org_id !== myOrgId) {
    return { error: 'TỪ CHỐI: Lớp học này thuộc chi nhánh khác, bạn không có quyền thao tác.' }
  }
  return {}
}

/**
 * Tạo lớp mới - org_id lấy từ profile của Staff, KHÔNG đọc từ FormData.
 */
export async function createClassAsStaff(
  formData: FormData
): Promise<StaffActionResult> {
  // ===== QA GATE: validate bằng Zod trước khi chạm Supabase =====
  const parsed = staffClassSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    teacherId: String(formData.get('teacherId') ?? ''),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    maxStudents: String(formData.get('maxStudents') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const { name, teacherId, startDate, endDate, maxStudents } = parsed.data

  try {
    const scope = await requireStaffScope()
    if ('error' in scope) return scope

    const supabase = createClient()
    const { error } = await supabase.from('classes').insert({
      org_id: scope.orgId, // KHÓA CỨNG: luôn là chi nhánh của Staff
      name,
      teacher_id: teacherId || null,
      start_date: startDate || null,
      end_date: endDate || null,
      max_students: maxStudents ? parseInt(maxStudents, 10) : null,
    })

    if (error) return { error: `Lỗi tạo lớp: ${error.message}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }

  revalidatePath('/staff/classes')
  return {}
}

/** Sửa lớp - chỉ khi lớp thuộc chi nhánh của Staff. */
export async function updateClassAsStaff(
  formData: FormData
): Promise<StaffActionResult> {
  // ===== QA GATE: validate bằng Zod trước khi chạm Supabase =====
  const idParsed = requiredId('Thiếu ID lớp học.').safeParse(
    String(formData.get('classId') ?? '')
  )
  if (!idParsed.success) return zodFail(idParsed.error)
  const classId = idParsed.data

  const parsed = staffClassSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    teacherId: String(formData.get('teacherId') ?? ''),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    maxStudents: String(formData.get('maxStudents') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const { name, teacherId, startDate, endDate, maxStudents } = parsed.data

  try {
    const scope = await requireStaffScope()
    if ('error' in scope) return scope

    const ownership = await assertClassInMyOrg(classId, scope.orgId)
    if (ownership.error) return { error: ownership.error }

    const supabase = createClient()
    const { error } = await supabase
      .from('classes')
      .update({
        name,
        teacher_id: teacherId || null,
        start_date: startDate || null,
        end_date: endDate || null,
        max_students: maxStudents ? parseInt(maxStudents, 10) : null,
      })
      .eq('id', classId)

    if (error) return { error: `Lỗi cập nhật lớp: ${error.message}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }

  revalidatePath('/staff/classes')
  return {}
}

/** Xóa lớp - SOFT DELETE (set deleted_at) theo .cursorrules. */
export async function deleteClassAsStaff(
  classId: string
): Promise<StaffActionResult> {
  if (!classId) return { error: 'Thiếu ID lớp học.' }

  try {
    const scope = await requireStaffScope()
    if ('error' in scope) return scope

    const ownership = await assertClassInMyOrg(classId, scope.orgId)
    if (ownership.error) return { error: ownership.error }

    const supabase = createClient()
    const { error } = await supabase
      .from('classes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', classId)

    if (error) return { error: `Lỗi xóa lớp: ${error.message}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }

  revalidatePath('/staff/classes')
  return {}
}

/**
 * Xếp Thời khóa biểu: thêm buổi học cho lớp thuộc chi nhánh của Staff.
 * Gọi RPC check_schedule_conflict để chống trùng lịch giáo viên/phòng.
 */
export async function scheduleSession(
  formData: FormData
): Promise<StaffActionResult> {
  // ===== QA GATE: validate bằng Zod trước khi chạm Supabase =====
  const parsed = scheduleSessionSchema.safeParse({
    classId: String(formData.get('classId') ?? ''),
    teacherId: String(formData.get('teacherId') ?? ''),
    room: String(formData.get('room') ?? ''),
    date: String(formData.get('date') ?? ''),
    startTime: String(formData.get('startTime') ?? ''),
    endTime: String(formData.get('endTime') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const { classId, teacherId, room, date, startTime, endTime } = parsed.data

  const startISO = new Date(`${date}T${startTime}:00`).toISOString()
  const endISO = new Date(`${date}T${endTime}:00`).toISOString()

  try {
    const scope = await requireStaffScope()
    if ('error' in scope) return scope

    const ownership = await assertClassInMyOrg(classId, scope.orgId)
    if (ownership.error) return { error: ownership.error }

    const supabase = createClient()

    // Chống trùng lịch: giáo viên hoặc phòng đã có buổi giao thời gian
    if (teacherId || room) {
      const { data: hasConflict } = await supabase.rpc('check_schedule_conflict', {
        p_teacher_id: teacherId || null,
        p_room: room || null,
        p_start_time: startISO,
        p_end_time: endISO,
      })
      if (hasConflict === true) {
        return {
          error:
            'TRÙNG LỊCH: Giáo viên hoặc phòng học đã có buổi khác giao với khung giờ này.',
        }
      }
    }

    const { error } = await supabase.from('class_sessions').insert({
      org_id: scope.orgId, // KHÓA CỨNG theo chi nhánh của Staff
      class_id: classId,
      teacher_id: teacherId || null,
      room: room || null,
      start_time: startISO,
      end_time: endISO,
    })

    if (error) return { error: `Lỗi xếp lịch: ${error.message}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }

  revalidatePath('/staff/classes')
  return {}
}
