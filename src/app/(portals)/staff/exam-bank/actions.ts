'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requiredId, zodFail, type ActionResult } from '@/lib/validation/schemas'

// ============================================================
// NGÂN HÀNG ĐỀ (/staff/exam-bank) - bảng exam_bank (migration 024)
// Staff/Admin trong subtree: thêm/xóa; Giáo viên: chỉ đọc (RLS).
// ============================================================

export type ExamBankItem = {
  id: string
  title: string
  description: string | null
  content: string | null
  gradeLevel: string | null
  durationMinutes: number | null
  subjectName: string
  createdAt: string
}

export type ExamBankData =
  | { error: string }
  | {
      error?: undefined
      items: ExamBankItem[]
      subjects: { id: string; name: string }[]
    }

async function getStaffOrg(): Promise<
  { error: string } | { error?: undefined; userId: string; orgId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile?.org_id) return { error: 'Tài khoản chưa gắn cơ sở.' }

  // [BẢO MẬT] academic_staff trở lên trên org của mình
  const { data: authorized, error } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: profile.org_id,
    p_required_role: 'academic_staff',
  })
  if (error) return { error: `Lỗi kiểm tra phân quyền: ${error.message}` }
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Chỉ Giáo vụ/Khảo thí trở lên được quản lý ngân hàng đề.' }
  }
  return { userId: user.id, orgId: profile.org_id }
}

export async function getExamBank(): Promise<ExamBankData> {
  try {
    const scope = await getStaffOrg()
    if (scope.error !== undefined) return { error: scope.error }

    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: scope.orgId,
    })
    const orgIds = ((subtree as string[] | null) ?? [scope.orgId]).slice()
    if (!orgIds.includes(scope.orgId)) orgIds.push(scope.orgId)

    const [itemsRes, subjectsRes] = await Promise.all([
      // [ĐA TẦNG] lọc org_id tường minh; RLS chặn thêm ở tầng DB
      supabase
        .from('exam_bank')
        .select('id, title, description, content, grade_level, duration_minutes, created_at, subjects(name)')
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      // Môn dùng chung (org_id null) + môn riêng của subtree
      supabase
        .from('subjects')
        .select('id, name, org_id')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name'),
    ])

    if (itemsRes.error) {
      return { error: `Không tải được ngân hàng đề: ${itemsRes.error.message}` }
    }

    const rows = (itemsRes.data ?? []) as unknown as {
      id: string
      title: string
      description: string | null
      content: string | null
      grade_level: string | null
      duration_minutes: number | null
      created_at: string
      subjects: { name: string } | null
    }[]

    const subjects = ((subjectsRes.data ?? []) as { id: string; name: string; org_id: string | null }[])
      .filter((subject) => subject.org_id === null || orgIds.includes(subject.org_id))
      .map((subject) => ({ id: subject.id, name: subject.name }))

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        content: row.content,
        gradeLevel: row.grade_level,
        durationMinutes: row.duration_minutes,
        subjectName: row.subjects?.name ?? 'Chưa gắn môn',
        createdAt: row.created_at,
      })),
      subjects,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

const createExamSchema = z.object({
  title: z
    .string({ required_error: 'Vui lòng nhập tiêu đề đề thi.' })
    .trim()
    .min(3, 'Tiêu đề tối thiểu 3 ký tự.')
    .max(200, 'Tiêu đề tối đa 200 ký tự.')
    .regex(/^[^<>{};]*$/, 'Tiêu đề chứa ký tự không hợp lệ.'),
  subjectId: z.string().uuid('Môn học không hợp lệ.').optional().or(z.literal('')),
  description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự.').optional(),
  content: z.string().trim().max(20000, 'Nội dung tối đa 20.000 ký tự.').optional(),
  gradeLevel: z.string().trim().max(60, 'Khối/cấp độ tối đa 60 ký tự.').optional(),
  durationMinutes: z.coerce
    .number()
    .int('Thời lượng phải là số nguyên (phút).')
    .min(5, 'Thời lượng tối thiểu 5 phút.')
    .max(600, 'Thời lượng tối đa 600 phút.')
    .optional(),
})

export async function createExamBankItem(formData: FormData): Promise<ActionResult> {
  const rawDuration = String(formData.get('durationMinutes') ?? '').trim()
  const parsed = createExamSchema.safeParse({
    title: String(formData.get('title') ?? ''),
    subjectId: String(formData.get('subjectId') ?? ''),
    description: String(formData.get('description') ?? ''),
    content: String(formData.get('content') ?? ''),
    gradeLevel: String(formData.get('gradeLevel') ?? ''),
    durationMinutes: rawDuration === '' ? undefined : rawDuration,
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const scope = await getStaffOrg()
    if (scope.error !== undefined) return { error: scope.error }

    const supabase = createClient()
    // [ĐA TẦNG] org_id KHÓA server-side theo org của user
    const { error } = await supabase.from('exam_bank').insert({
      org_id: scope.orgId,
      subject_id: parsed.data.subjectId || null,
      title: parsed.data.title,
      description: parsed.data.description || null,
      content: parsed.data.content || null,
      grade_level: parsed.data.gradeLevel || null,
      duration_minutes: parsed.data.durationMinutes ?? null,
      created_by: scope.userId,
    })
    if (error) return { error: `Không thể lưu đề thi: ${error.message}` }

    revalidatePath('/staff/exam-bank')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi lưu đề.',
    }
  }
}

export async function deleteExamBankItem(id: string): Promise<ActionResult> {
  const parsed = requiredId('Thiếu ID đề thi.').safeParse(id)
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const scope = await getStaffOrg()
    if (scope.error !== undefined) return { error: scope.error }

    const supabase = createClient()
    // Soft delete; RLS đảm bảo chỉ xóa được đề trong subtree của mình
    const { error } = await supabase
      .from('exam_bank')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsed.data)
      .is('deleted_at', null)
    if (error) return { error: `Không thể xóa đề thi: ${error.message}` }

    revalidatePath('/staff/exam-bank')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định khi xóa đề.',
    }
  }
}
