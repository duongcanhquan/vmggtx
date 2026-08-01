'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClassSchema, zodFail } from '@/lib/validation/schemas'

export type ClassRow = {
  id: string
  name: string
  teacher_id: string | null
  start_date: string | null
  end_date: string | null
  created_at: string
}

export type ActionResult = { error: string } | { error?: undefined }

/**
 * Lấy danh sách org_id trong subtree (org + toàn bộ con/cháu) qua RPC.
 * "Dữ liệu của ai người nấy quản": cấp trên thấy cấp dưới, ngang hàng không thấy nhau.
 */
async function getOrgSubtreeIds(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ ids: string[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: orgId,
  })
  if (error) {
    return { ids: [], error: `Lỗi truy vấn cây tổ chức: ${error.message}` }
  }
  const ids = (data ?? []) as string[]
  // Phòng hờ: luôn bao gồm chính org đang chọn
  return { ids: ids.includes(orgId) ? ids : [orgId, ...ids] }
}

/** Fetch danh sách lớp của org đang chọn + mọi org con/cháu (Supabase SSR client). */
export async function getClasses(
  orgId: string | null
): Promise<{ data: ClassRow[]; error?: string }> {
  if (!orgId) {
    return { data: [], error: 'Chưa chọn tổ chức (org_id trống).' }
  }

  try {
    const supabase = createClient()
    const subtree = await getOrgSubtreeIds(supabase, orgId)
    if (subtree.error) return { data: [], error: subtree.error }

    const { data, error } = await supabase
      .from('classes')
      .select('id, name, teacher_id, start_date, end_date, created_at')
      .in('org_id', subtree.ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return { data: [], error: `Lỗi tải danh sách lớp: ${error.message}` }
    }
    return { data: (data ?? []) as ClassRow[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { data: [], error: `Không thể kết nối database: ${message}` }
  }
}

/** Danh sách môn học ĐANG KÍCH HOẠT (cho dropdown của form tạo lớp). */
export async function getActiveSubjects(): Promise<{
  data: { id: string; name: string }[]
  error?: string
}> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')

    if (error) return { data: [], error: error.message }
    return { data: data ?? [] }
  } catch {
    return { data: [] }
  }
}

/** Danh sách giáo viên THUỘC subtree của org đang chọn (cho dropdown của form tạo lớp). */
export async function getTeachersInOrg(
  orgId: string | null
): Promise<{ data: { id: string; full_name: string }[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const supabase = createClient()
    const subtree = await getOrgSubtreeIds(supabase, orgId)
    if (subtree.error) return { data: [], error: subtree.error }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'teacher')
      .in('org_id', subtree.ids)
      .is('deleted_at', null)
      .order('full_name')

    if (error) return { data: [], error: error.message }
    return { data: data ?? [] }
  } catch {
    return { data: [] }
  }
}

/**
 * Tạo lớp học mới - KIỂM TRA LOGIC NGHIÊM NGẶT về TÍNH ĐỘC LẬP giữa các org.
 * FormData gồm: orgId (nhúng ngầm từ useOrgStore), name, teacherId, subjectId, startDate, endDate.
 */
export async function createClass(formData: FormData): Promise<ActionResult> {
  // ===== QA GATE: mọi input PHẢI qua Zod trước khi chạm Supabase =====
  const parsed = createClassSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    name: String(formData.get('name') ?? ''),
    subjectId: String(formData.get('subjectId') ?? ''),
    teacherId: String(formData.get('teacherId') ?? ''),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    maxStudents: String(formData.get('maxStudents') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const { orgId, name, teacherId, subjectId, startDate, endDate, maxStudents } =
    parsed.data

  try {
    const supabase = createClient()

    // ===== [SECURITY AUDIT] AUTH + QUYỀN trên org đích =====
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }
    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: orgId,
      p_required_role: 'academic_staff',
    })
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Bạn không có quyền tạo lớp trên cơ sở này.' }
    }

    const subtree = await getOrgSubtreeIds(supabase, orgId)
    if (subtree.error) return { error: subtree.error }
    const allowedOrgIds = new Set(subtree.ids)

    // ===== CHECK 1: Giáo viên phải thuộc org đang chọn hoặc org con/cháu =====
    if (teacherId) {
      const { data: teacher, error: teacherError } = await supabase
        .from('profiles')
        .select('id, org_id, full_name')
        .eq('id', teacherId)
        .is('deleted_at', null)
        .maybeSingle()

      if (teacherError) {
        return { error: `Lỗi kiểm tra giáo viên: ${teacherError.message}` }
      }
      if (!teacher) {
        return { error: 'Không tìm thấy giáo viên với ID này.' }
      }
      if (!teacher.org_id || !allowedOrgIds.has(teacher.org_id)) {
        return {
          error: `Giáo viên "${teacher.full_name}" không thuộc chi nhánh bạn đang quản lý. Không thể gán giáo viên của đơn vị khác.`,
        }
      }
    }

    // ===== CHECK 2: Môn học phải đang ở trạng thái kích hoạt =====
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id, name, is_active')
      .eq('id', subjectId)
      .is('deleted_at', null)
      .maybeSingle()

    if (subjectError) {
      return { error: `Lỗi kiểm tra môn học: ${subjectError.message}` }
    }
    if (!subject) {
      return { error: 'Môn học không tồn tại hoặc đã bị xóa.' }
    }
    if (!subject.is_active) {
      return {
        error: `Môn học "${subject.name}" đã ngừng kích hoạt. Vui lòng chọn môn học khác.`,
      }
    }

    // ===== Mọi check đã qua: INSERT với org_id = currentOrgId =====
    const { error: insertError } = await supabase.from('classes').insert({
      org_id: orgId,
      subject_id: subjectId,
      name,
      teacher_id: teacherId || null,
      start_date: startDate || null,
      end_date: endDate || null,
      max_students: maxStudents ? parseInt(maxStudents, 10) : null,
    })

    if (insertError) {
      return { error: `Lỗi tạo lớp học: ${insertError.message}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    return { error: `Không thể kết nối database: ${message}` }
  }

  // redirect() ném NEXT_REDIRECT nên phải gọi NGOÀI try/catch
  revalidatePath('/classes')
  redirect('/classes')
}
