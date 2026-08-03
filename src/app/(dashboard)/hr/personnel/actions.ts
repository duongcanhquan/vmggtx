'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildObjectKey,
  isAllowedMimeType,
  isR2Configured,
  MAX_FILE_SIZE_BYTES,
  presignDownload,
  presignUpload,
} from '@/lib/storage/r2'
import { requiredId, safeText, zodFail } from '@/lib/validation/schemas'
import { z } from 'zod'

// ============================================================
// Hồ sơ & giấy tờ nhân sự (/hr/personnel) — dữ liệu nhạy cảm.
// Trưởng phòng NS = chức danh/grant menu hr_personnel (không role mới).
// Admin có thể khóa: org_settings.config.hr_sensitive_locked.
// ============================================================

const DOC_TYPES = [
  'cccd_front',
  'cccd_back',
  'contract_scan',
  'degree',
  'certificate',
  'other',
] as const

export type StaffDocType = (typeof DOC_TYPES)[number]

export type StaffProfileRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  org_id: string | null
  org_name: string
  address: string | null
  date_of_birth: string | null
  cccd: string | null
  gender: string | null
  job_title_name: string | null
}

export type StaffDocumentRow = {
  id: string
  profile_id: string
  doc_type: StaffDocType
  file_name: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

const staffProfileSchema = z.object({
  profileId: requiredId('Thiếu ID nhân sự.'),
  fullName: safeText('Họ tên', 2, 120),
  email: z.string().email('Email không hợp lệ.').or(z.literal('')),
  phone: z.string().max(20).default(''),
  address: z.string().max(255).default(''),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh không hợp lệ.')
    .or(z.literal(''))
    .default(''),
  cccd: z
    .string()
    .trim()
    .max(20)
    .regex(/^$|^\d{9}$|^\d{12}$/, 'CCCD/CMND phải 9 hoặc 12 số.')
    .default(''),
  gender: z.enum(['', 'male', 'female', 'other']).default(''),
})

async function getMyProfile() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' as const }
  const { data: me } = await supabase
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Không đọc được hồ sơ đăng nhập.' as const }
  return { user, me }
}

/** Kiểm tra quyền HR nhạy cảm trên org đích */
async function assertHrPersonnelAccess(orgId: string): Promise<string | null> {
  const auth = await getMyProfile()
  if ('error' in auth) return auth.error ?? 'Bạn chưa đăng nhập.'

  const supabase = createClient()
  const { data: cfg } = await supabase.rpc('get_org_effective_config', {
    p_org_id: orgId,
  })
  const locked = Boolean(
    cfg && typeof cfg === 'object' && (cfg as { hr_sensitive_locked?: boolean }).hr_sensitive_locked
  )

  if (auth.me.role === 'super_admin' || auth.me.role === 'campus_admin') {
    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: auth.user.id,
      p_target_org_id: orgId,
      p_required_role: 'campus_admin',
    })
    if (authorized !== true && auth.me.role !== 'super_admin') {
      return 'TỪ CHỐI: Cơ sở này không thuộc quyền quản lý của bạn.'
    }
    return null
  }

  if (locked) {
    return 'Quản lý cơ sở đã khóa quyền Nhân sự nhạy cảm. Chỉ Quản lý cơ sở được vào.'
  }

  let hasKey = false
  const { data: grantRows } = await supabase
    .from('user_menu_permissions')
    .select('menu_key')
    .eq('user_id', auth.user.id)
    .eq('menu_key', 'hr_personnel')
    .limit(1)
  if (grantRows && grantRows.length > 0) hasKey = true

  const { data: profile } = await supabase
    .from('profiles')
    .select('job_title_id')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (profile?.job_title_id) {
    const { data: title } = await supabase
      .from('job_titles')
      .select('menu_keys')
      .eq('id', profile.job_title_id)
      .is('deleted_at', null)
      .maybeSingle()
    const titleKeys = (title?.menu_keys as string[] | null) ?? []
    if (titleKeys.includes('hr_personnel')) hasKey = true
  }

  if (!hasKey) {
    return 'TỪ CHỐI: Cần quyền «Hồ sơ & giấy tờ NS» (chức danh Trưởng phòng NS hoặc được gán).'
  }

  const { data: inSubtree } = await supabase.rpc('is_authorized', {
    p_user_id: auth.user.id,
    p_target_org_id: orgId,
    p_required_role: 'teacher',
  })
  if (inSubtree !== true) {
    return 'TỪ CHỐI: Cơ sở này không thuộc phạm vi của bạn.'
  }
  return null
}

export async function getHrSensitiveLock(orgId: string): Promise<{
  locked: boolean
  canToggle: boolean
  error?: string
}> {
  const parsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!parsed.success) return { locked: false, canToggle: false, error: zodFail(parsed.error).error }

  try {
    const auth = await getMyProfile()
    if ('error' in auth) return { locked: false, canToggle: false, error: auth.error }

    const supabase = createClient()
    const { data: cfg } = await supabase.rpc('get_org_effective_config', {
      p_org_id: parsed.data,
    })
    const locked = Boolean(
      cfg &&
        typeof cfg === 'object' &&
        (cfg as { hr_sensitive_locked?: boolean }).hr_sensitive_locked
    )
    const canToggle =
      auth.me.role === 'super_admin' || auth.me.role === 'campus_admin'
    return { locked, canToggle }
  } catch (e) {
    return {
      locked: false,
      canToggle: false,
      error: e instanceof Error ? e.message : 'Lỗi đọc cấu hình.',
    }
  }
}

export async function setHrSensitiveLock(
  orgId: string,
  locked: boolean
): Promise<{ error?: string }> {
  const parsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!parsed.success) return zodFail(parsed.error)

  const auth = await getMyProfile()
  if ('error' in auth) return { error: auth.error }
  if (auth.me.role !== 'super_admin' && auth.me.role !== 'campus_admin') {
    return { error: 'Chỉ Quản lý cơ sở được khóa/mở quyền Nhân sự nhạy cảm.' }
  }

  const supabase = createClient()
  const { data: authorized } = await supabase.rpc('is_authorized', {
    p_user_id: auth.user.id,
    p_target_org_id: parsed.data,
    p_required_role: 'campus_admin',
  })
  if (authorized !== true && auth.me.role !== 'super_admin') {
    return { error: 'TỪ CHỐI: Không thuộc quyền quản lý cơ sở này.' }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('org_settings')
    .select('config')
    .eq('org_id', parsed.data)
    .maybeSingle()
  const prev =
    existing?.config && typeof existing.config === 'object'
      ? (existing.config as Record<string, unknown>)
      : {}
  const { error } = await admin.from('org_settings').upsert(
    {
      org_id: parsed.data,
      config: { ...prev, hr_sensitive_locked: locked },
    },
    { onConflict: 'org_id' }
  )
  if (error) return { error: error.message }
  revalidatePath('/hr/personnel')
  return {}
}

export async function listStaffProfiles(orgId: string): Promise<{
  data: StaffProfileRow[]
  error?: string
}> {
  const parsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!parsed.success) return { data: [], error: zodFail(parsed.error).error }

  const gate = await assertHrPersonnelAccess(parsed.data)
  if (gate) return { data: [], error: gate }

  try {
    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: parsed.data,
    })
    const orgIds = (subtree as string[] | null) ?? [parsed.data]
    if (!orgIds.includes(parsed.data)) orgIds.push(parsed.data)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select(
        'id, full_name, email, phone, role, org_id, address, date_of_birth, cccd, gender, job_title_id, organizations(name), job_titles(name)'
      )
      .in('org_id', orgIds)
      .neq('role', 'student')
      .is('deleted_at', null)
      .order('full_name')
    if (error) {
      // Fallback nếu thiếu cột/join
      const fb = await admin
        .from('profiles')
        .select('id, full_name, email, phone, role, org_id, organizations(name)')
        .in('org_id', orgIds)
        .neq('role', 'student')
        .is('deleted_at', null)
        .order('full_name')
      if (fb.error) return { data: [], error: fb.error.message }
      return {
        data: (fb.data ?? []).map((row) => {
          const org = row.organizations as { name: string } | { name: string }[] | null
          return {
            id: row.id,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone,
            role: row.role,
            org_id: row.org_id,
            org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
            address: null,
            date_of_birth: null,
            cccd: null,
            gender: null,
            job_title_name: null,
          }
        }),
      }
    }

    return {
      data: (data ?? []).map((row) => {
        const org = row.organizations as { name: string } | { name: string }[] | null
        const title = row.job_titles as { name: string } | { name: string }[] | null
        return {
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          phone: row.phone,
          role: row.role,
          org_id: row.org_id,
          org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
          address: (row.address as string | null) ?? null,
          date_of_birth: (row.date_of_birth as string | null) ?? null,
          cccd: (row.cccd as string | null) ?? null,
          gender: (row.gender as string | null) ?? null,
          job_title_name: Array.isArray(title)
            ? title[0]?.name ?? null
            : title?.name ?? null,
        }
      }),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải hồ sơ.' }
  }
}

export async function updateStaffProfile(raw: unknown): Promise<{ error?: string }> {
  const parsed = staffProfileSchema.safeParse(raw)
  if (!parsed.success) return zodFail(parsed.error)
  const v = parsed.data

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, org_id, role')
    .eq('id', v.profileId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!target?.org_id) return { error: 'Không tìm thấy nhân sự.' }
  if (target.role === 'student') {
    return { error: 'Học viên quản lý tại menu Học sinh.' }
  }

  const gate = await assertHrPersonnelAccess(target.org_id)
  if (gate) return { error: gate }

  const { error } = await admin
    .from('profiles')
    .update({
      full_name: v.fullName,
      email: v.email || null,
      phone: v.phone || null,
      address: v.address || null,
      date_of_birth: v.dateOfBirth || null,
      cccd: v.cccd || null,
      gender: v.gender || null,
    })
    .eq('id', v.profileId)
  if (error) return { error: error.message }
  revalidatePath('/hr/personnel')
  return {}
}

export async function listStaffDocuments(profileId: string): Promise<{
  data: StaffDocumentRow[]
  error?: string
  r2Ready: boolean
}> {
  const parsed = requiredId('Thiếu ID nhân sự.').safeParse(profileId)
  if (!parsed.success) {
    return { data: [], error: zodFail(parsed.error).error, r2Ready: false }
  }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', parsed.data)
    .maybeSingle()
  if (!target?.org_id) return { data: [], error: 'Không tìm thấy nhân sự.', r2Ready: false }

  const gate = await assertHrPersonnelAccess(target.org_id)
  if (gate) return { data: [], error: gate, r2Ready: isR2Configured() }

  const { data, error } = await admin
    .from('staff_documents')
    .select('id, profile_id, doc_type, file_name, file_size, mime_type, created_at')
    .eq('profile_id', parsed.data)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    if (/staff_documents|does not exist/i.test(error.message)) {
      return {
        data: [],
        error: 'Chưa có bảng giấy tờ. Chạy migration 072_hr_personnel_dossier.sql.',
        r2Ready: isR2Configured(),
      }
    }
    return { data: [], error: error.message, r2Ready: isR2Configured() }
  }
  return {
    data: (data ?? []) as StaffDocumentRow[],
    r2Ready: isR2Configured(),
  }
}

export async function presignStaffDocumentUpload(input: {
  profileId: string
  docType: string
  fileName: string
  fileType: string
  fileSize: number
}): Promise<{ error: string } | { url: string; key: string }> {
  if (!isR2Configured()) {
    return { error: 'Chưa cấu hình lưu trữ R2 — không upload được giấy tờ.' }
  }
  if (!DOC_TYPES.includes(input.docType as StaffDocType)) {
    return { error: 'Loại giấy tờ không hợp lệ.' }
  }
  if (input.fileSize > MAX_FILE_SIZE_BYTES) {
    return { error: 'File vượt quá 50MB.' }
  }
  if (!isAllowedMimeType(input.fileType || 'application/octet-stream')) {
    return { error: 'Định dạng file không được phép.' }
  }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', input.profileId)
    .maybeSingle()
  if (!target?.org_id) return { error: 'Không tìm thấy nhân sự.' }

  const gate = await assertHrPersonnelAccess(target.org_id)
  if (gate) return { error: gate }

  const key = buildObjectKey(target.org_id, `hr/${input.profileId}`, input.fileName)
  return presignUpload(key, input.fileType || 'application/octet-stream')
}

export async function registerStaffDocument(input: {
  profileId: string
  docType: string
  fileKey: string
  fileName: string
  fileSize: number
  mimeType: string
}): Promise<{ error?: string }> {
  if (!DOC_TYPES.includes(input.docType as StaffDocType)) {
    return { error: 'Loại giấy tờ không hợp lệ.' }
  }
  const auth = await getMyProfile()
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', input.profileId)
    .maybeSingle()
  if (!target?.org_id) return { error: 'Không tìm thấy nhân sự.' }

  const gate = await assertHrPersonnelAccess(target.org_id)
  if (gate) return { error: gate }

  const { error } = await admin.from('staff_documents').insert({
    org_id: target.org_id,
    profile_id: input.profileId,
    doc_type: input.docType,
    file_key: input.fileKey,
    file_name: input.fileName,
    file_size: input.fileSize,
    mime_type: input.mimeType,
    uploaded_by: auth.user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/hr/personnel')
  return {}
}

export async function getStaffDocumentDownloadUrl(
  documentId: string
): Promise<{ error: string } | { url: string }> {
  const parsed = requiredId('Thiếu ID giấy tờ.').safeParse(documentId)
  if (!parsed.success) return { error: zodFail(parsed.error).error }

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('staff_documents')
    .select('org_id, file_key, file_name')
    .eq('id', parsed.data)
    .is('deleted_at', null)
    .maybeSingle()
  if (!doc) return { error: 'Không tìm thấy giấy tờ.' }

  const gate = await assertHrPersonnelAccess(doc.org_id)
  if (gate) return { error: gate }

  if (!isR2Configured()) return { error: 'Chưa cấu hình R2.' }
  const url = await presignDownload(doc.file_key, doc.file_name)
  return { url }
}

export async function softDeleteStaffDocument(
  documentId: string
): Promise<{ error?: string }> {
  const parsed = requiredId('Thiếu ID giấy tờ.').safeParse(documentId)
  if (!parsed.success) return zodFail(parsed.error)

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('staff_documents')
    .select('org_id')
    .eq('id', parsed.data)
    .is('deleted_at', null)
    .maybeSingle()
  if (!doc) return { error: 'Không tìm thấy giấy tờ.' }

  const gate = await assertHrPersonnelAccess(doc.org_id)
  if (gate) return { error: gate }

  const { error } = await admin
    .from('staff_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data)
  if (error) return { error: error.message }
  revalidatePath('/hr/personnel')
  return {}
}

export type HrReminderItem = {
  kind: 'contract_end' | 'probation_end' | 'birthday'
  personName: string
  personId: string
  date: string
  detail: string
}

/** Nhắc việc trên UI: hết HĐ / hết thử việc (14 ngày) + sinh nhật tuần này */
export async function getHrReminders(orgId: string): Promise<{
  items: HrReminderItem[]
  error?: string
}> {
  const parsed = requiredId('Thiếu org_id.').safeParse(orgId)
  if (!parsed.success) return { items: [], error: zodFail(parsed.error).error }

  const gate = await assertHrPersonnelAccess(parsed.data)
  if (gate) return { items: [], error: gate }

  try {
    const supabase = createClient()
    const { data: subtree } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: parsed.data,
    })
    const orgIds = (subtree as string[] | null) ?? [parsed.data]

    const admin = createAdminClient()
    const today = new Date()
    const in14 = new Date(today)
    in14.setDate(in14.getDate() + 14)
    const todayIso = today.toISOString().slice(0, 10)
    const in14Iso = in14.toISOString().slice(0, 10)

    const items: HrReminderItem[] = []

    const { data: contracts } = await admin
      .from('teacher_contracts')
      .select('teacher_id, end_date, probation_end_date')
      .in('org_id', orgIds)
      .eq('is_active', true)
      .is('deleted_at', null)

    const teacherIds = [...new Set((contracts ?? []).map((c) => c.teacher_id))]
    const nameById = new Map<string, string>()
    if (teacherIds.length > 0) {
      const { data: teachers } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', teacherIds)
      for (const t of teachers ?? []) nameById.set(t.id, t.full_name)
    }

    for (const row of contracts ?? []) {
      const name = nameById.get(row.teacher_id) ?? '—'
      if (row.end_date && row.end_date >= todayIso && row.end_date <= in14Iso) {
        items.push({
          kind: 'contract_end',
          personName: name,
          personId: row.teacher_id,
          date: row.end_date,
          detail: 'Sắp hết hạn hợp đồng',
        })
      }
      if (
        row.probation_end_date &&
        row.probation_end_date >= todayIso &&
        row.probation_end_date <= in14Iso
      ) {
        items.push({
          kind: 'probation_end',
          personName: name,
          personId: row.teacher_id,
          date: row.probation_end_date,
          detail: 'Sắp hết thời gian thử việc',
        })
      }
    }

    // Sinh nhật trong 7 ngày tới (so khớp tháng-ngày)
    const { data: people } = await admin
      .from('profiles')
      .select('id, full_name, date_of_birth')
      .in('org_id', orgIds)
      .neq('role', 'student')
      .is('deleted_at', null)
      .not('date_of_birth', 'is', null)

    for (let d = 0; d < 7; d++) {
      const day = new Date(today)
      day.setDate(today.getDate() + d)
      const mm = String(day.getMonth() + 1).padStart(2, '0')
      const dd = String(day.getDate()).padStart(2, '0')
      for (const p of people ?? []) {
        const dob = p.date_of_birth as string
        if (dob.slice(5, 10) === `${mm}-${dd}`) {
          items.push({
            kind: 'birthday',
            personName: p.full_name,
            personId: p.id,
            date: `${day.getFullYear()}-${mm}-${dd}`,
            detail: d === 0 ? 'Sinh nhật hôm nay' : `Sinh nhật trong ${d} ngày`,
          })
        }
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date))
    return { items }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : 'Lỗi nhắc việc.' }
  }
}
