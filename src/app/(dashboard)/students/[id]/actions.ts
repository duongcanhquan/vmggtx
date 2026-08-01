'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { requiredId, zodFail } from '@/lib/validation/schemas'

// ============================================================
// STUDENT 360° - gom TOÀN BỘ hoạt động của 1 học sinh vào 1 action.
//
// [BẢO MẬT - RLS + 403] Trước khi trả bất kỳ dữ liệu nào:
//   1. Lấy org_id của học sinh.
//   2. is_authorized(user, org học sinh, 'academic_staff') - học sinh
//      phải nằm trong CÂY org của người xem, nếu không trả 403.
//   RLS ở tầng DB vẫn là lớp chặn thứ 2 cho từng bảng.
// ============================================================

export type Student360Profile = {
  id: string
  code: string
  fullName: string
  email: string | null
  phone: string | null
  address: string | null
  orgName: string
  status: 'active' | 'paused'
  enrolledAt: string
  /** Tags từ trường động custom_metadata, đã gắn label từ org_custom_fields */
  tags: { label: string; value: string }[]
}

export type Student360Class = {
  id: string
  name: string
  subjectName: string
  teacherName: string
}

export type Student360 = {
  profile: Student360Profile
  classes: Student360Class[]
  /** Điểm TB theo môn - trục của Radar chart */
  radar: { subject: string; score: number }[]
  attendance: { present: number; excused: number; absent: number }
  invoices: {
    id: string
    code: string
    amount: number
    paidAmount: number
    status: string
    dueDate: string | null
    createdAt: string
  }[]
  timeline: {
    date: string
    title: string
    description: string
    type: 'enrollment' | 'class' | 'warning' | 'invoice'
  }[]
  aiChats: { id: string; question: string; className: string; createdAt: string }[]
  /** Học sinh hay hỏi AI về lớp/môn nào nhất */
  aiTopTopics: { topic: string; count: number }[]
}

export type Student360Result = { error: string; status?: number } | { error?: undefined; data: Student360 }

export async function getStudent360(studentId: string): Promise<Student360Result> {
  const idParsed = requiredId('Thiếu ID học sinh.').safeParse(studentId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.', status: 401 }

    // ===== Hồ sơ gốc =====
    const { data: profile } = await supabase
      .from('profiles')
      .select(
        'id, full_name, email, phone, address, org_id, custom_metadata, created_at, deleted_at, organizations(name)'
      )
      .eq('id', idParsed.data)
      .eq('role', 'student')
      .maybeSingle()
    if (!profile) return { error: 'Học sinh không tồn tại.', status: 404 }

    // ===== CHỐT 403: học sinh phải nằm trong cây org của người xem =====
    const { data: authorized, error: authzError } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: profile.org_id,
      p_required_role: 'academic_staff',
    })
    if (authzError) return { error: `Lỗi kiểm tra phân quyền: ${authzError.message}` }
    if (authorized !== true) {
      return {
        error: '403 Unauthorized: Học sinh này không thuộc phạm vi tổ chức của bạn.',
        status: 403,
      }
    }

    // ===== Query song song mọi mảng dữ liệu =====
    const [
      fieldDefsResult,
      enrollmentsResult,
      gradesResult,
      attendanceResult,
      invoicesResult,
      warningsResult,
      chatsResult,
    ] = await Promise.all([
      supabase
        .from('org_custom_fields')
        .select('field_name, field_label, field_type')
        .eq('org_id', profile.org_id)
        .eq('entity_type', 'student')
        .is('deleted_at', null),
      supabase
        .from('enrollments')
        .select('class_id, created_at')
        .eq('student_id', idParsed.data)
        .is('deleted_at', null),
      supabase
        .from('grades')
        .select('score, assessments(class_id, name)')
        .eq('student_id', idParsed.data)
        .is('deleted_at', null),
      supabase
        .from('attendance')
        .select('status')
        .eq('student_id', idParsed.data)
        .is('deleted_at', null),
      supabase
        .from('invoices')
        .select('id, amount, status, due_date, created_at, payments(amount_paid)')
        .eq('student_id', idParsed.data)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('student_warnings')
        .select('warning_type, description, created_at')
        .eq('student_id', idParsed.data)
        .is('deleted_at', null),
      supabase
        .from('student_ai_chats')
        .select('id, question, class_id, created_at')
        .eq('student_id', idParsed.data)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    // ===== Lớp đang học (join thủ công: classes -> subjects + teacher) =====
    const enrollments = enrollmentsResult.data ?? []
    const classIds = [...new Set(enrollments.map((e) => e.class_id))]
    // Gom thêm lớp xuất hiện trong grades/chats để map tên đầy đủ
    for (const grade of gradesResult.data ?? []) {
      const assessment = grade.assessments as { class_id: string } | { class_id: string }[] | null
      const cid = Array.isArray(assessment) ? assessment[0]?.class_id : assessment?.class_id
      if (cid) classIds.push(cid)
    }
    for (const chat of chatsResult.data ?? []) {
      if (chat.class_id) classIds.push(chat.class_id)
    }
    const uniqueClassIds = [...new Set(classIds)]

    const { data: classRows } = uniqueClassIds.length
      ? await supabase
          .from('classes')
          .select('id, name, subject_id, teacher_id')
          .in('id', uniqueClassIds)
      : { data: [] as { id: string; name: string; subject_id: string | null; teacher_id: string | null }[] }

    const subjectIds = [...new Set((classRows ?? []).map((c) => c.subject_id).filter(Boolean))] as string[]
    const teacherIds = [...new Set((classRows ?? []).map((c) => c.teacher_id).filter(Boolean))] as string[]

    const [subjectsResult, teachersResult] = await Promise.all([
      subjectIds.length
        ? supabase.from('subjects').select('id, name').in('id', subjectIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      teacherIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', teacherIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ])
    const subjectById = new Map((subjectsResult.data ?? []).map((s) => [s.id, s.name]))
    const teacherById = new Map((teachersResult.data ?? []).map((t) => [t.id, t.full_name]))
    const classById = new Map(
      (classRows ?? []).map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          subjectName: (c.subject_id && subjectById.get(c.subject_id)) || c.name,
          teacherName: (c.teacher_id && teacherById.get(c.teacher_id)) || '—',
        },
      ])
    )

    const enrolledClassIds = [...new Set(enrollments.map((e) => e.class_id))]
    const classes: Student360Class[] = enrolledClassIds
      .map((cid) => classById.get(cid))
      .filter((c): c is Student360Class => c !== undefined)

    // ===== Radar: điểm TB theo MÔN =====
    const scoresBySubject = new Map<string, number[]>()
    for (const grade of gradesResult.data ?? []) {
      if (grade.score === null || grade.score === undefined) continue
      const assessment = grade.assessments as { class_id: string } | { class_id: string }[] | null
      const cid = Array.isArray(assessment) ? assessment[0]?.class_id : assessment?.class_id
      const subject = (cid && classById.get(cid)?.subjectName) || 'Khác'
      const list = scoresBySubject.get(subject) ?? []
      list.push(Number(grade.score))
      scoresBySubject.set(subject, list)
    }
    const radar = [...scoresBySubject.entries()].map(([subject, scores]) => ({
      subject,
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    }))

    // ===== Điểm danh =====
    const attendance = { present: 0, excused: 0, absent: 0 }
    for (const record of attendanceResult.data ?? []) {
      if (record.status === 'present') attendance.present++
      else if (record.status === 'excused') attendance.excused++
      else if (record.status === 'absent') attendance.absent++
    }

    // ===== Hóa đơn =====
    const invoices = (invoicesResult.data ?? []).map((invoice) => {
      const payments = (invoice.payments as { amount_paid: number }[] | null) ?? []
      return {
        id: invoice.id,
        code: `HD-${invoice.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        amount: Number(invoice.amount),
        paidAmount: payments.reduce((sum, p) => sum + Number(p.amount_paid), 0),
        status: invoice.status as string,
        dueDate: invoice.due_date as string | null,
        createdAt: invoice.created_at as string,
      }
    })

    // ===== Timeline =====
    const timeline: Student360['timeline'] = [
      {
        date: profile.created_at as string,
        title: 'Nhập học vào hệ thống',
        description: `Hồ sơ được tạo tại ${extractOrgName(profile.organizations)}.`,
        type: 'enrollment' as const,
      },
      ...enrollments.map((enrollment) => ({
        date: enrollment.created_at as string,
        title: `Ghi danh lớp ${classById.get(enrollment.class_id)?.name ?? 'không rõ'}`,
        description: `Môn ${classById.get(enrollment.class_id)?.subjectName ?? '—'}`,
        type: 'class' as const,
      })),
      ...(warningsResult.data ?? []).map((warning) => ({
        date: warning.created_at as string,
        title:
          warning.warning_type === 'attendance'
            ? 'Cảnh báo chuyên cần'
            : 'Cảnh báo học lực',
        description: warning.description as string,
        type: 'warning' as const,
      })),
      ...invoices.map((invoice) => ({
        date: invoice.createdAt,
        title: `Phát hành hóa đơn ${invoice.code}`,
        description: `${invoice.amount.toLocaleString('vi-VN')} đ — trạng thái: ${invoice.status}`,
        type: 'invoice' as const,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1))

    // ===== AI chats + chủ đề hay hỏi nhất =====
    const aiChats = (chatsResult.data ?? []).map((chat) => ({
      id: chat.id as string,
      question: chat.question as string,
      className: (chat.class_id && classById.get(chat.class_id)?.subjectName) || 'Chung',
      createdAt: chat.created_at as string,
    }))
    const topicCounts = new Map<string, number>()
    for (const chat of aiChats) {
      topicCounts.set(chat.className, (topicCounts.get(chat.className) ?? 0) + 1)
    }
    const aiTopTopics = [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // ===== Tags từ custom_metadata (gắn label từ định nghĩa trường động) =====
    const metadata = (profile.custom_metadata as Record<string, unknown>) ?? {}
    const labelByField = new Map(
      (fieldDefsResult.data ?? []).map((def) => [def.field_name, def.field_label])
    )
    const tags = Object.entries(metadata)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({
        label: labelByField.get(key) ?? key,
        value:
          typeof value === 'boolean' ? (value ? 'Có' : 'Không') : String(value),
      }))

    return {
      data: {
        profile: {
          id: profile.id,
          code: `HV-${profile.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
          fullName: profile.full_name,
          email: profile.email,
          phone: profile.phone,
          address: profile.address,
          orgName: extractOrgName(profile.organizations),
          status: profile.deleted_at ? 'paused' : 'active',
          enrolledAt: profile.created_at as string,
          tags,
        },
        classes,
        radar,
        attendance,
        invoices,
        timeline,
        aiChats,
        aiTopTopics,
      },
    }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Lỗi không xác định khi tải hồ sơ 360°.',
    }
  }
}

function extractOrgName(org: unknown): string {
  if (Array.isArray(org)) return (org[0] as { name?: string })?.name ?? '—'
  return (org as { name?: string } | null)?.name ?? '—'
}

// ============================================================
// CHUYỂN CƠ SỞ [ORG_MODEL.md G4]
// Học viên LÀ NGƯỜI CỦA ĐƠN VỊ — chuyển cơ sở chỉ là đổi org_id
// sang một Cơ sở/Trung tâm KHÁC TRONG CÙNG CÂY Đơn vị. Không phải
// chuyển trường: lớp, điểm, hóa đơn, lịch sử giữ nguyên.
// Quyền: campus_admin (hoặc super_admin) có cả org hiện tại lẫn
// org đích trong phạm vi quản lý.
// ============================================================

/** Tìm Đơn vị gốc (type='campus') của một org — đi lên tối đa 6 cấp */
async function findUnitRootId(orgId: string): Promise<string | null> {
  const admin = createAdminClient()
  let cursorId: string | null = orgId
  for (let i = 0; i < 6 && cursorId; i++) {
    const { data } = await admin
      .from('organizations')
      .select('id, type, parent_id')
      .eq('id', cursorId)
      .is('deleted_at', null)
      .maybeSingle()
    const org = data as { id: string; type: string; parent_id: string | null } | null
    if (!org) return null
    if (org.type === 'campus') return org.id
    cursorId = org.parent_id ?? null
  }
  return null
}

export type TransferTargetsResult =
  | { error: string }
  | {
      error?: undefined
      currentOrgId: string
      /** Các cơ sở đích hợp lệ (cùng Đơn vị, trong phạm vi người thao tác) */
      targets: { id: string; name: string; type: string }[]
    }

/** Danh sách cơ sở đích hợp lệ để chuyển học viên */
export async function getTransferTargets(studentId: string): Promise<TransferTargetsResult> {
  const idParsed = requiredId('Thiếu ID học sinh.').safeParse(studentId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const admin = createAdminClient()
    const { data: student } = await admin
      .from('profiles')
      .select('id, org_id')
      .eq('id', idParsed.data)
      .eq('role', 'student')
      .is('deleted_at', null)
      .maybeSingle()
    if (!student?.org_id) return { error: 'Học sinh không tồn tại.' }

    // Quyền campus_admin trên org hiện tại của học viên
    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: currentUser.id,
      p_target_org_id: student.org_id,
      p_required_role: 'campus_admin',
    })
    if (authorized !== true) {
      return { error: 'TỪ CHỐI: Chỉ Admin Đơn vị được chuyển cơ sở cho học viên.' }
    }

    // Đích hợp lệ = mọi org trong CÙNG CÂY Đơn vị (trừ org hiện tại)
    const unitRootId = (await findUnitRootId(student.org_id)) ?? student.org_id
    const unitOrgIds = await getDescendantOrgIds(admin, unitRootId)
    const { data: orgs } = await admin
      .from('organizations')
      .select('id, name, type')
      .in('id', unitOrgIds)
      .is('deleted_at', null)
      .order('name')

    return {
      currentOrgId: student.org_id,
      targets: (orgs ?? [])
        .filter((org) => org.id !== student.org_id)
        .map((org) => ({ id: org.id, name: org.name, type: org.type as string })),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Chuyển học viên sang cơ sở khác trong cùng Đơn vị */
export async function transferStudentOrg(
  studentId: string,
  targetOrgId: string
): Promise<{ error?: string }> {
  const idParsed = requiredId('Thiếu ID học sinh.').safeParse(studentId)
  if (!idParsed.success) return zodFail(idParsed.error)
  const orgParsed = requiredId('Thiếu cơ sở đích.').safeParse(targetOrgId)
  if (!orgParsed.success) return zodFail(orgParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Bạn chưa đăng nhập.' }

    const admin = createAdminClient()
    const { data: student } = await admin
      .from('profiles')
      .select('id, org_id, full_name')
      .eq('id', idParsed.data)
      .eq('role', 'student')
      .is('deleted_at', null)
      .maybeSingle()
    if (!student?.org_id) return { error: 'Học sinh không tồn tại.' }
    if (student.org_id === orgParsed.data) {
      return { error: 'Học viên đã ở cơ sở này rồi.' }
    }

    // Quyền campus_admin trên CẢ org hiện tại LẪN org đích
    const [{ data: authSource }, { data: authTarget }] = await Promise.all([
      supabase.rpc('is_authorized', {
        p_user_id: currentUser.id,
        p_target_org_id: student.org_id,
        p_required_role: 'campus_admin',
      }),
      supabase.rpc('is_authorized', {
        p_user_id: currentUser.id,
        p_target_org_id: orgParsed.data,
        p_required_role: 'campus_admin',
      }),
    ])
    if (authSource !== true || authTarget !== true) {
      return { error: 'TỪ CHỐI: Cơ sở nằm ngoài phạm vi quản lý của bạn.' }
    }

    // [ORG_MODEL] Cùng CÂY Đơn vị — không chuyển chéo giữa 2 Trường
    const [sourceUnit, targetUnit] = await Promise.all([
      findUnitRootId(student.org_id),
      findUnitRootId(orgParsed.data),
    ])
    if (sourceUnit !== targetUnit) {
      return {
        error:
          'Chỉ chuyển cơ sở TRONG CÙNG một Đơn vị (Trường). Chuyển sang Đơn vị khác là chuyển trường — cần quy trình riêng.',
      }
    }

    const { error } = await admin
      .from('profiles')
      .update({ org_id: orgParsed.data })
      .eq('id', idParsed.data)
    if (error) return { error: `Không chuyển được cơ sở: ${error.message}` }

    revalidatePath(`/students/${idParsed.data}`)
    revalidatePath('/students')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
