'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/passwordHash'
import {
  fail,
  requiredId,
  zodFail,
  type ActionResult,
} from '@/lib/validation/schemas'
import { z } from 'zod'

export type ParentAccountRow = {
  id: string
  email: string
  full_name: string | null
  created_at: string
  updated_at: string
}

const createParentSchema = z.object({
  studentId: z.string().uuid('ID học viên không hợp lệ.'),
  email: z.string().trim().email('Email không hợp lệ.'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự.'),
  fullName: z.string().trim().max(120).optional().or(z.literal('')),
})

const resetParentSchema = z.object({
  accountId: z.string().uuid(),
  studentId: z.string().uuid(),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự.'),
})

async function assertStaffOnStudent(studentId: string): Promise<
  | { error: string }
  | { error?: undefined; orgId: string; studentName: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Bạn chưa đăng nhập.')

  const { data: student } = await supabase
    .from('profiles')
    .select('id, org_id, full_name, role')
    .eq('id', studentId)
    .eq('role', 'student')
    .is('deleted_at', null)
    .maybeSingle()
  if (!student?.org_id) {
    return fail('Học viên không tồn tại hoặc ngoài phạm vi của bạn.')
  }

  const { data: authorized, error: authzError } = await supabase.rpc(
    'is_authorized',
    {
      p_user_id: user.id,
      p_target_org_id: student.org_id,
      p_required_role: 'academic_staff',
    }
  )
  if (authzError) return fail(`Lỗi phân quyền: ${authzError.message}`)
  if (authorized !== true) {
    return fail('TỪ CHỐI: Cần quyền Giáo vụ trở lên trên cơ sở của học viên.')
  }
  return {
    orgId: student.org_id,
    studentName: student.full_name ?? 'học viên',
  }
}

/** Danh sách TK phụ huynh đang gắn học viên (chưa xóa mềm). */
export async function listParentAccounts(
  studentId: string
): Promise<{ error: string } | { error?: undefined; accounts: ParentAccountRow[] }> {
  const idParsed = requiredId('Thiếu ID học viên.').safeParse(studentId)
  if (!idParsed.success) return zodFail(idParsed.error)

  const gate = await assertStaffOnStudent(idParsed.data)
  if (gate.error !== undefined) return { error: gate.error }

  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('parent_accounts')
      .select('id, email, full_name, created_at, updated_at')
      .eq('student_id', idParsed.data)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) {
      if (/parent_accounts|42P01|does not exist/i.test(error.message)) {
        return {
          error:
            'Chưa có bảng parent_accounts. Chạy migration 050_parent_accounts.sql trên Supabase.',
        }
      }
      return { error: `Không tải tài khoản phụ huynh: ${error.message}` }
    }
    return { accounts: (data ?? []) as ParentAccountRow[] }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi tải tài khoản phụ huynh.',
    }
  }
}

/** Tạo TK phụ huynh (email + mật khẩu) gắn học viên. */
export async function createParentAccount(
  formData: FormData
): Promise<ActionResult> {
  const parsed = createParentSchema.safeParse({
    studentId: String(formData.get('studentId') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const gate = await assertStaffOnStudent(parsed.data.studentId)
  if (gate.error !== undefined) return { error: gate.error }

  try {
    const admin = createAdminClient()
    const email = parsed.data.email.trim().toLowerCase()
    const { data: dup } = await admin
      .from('parent_accounts')
      .select('id')
      .ilike('email', email)
      .is('deleted_at', null)
      .maybeSingle()
    if (dup) return fail('Email này đã được dùng cho tài khoản phụ huynh khác.')

    const { error } = await admin.from('parent_accounts').insert({
      org_id: gate.orgId,
      student_id: parsed.data.studentId,
      email,
      password_hash: hashPassword(parsed.data.password),
      full_name:
        parsed.data.fullName?.trim() ||
        `Phụ huynh của ${gate.studentName}`,
    })
    if (error) {
      if (/parent_accounts|42P01/i.test(error.message)) {
        return fail(
          'Chưa có bảng parent_accounts. Chạy migration 050 trên Supabase.'
        )
      }
      return fail(`Không tạo được tài khoản: ${error.message}`)
    }
    revalidatePath(`/students/${parsed.data.studentId}`)
    return {}
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi tạo tài khoản phụ huynh.',
    }
  }
}

/** Đặt lại mật khẩu TK phụ huynh. */
export async function resetParentPassword(
  formData: FormData
): Promise<ActionResult> {
  const parsed = resetParentSchema.safeParse({
    accountId: String(formData.get('accountId') ?? ''),
    studentId: String(formData.get('studentId') ?? ''),
    password: String(formData.get('password') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  const gate = await assertStaffOnStudent(parsed.data.studentId)
  if (gate.error !== undefined) return { error: gate.error }

  try {
    const admin = createAdminClient()
    const { data: row, error: findErr } = await admin
      .from('parent_accounts')
      .select('id, student_id')
      .eq('id', parsed.data.accountId)
      .eq('student_id', parsed.data.studentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (findErr || !row) return fail('Không tìm thấy tài khoản phụ huynh.')

    const { error } = await admin
      .from('parent_accounts')
      .update({
        password_hash: hashPassword(parsed.data.password),
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.accountId)
    if (error) return fail(`Không đổi mật khẩu: ${error.message}`)

    revalidatePath(`/students/${parsed.data.studentId}`)
    return {}
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi đặt lại mật khẩu.',
    }
  }
}

/** Xóa mềm TK phụ huynh. */
export async function deleteParentAccount(
  accountId: string,
  studentId: string
): Promise<ActionResult> {
  const a = requiredId('Thiếu ID tài khoản.').safeParse(accountId)
  const s = requiredId('Thiếu ID học viên.').safeParse(studentId)
  if (!a.success) return zodFail(a.error)
  if (!s.success) return zodFail(s.error)

  const gate = await assertStaffOnStudent(s.data)
  if (gate.error !== undefined) return { error: gate.error }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('parent_accounts')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', a.data)
      .eq('student_id', s.data)
      .is('deleted_at', null)
    if (error) return fail(`Không xóa được: ${error.message}`)
    revalidatePath(`/students/${s.data}`)
    return {}
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi xóa tài khoản phụ huynh.',
    }
  }
}
