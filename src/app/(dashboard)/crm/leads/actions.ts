'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  convertLeadSchema,
  leadSchema,
  leadStatusSchema,
  requiredId,
  zodFail,
} from '@/lib/validation/schemas'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { generateStudentCode } from '@/lib/utils/studentCode'

// ============================================================
// CRM Tuyển sinh (/crm/leads)
//
// Nguyên tắc phân quyền: đọc/ghi leads bằng SSR client để RLS
// (migration 014) tự cắt dữ liệu:
//   - admission_staff: chỉ leads mình phụ trách hoặc chưa ai nhận,
//     trong org của mình.
//   - campus_admin/academic_staff: mọi leads trong subtree.
// Riêng chuyển hóa Lead -> Student cần Admin client (tạo auth user),
// nhưng CHỈ sau khi đọc được lead qua RLS (= có quyền trên lead đó).
// ============================================================

export type LeadStatus = 'new' | 'contacted' | 'test_scheduled' | 'enrolled' | 'lost'

export type LeadCard = {
  id: string
  full_name: string
  phone: string
  status: LeadStatus
  notes: string | null
  counselor_id: string | null
  counselor_name: string | null
  interested_subject_id: string | null
  subject_name: string | null
  converted_student_id: string | null
  created_at: string
}

export type Option = { id: string; name: string }

type ActionResult = { error: string } | { error?: undefined }

// ---------- MOCK cho chế độ demo (chưa đăng nhập / DB trống) ----------
const MOCK_LEADS: LeadCard[] = [
  {
    id: 'lead-1',
    full_name: 'Nguyễn Hải Đăng',
    phone: '0912345678',
    status: 'new',
    notes: 'Quan tâm lớp Toán 12, hẹn gọi lại buổi tối.',
    counselor_id: null,
    counselor_name: null,
    interested_subject_id: null,
    subject_name: 'Toán',
    converted_student_id: null,
    created_at: '2026-07-28T09:00:00Z',
  },
  {
    id: 'lead-2',
    full_name: 'Trần Thảo My',
    phone: '0987654321',
    status: 'contacted',
    notes: 'Đã tư vấn học phí, phụ huynh cân nhắc.',
    counselor_id: 'mock-counselor',
    counselor_name: 'Lê Thu Trang',
    interested_subject_id: null,
    subject_name: 'Tiếng Anh',
    converted_student_id: null,
    created_at: '2026-07-25T14:30:00Z',
  },
  {
    id: 'lead-3',
    full_name: 'Phạm Gia Bảo',
    phone: '0901112233',
    status: 'test_scheduled',
    notes: 'Lịch test đầu vào: thứ 7 tuần này.',
    counselor_id: 'mock-counselor',
    counselor_name: 'Lê Thu Trang',
    interested_subject_id: null,
    subject_name: 'Vật lý',
    converted_student_id: null,
    created_at: '2026-07-20T10:00:00Z',
  },
  {
    id: 'lead-4',
    full_name: 'Đỗ Minh Châu',
    phone: '0977888999',
    status: 'enrolled',
    notes: 'Đã nhập học lớp Toán 12A.',
    counselor_id: 'mock-counselor',
    counselor_name: 'Lê Thu Trang',
    interested_subject_id: null,
    subject_name: 'Toán',
    converted_student_id: 'mock-student',
    created_at: '2026-07-10T08:00:00Z',
  },
]

/**
 * Danh sách leads trong phạm vi của user đang đăng nhập.
 * RLS 014 tự cắt: admission_staff chỉ thấy lead của mình / chưa ai nhận.
 */
export async function getLeads(
  orgId: string
): Promise<{ data: LeadCard[]; demo: boolean }> {
  try {
    const supabase = createClient()

    // Lọc theo subtree của org đang chọn (cache 5', RLS vẫn cắt thêm lần 2)
    const orgIds = await getDescendantOrgIds(supabase, orgId)

    const { data, error } = await supabase
      .from('leads')
      .select(
        'id, full_name, phone, status, notes, counselor_id, interested_subject_id, converted_student_id, created_at, subjects(name), profiles!leads_counselor_id_fkey(full_name)'
      )
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    const rows: LeadCard[] = data.map((row) => {
      const subject = row.subjects as { name?: string } | { name?: string }[] | null
      const counselor = row.profiles as { full_name?: string } | { full_name?: string }[] | null
      return {
        id: row.id,
        full_name: row.full_name,
        phone: row.phone,
        status: row.status as LeadStatus,
        notes: row.notes,
        counselor_id: row.counselor_id,
        counselor_name: Array.isArray(counselor)
          ? counselor[0]?.full_name ?? null
          : counselor?.full_name ?? null,
        interested_subject_id: row.interested_subject_id,
        subject_name: Array.isArray(subject)
          ? subject[0]?.name ?? null
          : subject?.name ?? null,
        converted_student_id: row.converted_student_id,
        created_at: row.created_at,
      }
    })
    return { data: rows, demo: false }
  } catch {
    return { data: MOCK_LEADS, demo: true }
  }
}

/** Môn học + Lớp học + Người tuyển sinh (lọc/gán người phụ trách) */
export async function getCrmOptions(orgId: string): Promise<{
  subjects: Option[]
  classes: Option[]
  counselors: Option[]
}> {
  try {
    const supabase = createClient()
    const scopeOrgIds = await getDescendantOrgIds(supabase, orgId)

    const [subjectResult, classResult, counselorResult] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, name')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('classes')
        .select('id, name')
        .in('org_id', scopeOrgIds)
        .is('deleted_at', null)
        .order('name'),
      // Người có thể phụ trách lead: tuyển sinh + giáo vụ + QL cơ sở
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('org_id', scopeOrgIds)
        .in('role', ['admission_staff', 'academic_staff', 'campus_admin'])
        .is('deleted_at', null)
        .order('full_name'),
    ])

    return {
      subjects: (subjectResult.data ?? []) as Option[],
      classes: (classResult.data ?? []) as Option[],
      counselors: (counselorResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.full_name as string,
      })),
    }
  } catch {
    return {
      subjects: [
        { id: 'sub-1', name: 'Toán' },
        { id: 'sub-2', name: 'Tiếng Anh' },
      ],
      classes: [
        { id: 'cls-1', name: 'Toán 12A (demo)' },
        { id: 'cls-2', name: 'Anh văn giao tiếp (demo)' },
      ],
      counselors: [{ id: 'mock-counselor', name: 'Lê Thu Trang (demo)' }],
    }
  }
}

/**
 * Gán / đổi người tuyển sinh phụ trách lead.
 * RLS 014 kiểm soát: admission_staff chỉ trên lead của mình,
 * campus_admin/academic_staff trên mọi lead trong subtree.
 */
export async function assignLeadCounselor(
  leadId: string,
  counselorId: string | null
): Promise<ActionResult> {
  const idParsed = requiredId('Thiếu lead id.').safeParse(leadId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const { error, count } = await supabase
      .from('leads')
      .update({ counselor_id: counselorId || null }, { count: 'exact' })
      .eq('id', idParsed.data)
      .is('deleted_at', null)
    if (error) return { error: `Không thể gán người phụ trách: ${error.message}` }
    if (count === 0) {
      return { error: 'Lead không tồn tại hoặc bạn không có quyền trên lead này.' }
    }

    revalidatePath('/crm/leads')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi gán người phụ trách.',
    }
  }
}

/**
 * Tạo Lead mới. Insert bằng SSR client -> RLS with check tự chặn
 * nếu org không thuộc phạm vi. admission_staff tự động là người phụ trách.
 */
export async function createLead(formData: FormData): Promise<ActionResult> {
  const orgParsed = requiredId(
    'Thiếu org_id: vui lòng chọn cấp quản lý ở góc trên bên phải.'
  ).safeParse(String(formData.get('orgId') ?? ''))
  if (!orgParsed.success) return zodFail(orgParsed.error)
  const orgId = orgParsed.data

  const parsed = leadSchema.safeParse({
    fullName: String(formData.get('fullName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    interestedSubjectId: String(formData.get('interestedSubjectId') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    // admission_staff: lead mới mặc định do CHÍNH MÌNH phụ trách
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .maybeSingle()
    const counselorId = profile?.role === 'admission_staff' ? currentUser.id : null

    const { error } = await supabase.from('leads').insert({
      org_id: orgId,
      full_name: values.fullName,
      phone: values.phone,
      interested_subject_id: values.interestedSubjectId || null,
      notes: values.notes || null,
      status: 'new',
      counselor_id: counselorId,
    })
    if (error) return { error: `Không thể tạo lead: ${error.message}` }

    revalidatePath('/crm/leads')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi tạo lead.',
    }
  }
}

/**
 * Đổi trạng thái Lead khi kéo thả trên Kanban.
 * KHÔNG dùng cho 'enrolled' - trạng thái đó phải đi qua convertLeadToStudent.
 */
export async function updateLeadStatus(
  leadId: string,
  status: string
): Promise<ActionResult> {
  const parsed = leadStatusSchema.safeParse({ leadId, status })
  if (!parsed.success) return zodFail(parsed.error)

  if (parsed.data.status === 'enrolled') {
    return {
      error:
        'Chuyển sang "Đã nhập học" phải qua bước chuyển hóa hồ sơ (nhập thông tin học sinh).',
    }
  }

  try {
    const supabase = createClient()

    // [SECURITY AUDIT] Action GHI: bắt buộc đăng nhập (RLS là tầng 2)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Bạn chưa đăng nhập. Vui lòng đăng nhập lại.' }
    }

    const { error, count } = await supabase
      .from('leads')
      .update({ status: parsed.data.status }, { count: 'exact' })
      .eq('id', parsed.data.leadId)
      .is('deleted_at', null)
    if (error) return { error: `Không thể đổi trạng thái: ${error.message}` }
    if (count === 0) {
      return { error: 'Lead không tồn tại hoặc bạn không có quyền trên lead này.' }
    }

    revalidatePath('/crm/leads')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi đổi trạng thái.',
    }
  }
}

/**
 * Chuyển hóa Lead -> Student chính thức (khi kéo lead vào cột Enrolled):
 *   1. Đọc lead bằng SSR client - đọc được nghĩa là RLS cho phép
 *      (đây là cửa phân quyền, vì các bước sau dùng Admin client).
 *   2. Tạo auth user + profile role 'student' (org theo org của LEAD).
 *   3. Ghi danh vào lớp (enrollments).
 *   4. Tạo hóa đơn học phí đầu tiên (invoices, status pending).
 *   5. Cập nhật lead: status='enrolled' + converted_student_id.
 */
export async function convertLeadToStudent(formData: FormData): Promise<ActionResult> {
  const parsed = convertLeadSchema.safeParse({
    leadId: String(formData.get('leadId') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    classId: String(formData.get('classId') ?? ''),
    tuitionAmount: Number(formData.get('tuitionAmount') ?? Number.NaN),
    dueDate: String(formData.get('dueDate') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    // ===== [BẢO MẬT] Đọc lead qua RLS: không thấy = không có quyền =====
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, org_id, full_name, phone, status, converted_student_id')
      .eq('id', values.leadId)
      .is('deleted_at', null)
      .maybeSingle()
    if (leadError) return { error: `Lỗi đọc lead: ${leadError.message}` }
    if (!lead) {
      return { error: 'Lead không tồn tại hoặc bạn không có quyền trên lead này.' }
    }
    if (lead.converted_student_id) {
      return { error: 'Lead này đã được chuyển hóa thành học sinh trước đó.' }
    }

    // Lớp ghi danh phải tồn tại (org của enrollment lấy theo lớp)
    const { data: targetClass } = await supabase
      .from('classes')
      .select('id, org_id, name')
      .eq('id', values.classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!targetClass) {
      return { error: 'Lớp học không tồn tại hoặc không thuộc phạm vi của bạn.' }
    }

    // ===== Tạo tài khoản học sinh (Service Role) =====
    const admin = createAdminClient()

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: values.email,
      password: values.password,
      email_confirm: true,
      user_metadata: { full_name: lead.full_name },
    })
    if (createError || !created.user) {
      return { error: `Lỗi tạo tài khoản Auth: ${createError?.message ?? 'không xác định'}` }
    }
    const studentId = created.user.id

    // Mã học viên theo quy tắc của cơ sở (null nếu chưa chạy migration 028)
    const studentCode = await generateStudentCode(admin, lead.org_id)
    const newProfile: Record<string, unknown> = {
      id: studentId,
      full_name: lead.full_name,
      email: values.email,
      phone: lead.phone,
      role: 'student',
      org_id: lead.org_id,
    }
    const newProfileWithCode = studentCode
      ? { ...newProfile, student_code: studentCode }
      : newProfile
    let { error: profileError } = await admin.from('profiles').insert(newProfileWithCode)
    if (profileError && /student_code/i.test(profileError.message)) {
      const retry = await admin.from('profiles').insert(newProfile)
      profileError = retry.error
    }
    if (profileError) {
      // Rollback: không để tài khoản auth mồ côi
      await admin.auth.admin.deleteUser(studentId)
      return { error: `Lỗi tạo hồ sơ học sinh: ${profileError.message}` }
    }

    // ===== Ghi danh vào lớp =====
    const { error: enrollError } = await admin.from('enrollments').insert({
      org_id: targetClass.org_id,
      class_id: targetClass.id,
      student_id: studentId,
      status: 'active',
    })
    if (enrollError) {
      await admin.from('profiles').delete().eq('id', studentId)
      await admin.auth.admin.deleteUser(studentId)
      return { error: `Lỗi ghi danh vào lớp: ${enrollError.message}` }
    }

    // ===== Hóa đơn học phí đầu tiên =====
    const { error: invoiceError } = await admin.from('invoices').insert({
      org_id: lead.org_id,
      student_id: studentId,
      amount: values.tuitionAmount,
      status: 'pending',
      due_date: values.dueDate || null,
      note: `Học phí nhập học - lớp ${targetClass.name} (chuyển hóa từ CRM)`,
    })
    if (invoiceError) {
      return {
        error: `Học sinh đã tạo & ghi danh nhưng KHÔNG tạo được hóa đơn: ${invoiceError.message}. Vui lòng tạo hóa đơn thủ công.`,
      }
    }

    // ===== Chốt lead: enrolled + link sang học sinh =====
    const { error: leadUpdateError } = await admin
      .from('leads')
      .update({ status: 'enrolled', converted_student_id: studentId })
      .eq('id', lead.id)
    if (leadUpdateError) {
      return {
        error: `Đã chuyển hóa xong nhưng không cập nhật được trạng thái lead: ${leadUpdateError.message}`,
      }
    }

    revalidatePath('/crm/leads')
    revalidatePath('/finance/invoices')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi chuyển hóa lead.',
    }
  }
}
