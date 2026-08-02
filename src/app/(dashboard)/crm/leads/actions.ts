'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  convertLeadSchema,
  leadActivitySchema,
  leadSchema,
  leadStatusSchema,
  requiredId,
  zodFail,
  LEAD_SOURCES,
  LEAD_PRIORITIES,
  type LeadSource,
  type LeadPriority,
  type LeadActivityType,
} from '@/lib/validation/schemas'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { generateStudentCode } from '@/lib/utils/studentCode'
import { checkStudentCapacity } from '@/lib/licensing/capacity'

// ============================================================
// CRM Tuyen sinh (/crm/leads) — quy trinh chuyen nghiep
//
// Phan quyen: SSR client + RLS (014 / 049). Admin client chi dung
// khi convert lead -> student (tao auth user).
// ============================================================

export type LeadStatus = 'new' | 'contacted' | 'test_scheduled' | 'enrolled' | 'lost'

export type LeadCard = {
  id: string
  full_name: string
  phone: string
  email: string | null
  status: LeadStatus
  source: LeadSource | null
  priority: LeadPriority
  notes: string | null
  date_of_birth: string | null
  gender: string | null
  cccd: string | null
  address: string | null
  current_school: string | null
  education_level: string | null
  career_interest: string | null
  interests: string | null
  preferred_schedule: string | null
  call_summary: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_relation: string | null
  parent_email: string | null
  parent2_name: string | null
  parent2_phone: string | null
  parent2_relation: string | null
  next_follow_up_at: string | null
  appointment_at: string | null
  lost_reason: string | null
  counselor_id: string | null
  counselor_name: string | null
  interested_subject_id: string | null
  subject_name: string | null
  converted_student_id: string | null
  org_id: string
  created_at: string
  updated_at: string | null
  activity_count: number
  last_activity_at: string | null
  is_overdue: boolean
  profile_completeness: number
}

export type LeadActivityRow = {
  id: string
  lead_id: string
  activity_type: LeadActivityType | string
  description: string | null
  created_at: string
  created_by: string | null
  creator_name: string | null
}

export type Option = { id: string; name: string }

export type LeadFunnelStats = {
  total: number
  byStatus: Record<LeadStatus, number>
  bySource: { source: LeadSource | 'unknown'; label: string; count: number }[]
  byCounselor: {
    counselorId: string | null
    counselorName: string
    total: number
    enrolled: number
    lost: number
    inProgress: number
    conversionRate: number
  }[]
  overdueFollowUps: number
  upcomingAppointments: number
  conversionRate: number
}

type ActionResult = { error: string } | { error?: undefined; warning?: string }

const SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: 'Walk-in',
  hotline: 'Hotline',
  facebook: 'Facebook',
  zalo: 'Zalo',
  website: 'Website',
  referral: 'Giới thiệu',
  school_event: 'Sự kiện trường',
  ads: 'Quảng cáo',
  other: 'Khác',
}

const LEAD_SELECT =
  'id, org_id, full_name, phone, email, status, source, priority, notes, date_of_birth, gender, cccd, address, current_school, education_level, career_interest, interests, preferred_schedule, call_summary, parent_name, parent_phone, parent_relation, parent_email, parent2_name, parent2_phone, parent2_relation, next_follow_up_at, appointment_at, lost_reason, counselor_id, interested_subject_id, converted_student_id, created_at, updated_at, subjects(name), profiles!leads_counselor_id_fkey(full_name)'

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** datetime-local / date → ISO timestamptz (tránh lệch múi giờ khi ghi DB) */
function toTimestamptz(value: string | null | undefined): string | null {
  if (!value || !String(value).trim()) return null
  const raw = String(value).trim()
  // YYYY-MM-DD only (date of birth) — giữ nguyên
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function leadFormFromData(formData: FormData) {
  return {
    fullName: String(formData.get('fullName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    interestedSubjectId: String(formData.get('interestedSubjectId') ?? ''),
    source: String(formData.get('source') ?? '') || undefined,
    priority: String(formData.get('priority') ?? 'warm') || 'warm',
    dateOfBirth: String(formData.get('dateOfBirth') ?? ''),
    gender: String(formData.get('gender') ?? ''),
    cccd: String(formData.get('cccd') ?? ''),
    address: String(formData.get('address') ?? ''),
    currentSchool: String(formData.get('currentSchool') ?? ''),
    educationLevel: String(formData.get('educationLevel') ?? ''),
    careerInterest: String(formData.get('careerInterest') ?? ''),
    interests: String(formData.get('interests') ?? ''),
    preferredSchedule: String(formData.get('preferredSchedule') ?? ''),
    callSummary: String(formData.get('callSummary') ?? ''),
    parentName: String(formData.get('parentName') ?? ''),
    parentPhone: String(formData.get('parentPhone') ?? ''),
    parentRelation: String(formData.get('parentRelation') ?? ''),
    parentEmail: String(formData.get('parentEmail') ?? ''),
    parent2Name: String(formData.get('parent2Name') ?? ''),
    parent2Phone: String(formData.get('parent2Phone') ?? ''),
    parent2Relation: String(formData.get('parent2Relation') ?? ''),
    nextFollowUpAt: String(formData.get('nextFollowUpAt') ?? ''),
    appointmentAt: String(formData.get('appointmentAt') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  }
}

function leadRowFromValues(values: import('@/lib/validation/schemas').LeadFormValues, phone: string) {
  return {
    full_name: values.fullName,
    phone,
    interested_subject_id: values.interestedSubjectId || null,
    notes: values.notes || null,
    email: values.email || null,
    source: values.source || 'other',
    priority: values.priority || 'warm',
    date_of_birth: values.dateOfBirth || null,
    gender: values.gender || null,
    cccd: values.cccd ? values.cccd.replace(/\s/g, '') : null,
    address: values.address || null,
    current_school: values.currentSchool || null,
    education_level: values.educationLevel || null,
    career_interest: values.careerInterest || null,
    interests: values.interests || null,
    preferred_schedule: values.preferredSchedule || null,
    call_summary: values.callSummary || null,
    parent_name: values.parentName || null,
    parent_phone: values.parentPhone ? normalizePhone(values.parentPhone) : null,
    parent_relation: values.parentRelation || null,
    parent_email: values.parentEmail || null,
    parent2_name: values.parent2Name || null,
    parent2_phone: values.parent2Phone ? normalizePhone(values.parent2Phone) : null,
    parent2_relation: values.parent2Relation || null,
    next_follow_up_at: toTimestamptz(values.nextFollowUpAt),
    appointment_at: toTimestamptz(values.appointmentAt),
  }
}

async function assertCrmRequiredFields(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  values: import('@/lib/validation/schemas').LeadFormValues
): Promise<string | null> {
  try {
    const { data: eff } = await supabase.rpc('get_org_effective_config', { p_org_id: orgId })
    const cfg = (eff || {}) as Record<string, unknown>
    if (cfg.crm_require_parent === true) {
      if (!values.parentName?.trim() || !values.parentPhone?.trim()) {
        return 'Cấu hình CRM bắt buộc nhập tên + SĐT phụ huynh.'
      }
    }
    if (cfg.crm_require_cccd === true && !values.cccd?.trim()) {
      return 'Cấu hình CRM bắt buộc nhập CCCD/CMND.'
    }
    if (cfg.crm_require_career === true && !values.careerInterest?.trim()) {
      return 'Cấu hình CRM bắt buộc nhập ngành nghề / chương trình quan tâm.'
    }
  } catch {
    /* fail-open */
  }
  return null
}

function computeProfileCompleteness(row: Record<string, unknown>): number {
  const checks = [
    row.full_name,
    row.phone,
    row.email,
    row.cccd,
    row.date_of_birth,
    row.address,
    row.career_interest,
    row.interests,
    row.parent_name,
    row.parent_phone,
    row.current_school || row.education_level,
    row.preferred_schedule,
  ]
  const filled = checks.filter((v) => v != null && String(v).trim() !== '').length
  return Math.round((filled / checks.length) * 100)
}


function emptyFunnel(): LeadFunnelStats {
  return {
    total: 0,
    byStatus: { new: 0, contacted: 0, test_scheduled: 0, enrolled: 0, lost: 0 },
    bySource: [
      ...LEAD_SOURCES.map((s) => ({ source: s, label: SOURCE_LABELS[s], count: 0 })),
      { source: 'unknown' as const, label: 'Chua ghi', count: 0 },
    ],
    byCounselor: [],
    overdueFollowUps: 0,
    upcomingAppointments: 0,
    conversionRate: 0,
  }
}

function mapLeadRow(
  row: Record<string, unknown>,
  activityMeta?: { count: number; lastAt: string | null }
): LeadCard {
  const subject = row.subjects as { name?: string } | { name?: string }[] | null
  const counselor = row.profiles as { full_name?: string } | { full_name?: string }[] | null
  const status = row.status as LeadStatus
  const nextFollow = (row.next_follow_up_at as string | null) ?? null
  const isOverdue =
    !!nextFollow &&
    status !== 'enrolled' &&
    status !== 'lost' &&
    new Date(nextFollow).getTime() < Date.now()

  return {
    id: String(row.id),
    org_id: String(row.org_id),
    full_name: String(row.full_name),
    phone: String(row.phone),
    email: (row.email as string | null) ?? null,
    status,
    source: (row.source as LeadSource | null) ?? null,
    priority: ((row.priority as LeadPriority) || 'warm') as LeadPriority,
    notes: (row.notes as string | null) ?? null,
    date_of_birth: (row.date_of_birth as string | null) ?? null,
    gender: (row.gender as string | null) ?? null,
    cccd: (row.cccd as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    current_school: (row.current_school as string | null) ?? null,
    education_level: (row.education_level as string | null) ?? null,
    career_interest: (row.career_interest as string | null) ?? null,
    interests: (row.interests as string | null) ?? null,
    preferred_schedule: (row.preferred_schedule as string | null) ?? null,
    call_summary: (row.call_summary as string | null) ?? null,
    parent_name: (row.parent_name as string | null) ?? null,
    parent_phone: (row.parent_phone as string | null) ?? null,
    parent_relation: (row.parent_relation as string | null) ?? null,
    parent_email: (row.parent_email as string | null) ?? null,
    parent2_name: (row.parent2_name as string | null) ?? null,
    parent2_phone: (row.parent2_phone as string | null) ?? null,
    parent2_relation: (row.parent2_relation as string | null) ?? null,
    next_follow_up_at: nextFollow,
    appointment_at: (row.appointment_at as string | null) ?? null,
    lost_reason: (row.lost_reason as string | null) ?? null,
    counselor_id: (row.counselor_id as string | null) ?? null,
    counselor_name: Array.isArray(counselor)
      ? counselor[0]?.full_name ?? null
      : counselor?.full_name ?? null,
    interested_subject_id: (row.interested_subject_id as string | null) ?? null,
    subject_name: Array.isArray(subject)
      ? subject[0]?.name ?? null
      : subject?.name ?? null,
    converted_student_id: (row.converted_student_id as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: (row.updated_at as string | null) ?? null,
    activity_count: activityMeta?.count ?? 0,
    last_activity_at: activityMeta?.lastAt ?? null,
    is_overdue: isOverdue,
    profile_completeness: computeProfileCompleteness(row),
  }
}

async function logActivity(
  supabase: ReturnType<typeof createClient>,
  params: {
    leadId: string
    orgId: string
    userId: string
    type: LeadActivityType
    description: string
  }
) {
  const { error } = await supabase.from('lead_activities').insert({
    lead_id: params.leadId,
    org_id: params.orgId,
    created_by: params.userId,
    activity_type: params.type,
    description: params.description,
  })
  // Truoc 052 chi cho phep call|email|meeting
  if (error && /activity_type|check|23514/i.test(error.message)) {
    await supabase.from('lead_activities').insert({
      lead_id: params.leadId,
      org_id: params.orgId,
      created_by: params.userId,
      activity_type: 'call',
      description: `[${params.type}] ${params.description}`,
    })
  }
}

/**
 * Danh sach leads trong subtree org dang chon.
 * KHONG tra MOCK khi trong / loi — tra mang rong + error.
 */
export async function getLeads(
  orgId: string
): Promise<{ data: LeadCard[]; demo: boolean; error?: string }> {
  try {
    const orgParsed = requiredId('Thieu org_id.').safeParse(orgId)
    if (!orgParsed.success) {
      return { data: [], demo: false, error: orgParsed.error.issues[0]?.message }
    }

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], demo: false, error: 'Ban chua dang nhap.' }

    const orgIds = await getDescendantOrgIds(supabase, orgParsed.data)

    const { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .in('org_id', orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      // Cot moi (052) chua chay → fallback select cot cu
      if (/column|does not exist|42703/i.test(error.message)) {
        const legacy = await supabase
          .from('leads')
          .select(
            'id, org_id, full_name, phone, status, notes, counselor_id, interested_subject_id, converted_student_id, created_at, updated_at, subjects(name), profiles!leads_counselor_id_fkey(full_name)'
          )
          .in('org_id', orgIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(500)
        if (legacy.error) {
          return { data: [], demo: false, error: legacy.error.message }
        }
        return {
          data: (legacy.data || []).map((row) =>
            mapLeadRow({
              ...row,
              email: null,
              source: null,
              priority: 'warm',
              date_of_birth: null,
              gender: null,
              cccd: null,
              address: null,
              current_school: null,
              education_level: null,
              career_interest: null,
              interests: null,
              preferred_schedule: null,
              call_summary: null,
              parent_name: null,
              parent_phone: null,
              parent_relation: null,
              parent_email: null,
              parent2_name: null,
              parent2_phone: null,
              parent2_relation: null,
              next_follow_up_at: null,
              appointment_at: null,
              lost_reason: null,
            })
          ),
          demo: false,
          error:
            'Migration 052/053 chưa chạy — đang hiển thị cột cơ bản. Hãy chạy 052 rồi 053 trên Supabase.',
        }
      }
      return { data: [], demo: false, error: error.message }
    }

    const leadIds = (data || []).map((r) => r.id)
    const activityMeta = new Map<string, { count: number; lastAt: string | null }>()
    if (leadIds.length > 0) {
      let actsQuery = await supabase
        .from('lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', leadIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (actsQuery.error && /deleted_at|42703/i.test(actsQuery.error.message)) {
        actsQuery = await supabase
          .from('lead_activities')
          .select('lead_id, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
      }
      for (const a of actsQuery.data || []) {
        const cur = activityMeta.get(a.lead_id)
        if (!cur) activityMeta.set(a.lead_id, { count: 1, lastAt: a.created_at })
        else cur.count += 1
      }
    }

    return {
      data: (data || []).map((row) =>
        mapLeadRow(row as Record<string, unknown>, activityMeta.get(row.id))
      ),
      demo: false,
    }
  } catch (e) {
    return {
      data: [],
      demo: false,
      error: e instanceof Error ? e.message : 'Loi tai danh sach lead.',
    }
  }
}

/** Mon hoc + Lop + Tu van vien (+ meta nguon/do nong) */
export async function getCrmOptions(orgId: string): Promise<{
  subjects: Option[]
  classes: Option[]
  counselors: Option[]
  sources: { id: LeadSource; label: string }[]
  priorities: { id: LeadPriority; label: string }[]
  activityTypes: { id: LeadActivityType; label: string }[]
  error?: string
}> {
  const meta = {
    sources: LEAD_SOURCES.map((s) => ({ id: s, label: SOURCE_LABELS[s] })),
    priorities: LEAD_PRIORITIES.map((p) => ({
      id: p,
      label: p === 'hot' ? 'Nóng' : p === 'cold' ? 'Lạnh' : 'Ấm',
    })),
    activityTypes: (
      [
        ['call', 'Gọi điện'],
        ['email', 'Email'],
        ['meeting', 'Gặp mặt'],
        ['zalo', 'Zalo'],
        ['sms', 'SMS'],
        ['note', 'Ghi chú'],
      ] as const
    ).map(([id, label]) => ({ id: id as LeadActivityType, label })),
  }

  try {
    const orgParsed = requiredId('Thieu org_id.').safeParse(orgId)
    if (!orgParsed.success) {
      return { subjects: [], classes: [], counselors: [], ...meta, error: 'Thieu org_id.' }
    }

    const supabase = createClient()
    const scopeOrgIds = await getDescendantOrgIds(supabase, orgParsed.data)

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
      ...meta,
      error:
        subjectResult.error?.message ||
        classResult.error?.message ||
        counselorResult.error?.message,
    }
  } catch (e) {
    return {
      subjects: [],
      classes: [],
      counselors: [],
      ...meta,
      error: e instanceof Error ? e.message : 'Loi tai tuy chon CRM.',
    }
  }
}

export async function getLeadFunnelStats(
  orgId: string
): Promise<{ data: LeadFunnelStats; error?: string }> {
  const { data: leads, error } = await getLeads(orgId)
  if (error && leads.length === 0) return { data: emptyFunnel(), error }

  const stats = emptyFunnel()
  stats.total = leads.length
  const counselorMap = new Map<string, LeadFunnelStats['byCounselor'][number]>()
  const now = Date.now()
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000

  for (const lead of leads) {
    stats.byStatus[lead.status] = (stats.byStatus[lead.status] || 0) + 1

    if (lead.source) {
      const src = stats.bySource.find((s) => s.source === lead.source)
      if (src) src.count += 1
    } else {
      const unk = stats.bySource.find((s) => s.source === 'unknown')
      if (unk) unk.count += 1
    }

    if (lead.is_overdue) stats.overdueFollowUps += 1
    if (
      lead.appointment_at &&
      new Date(lead.appointment_at).getTime() >= now &&
      new Date(lead.appointment_at).getTime() <= weekAhead
    ) {
      stats.upcomingAppointments += 1
    }

    const key = lead.counselor_id ?? '__none__'
    let row = counselorMap.get(key)
    if (!row) {
      row = {
        counselorId: lead.counselor_id,
        counselorName: lead.counselor_name ?? 'Chua phan cong',
        total: 0,
        enrolled: 0,
        lost: 0,
        inProgress: 0,
        conversionRate: 0,
      }
      counselorMap.set(key, row)
    }
    row.total += 1
    if (lead.status === 'enrolled') row.enrolled += 1
    else if (lead.status === 'lost') row.lost += 1
    else row.inProgress += 1
  }

  const closed = stats.byStatus.enrolled + stats.byStatus.lost
  stats.conversionRate =
    closed > 0 ? Math.round((stats.byStatus.enrolled / closed) * 1000) / 10 : 0
  stats.byCounselor = [...counselorMap.values()]
    .map((r) => ({
      ...r,
      conversionRate: r.total > 0 ? Math.round((r.enrolled / r.total) * 100) : 0,
    }))
    .sort((a, b) => b.enrolled - a.enrolled || b.total - a.total)

  return { data: stats, error }
}

export async function getLeadActivities(
  leadId: string
): Promise<{ data: LeadActivityRow[]; error?: string }> {
  const idParsed = requiredId('Thieu lead id.').safeParse(leadId)
  if (!idParsed.success) return { data: [], error: 'Thieu lead id.' }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Ban chua dang nhap.' }

    // RLS: doc duoc lead = co quyen
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (leadErr) return { data: [], error: leadErr.message }
    if (!lead) return { data: [], error: 'Lead khong ton tai hoac khong co quyen.' }

    let { data, error } = await supabase
      .from('lead_activities')
      .select('id, lead_id, activity_type, description, created_at, created_by')
      .eq('lead_id', idParsed.data)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    // Soft-delete filter neu cot ton tai (052)
    if (error && /deleted_at|42703/i.test(error.message)) {
      const legacy = await supabase
        .from('lead_activities')
        .select('id, lead_id, activity_type, description, created_at, created_by')
        .eq('lead_id', idParsed.data)
        .order('created_at', { ascending: false })
        .limit(100)
      data = legacy.data
      error = legacy.error
    }
    if (error) return { data: [], error: error.message }

    const creatorIds = [
      ...new Set((data || []).map((r) => r.created_by).filter(Boolean)),
    ] as string[]
    const nameMap = new Map<string, string>()
    if (creatorIds.length) {
      const { data: creators } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', creatorIds)
      for (const c of creators || []) {
        nameMap.set(c.id, c.full_name || '—')
      }
    }

    return {
      data: (data || []).map((r) => ({
        id: r.id,
        lead_id: r.lead_id,
        activity_type: r.activity_type,
        description: r.description,
        created_at: r.created_at,
        created_by: r.created_by,
        creator_name: r.created_by ? nameMap.get(r.created_by) || null : null,
      })),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Loi tai nhat ky.',
    }
  }
}

export async function assignLeadCounselor(
  leadId: string,
  counselorId: string | null
): Promise<ActionResult> {
  const idParsed = requiredId('Thieu lead id.').safeParse(leadId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Ban chua dang nhap.' }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, status')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lead) return { error: 'Lead khong ton tai hoac khong co quyen.' }
    if (lead.status === 'enrolled') {
      return { error: 'Lead da nhap hoc — khong doi nguoi phu trach.' }
    }

    const { error, count } = await supabase
      .from('leads')
      .update({ counselor_id: counselorId || null }, { count: 'exact' })
      .eq('id', idParsed.data)
      .is('deleted_at', null)
    if (error) return { error: `Khong the gan nguoi phu trach: ${error.message}` }
    if (count === 0) {
      return { error: 'Lead khong ton tai hoac ban khong co quyen tren lead nay.' }
    }

    await logActivity(supabase, {
      leadId: idParsed.data,
      orgId: lead.org_id,
      userId: user.id,
      type: 'note',
      description: counselorId
        ? 'Cap nhat nguoi tuyen sinh phu trach.'
        : 'Bo phan cong nguoi phu trach.',
    })

    revalidatePath('/crm/leads')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Loi khong xac dinh khi gan nguoi phu trach.',
    }
  }
}

export async function claimLead(leadId: string): Promise<ActionResult> {
  const idParsed = requiredId('Thieu lead id.').safeParse(leadId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Ban chua dang nhap.' }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, counselor_id, status')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lead) return { error: 'Lead khong ton tai hoac khong co quyen.' }
    if (lead.status === 'enrolled' || lead.status === 'lost') {
      return { error: 'Lead da ket thuc — khong nhan them.' }
    }
    if (lead.counselor_id && lead.counselor_id !== user.id) {
      const { data: me } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (!me || !['campus_admin', 'academic_staff', 'super_admin'].includes(me.role)) {
        return { error: 'Lead da duoc giao cho tu van vien khac.' }
      }
    }

    const { error } = await supabase
      .from('leads')
      .update({ counselor_id: user.id })
      .eq('id', idParsed.data)
      .is('deleted_at', null)
    if (error) return { error: error.message }

    await logActivity(supabase, {
      leadId: idParsed.data,
      orgId: lead.org_id,
      userId: user.id,
      type: 'note',
      description: 'Tu van vien nhan lead ve phu trach.',
    })

    revalidatePath('/crm/leads')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Loi nhan lead.' }
  }
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const orgParsed = requiredId(
    'Thieu org_id: vui long chon cap quan ly o goc tren ben phai.'
  ).safeParse(String(formData.get('orgId') ?? ''))
  if (!orgParsed.success) return zodFail(orgParsed.error)
  const orgId = orgParsed.data

  const parsed = leadSchema.safeParse(leadFormFromData(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data
  const phone = normalizePhone(values.phone)

  try {
    const supabase = createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    if (!currentUser) return { error: 'Ban chua dang nhap.' }

    const { data: dup } = await supabase
      .from('leads')
      .select('id, full_name, status')
      .eq('org_id', orgId)
      .eq('phone', phone)
      .is('deleted_at', null)
      .maybeSingle()
    if (dup) {
      return {
        error: `So dien thoai da ton tai tren lead "${dup.full_name}" (${dup.status}). Khong tao trung.`,
      }
    }

    const { data: existingStudent } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', orgId)
      .eq('role', 'student')
      .eq('phone', phone)
      .is('deleted_at', null)
      .maybeSingle()

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .maybeSingle()
    const counselorId = profile?.role === 'admission_staff' ? currentUser.id : null

    const requiredErr = await assertCrmRequiredFields(supabase, orgId, values)
    if (requiredErr) return { error: requiredErr }

    const rowValues = leadRowFromValues(values, phone)
    let nextFollow = rowValues.next_follow_up_at
    if (!nextFollow) {
      try {
        const { data: eff } = await supabase.rpc('get_org_effective_config', { p_org_id: orgId })
        const hours = Number((eff as Record<string, unknown>)?.crm_default_follow_up_hours ?? 24)
        if (hours > 0) {
          nextFollow = new Date(Date.now() + hours * 3600_000).toISOString()
        }
      } catch {
        /* ignore */
      }
    }

    const insertRow: Record<string, unknown> = {
      org_id: orgId,
      status: 'new',
      counselor_id: counselorId,
      ...rowValues,
      next_follow_up_at: nextFollow,
    }

    let { data: created, error } = await supabase
      .from('leads')
      .insert(insertRow)
      .select('id')
      .maybeSingle()

    if (error && /column|42703/i.test(error.message)) {
      const legacy = await supabase
        .from('leads')
        .insert({
          org_id: orgId,
          full_name: values.fullName,
          phone,
          interested_subject_id: values.interestedSubjectId || null,
          notes: values.notes || null,
          status: 'new',
          counselor_id: counselorId,
        })
        .select('id')
        .maybeSingle()
      created = legacy.data
      error = legacy.error
    }

    if (error) {
      if (error.code === '23505') {
        return { error: 'So dien thoai da ton tai trong co so nay (trung lead).' }
      }
      return { error: `Khong the tao lead: ${error.message}` }
    }

    if (created?.id) {
      await logActivity(supabase, {
        leadId: created.id,
        orgId,
        userId: currentUser.id,
        type: 'note',
        description: existingStudent
          ? `Tao lead moi. Canh bao: SĐT trung hoc vien "${existingStudent.full_name}".`
          : 'Tao lead moi tu form tuyen sinh.',
      })
    }

    revalidatePath('/crm/leads')
    return {
      warning: existingStudent
        ? `SĐT trung hoc vien "${existingStudent.full_name}" — kiem tra truoc khi chuyen doi.`
        : undefined,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Loi khong xac dinh khi tao lead.',
    }
  }
}

export async function updateLead(formData: FormData): Promise<ActionResult> {
  const leadIdParsed = requiredId('Thieu lead id.').safeParse(
    String(formData.get('leadId') ?? '')
  )
  if (!leadIdParsed.success) return zodFail(leadIdParsed.error)

  const parsed = leadSchema.safeParse(leadFormFromData(formData))
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data
  const phone = normalizePhone(values.phone)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Ban chua dang nhap.' }

    const { data: existing } = await supabase
      .from('leads')
      .select('id, org_id, status, phone')
      .eq('id', leadIdParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!existing) return { error: 'Lead khong ton tai hoac khong co quyen.' }
    if (existing.status === 'enrolled') {
      return { error: 'Lead da nhap hoc — khong sua thong tin tuyen sinh.' }
    }

    if (phone !== normalizePhone(existing.phone)) {
      const { data: dup } = await supabase
        .from('leads')
        .select('id, full_name')
        .eq('org_id', existing.org_id)
        .eq('phone', phone)
        .neq('id', leadIdParsed.data)
        .is('deleted_at', null)
        .maybeSingle()
      if (dup) return { error: `SĐT trung lead "${dup.full_name}".` }
    }

    const requiredErr = await assertCrmRequiredFields(supabase, existing.org_id, values)
    if (requiredErr) return { error: requiredErr }

    const patch: Record<string, unknown> = {
      ...leadRowFromValues(values, phone),
    }

    let { error } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', leadIdParsed.data)
      .is('deleted_at', null)

    if (error && /column|42703/i.test(error.message)) {
      const legacy = await supabase
        .from('leads')
        .update({
          full_name: values.fullName,
          phone,
          interested_subject_id: values.interestedSubjectId || null,
          notes: values.notes || null,
        })
        .eq('id', leadIdParsed.data)
        .is('deleted_at', null)
      error = legacy.error
    }

    if (error) {
      if (error.code === '23505') return { error: 'So dien thoai bi trung trong co so.' }
      return { error: error.message }
    }

    await logActivity(supabase, {
      leadId: leadIdParsed.data,
      orgId: existing.org_id,
      userId: user.id,
      type: 'note',
      description: 'Cap nhat thong tin lead.',
    })

    revalidatePath('/crm/leads')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Loi cap nhat lead.' }
  }
}

export async function softDeleteLead(leadId: string): Promise<ActionResult> {
  const idParsed = requiredId('Thieu lead id.').safeParse(leadId)
  if (!idParsed.success) return zodFail(idParsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Ban chua dang nhap.' }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, status')
      .eq('id', idParsed.data)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lead) return { error: 'Lead khong ton tai hoac khong co quyen.' }
    if (lead.status === 'enrolled') {
      return { error: 'Lead đã nhập học — không xóa.' }
    }

    // Ghi nhật ký TRƯỚC soft-delete (RLS activities yêu cầu lead còn sống)
    await logActivity(supabase, {
      leadId: idParsed.data,
      orgId: lead.org_id,
      userId: user.id,
      type: 'note',
      description: 'Soft-delete lead (ẩn khỏi pipeline).',
    })

    const { error, count } = await supabase
      .from('leads')
      .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', idParsed.data)
      .is('deleted_at', null)
    if (error) return { error: error.message }
    if (count === 0) return { error: 'Không xóa được lead (thiếu quyền?).' }

    revalidatePath('/crm/leads')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa lead.' }
  }
}

/**
 * Doi trang thai Kanban. KHONG dung cho enrolled — phai qua convert.
 */
export async function updateLeadStatus(
  leadId: string,
  status: string,
  extras?: {
    lostReason?: string
    appointmentAt?: string
    nextFollowUpAt?: string
  }
): Promise<ActionResult> {
  const parsed = leadStatusSchema.safeParse({
    leadId,
    status,
    lostReason: extras?.lostReason ?? '',
    appointmentAt: extras?.appointmentAt ?? '',
    nextFollowUpAt: extras?.nextFollowUpAt ?? '',
  })
  if (!parsed.success) return zodFail(parsed.error)

  if (parsed.data.status === 'enrolled') {
    return {
      error:
        'Chuyen sang "Da nhap hoc" phai qua buoc chuyen hoa ho so (nhap thong tin hoc sinh).',
    }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Ban chua dang nhap. Vui long dang nhap lai.' }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, status')
      .eq('id', parsed.data.leadId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lead) return { error: 'Lead khong ton tai hoac khong co quyen.' }
    if (lead.status === 'enrolled') {
      return { error: 'Lead da nhap hoc — khong doi trang thai nguoc.' }
    }

    const patch: Record<string, unknown> = { status: parsed.data.status }
    if (parsed.data.status === 'lost') {
      patch.lost_reason = parsed.data.lostReason?.trim() || null
    } else {
      patch.lost_reason = null
    }
    if (parsed.data.status === 'test_scheduled' && parsed.data.appointmentAt) {
      patch.appointment_at = toTimestamptz(parsed.data.appointmentAt)
    }
    if (parsed.data.nextFollowUpAt) {
      patch.next_follow_up_at = toTimestamptz(parsed.data.nextFollowUpAt)
    }

    let { error, count } = await supabase
      .from('leads')
      .update(patch, { count: 'exact' })
      .eq('id', parsed.data.leadId)
      .is('deleted_at', null)

    if (error && /column|42703/i.test(error.message)) {
      const legacy = await supabase
        .from('leads')
        .update({ status: parsed.data.status }, { count: 'exact' })
        .eq('id', parsed.data.leadId)
        .is('deleted_at', null)
      error = legacy.error
      count = legacy.count
    }

    if (error) return { error: `Khong the doi trang thai: ${error.message}` }
    if (count === 0) {
      return { error: 'Lead khong ton tai hoac ban khong co quyen tren lead nay.' }
    }

    if (lead.status !== parsed.data.status) {
      const lostExtra =
        parsed.data.status === 'lost' && parsed.data.lostReason
          ? ` Ly do: ${parsed.data.lostReason.trim()}`
          : ''
      await logActivity(supabase, {
        leadId: parsed.data.leadId,
        orgId: lead.org_id,
        userId: user.id,
        type: 'status_change',
        description: `Doi trang thai: ${lead.status} → ${parsed.data.status}.${lostExtra}`,
      })
    }

    revalidatePath('/crm/leads')
    return {}
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Loi khong xac dinh khi doi trang thai.',
    }
  }
}

export async function addLeadActivity(formData: FormData): Promise<ActionResult> {
  const parsed = leadActivitySchema.safeParse({
    leadId: String(formData.get('leadId') ?? ''),
    activityType: String(formData.get('activityType') ?? ''),
    description: String(formData.get('description') ?? ''),
    nextFollowUpAt: String(formData.get('nextFollowUpAt') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Ban chua dang nhap.' }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, org_id, status')
      .eq('id', parsed.data.leadId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!lead) return { error: 'Lead khong ton tai hoac khong co quyen.' }

    if (
      (lead.status === 'enrolled' || lead.status === 'lost') &&
      parsed.data.activityType !== 'note'
    ) {
      return { error: 'Lead da ket thuc — chi ghi chu bo sung.' }
    }

    const { error: actErr } = await supabase.from('lead_activities').insert({
      lead_id: parsed.data.leadId,
      org_id: lead.org_id,
      created_by: user.id,
      activity_type: parsed.data.activityType,
      description: parsed.data.description,
    })
    if (actErr) {
      // status_change / zalo / sms may fail if 052 not applied
      if (/activity_type|check|23514/i.test(actErr.message)) {
        const fallback = await supabase.from('lead_activities').insert({
          lead_id: parsed.data.leadId,
          org_id: lead.org_id,
          created_by: user.id,
          activity_type: ['call', 'email', 'meeting'].includes(parsed.data.activityType)
            ? parsed.data.activityType
            : 'call',
          description: `[${parsed.data.activityType}] ${parsed.data.description}`,
        })
        if (fallback.error) return { error: fallback.error.message }
      } else {
        return { error: actErr.message }
      }
    }

    const leadPatch: Record<string, unknown> = {}
    if (parsed.data.nextFollowUpAt) {
      leadPatch.next_follow_up_at = toTimestamptz(parsed.data.nextFollowUpAt)
    }
    // Auto-advance new → contacted on first care touch
    if (lead.status === 'new' && parsed.data.activityType !== 'note') {
      leadPatch.status = 'contacted'
    }

    if (Object.keys(leadPatch).length > 0) {
      await supabase
        .from('leads')
        .update(leadPatch)
        .eq('id', parsed.data.leadId)
        .is('deleted_at', null)

      if (leadPatch.status === 'contacted') {
        await logActivity(supabase, {
          leadId: parsed.data.leadId,
          orgId: lead.org_id,
          userId: user.id,
          type: 'status_change',
          description: 'Tu dong: new → contacted sau lan cham soc dau.',
        })
      }
    }

    revalidatePath('/crm/leads')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Loi ghi nhat ky.' }
  }
}

/**
 * Chuyen hoa Lead -> Student (modal Enrolled).
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
    if (!currentUser) return { error: 'Ban chua dang nhap.' }

    let { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(
        'id, org_id, full_name, phone, email, status, converted_student_id, date_of_birth, gender, cccd, address, career_interest, interests, parent_name, parent_phone, parent_email, parent_relation, current_school, education_level, preferred_schedule, call_summary, notes'
      )
      .eq('id', values.leadId)
      .is('deleted_at', null)
      .maybeSingle()
    if (leadError && /column|42703/i.test(leadError.message)) {
      const legacy = await supabase
        .from('leads')
        .select('id, org_id, full_name, phone, status, converted_student_id, notes')
        .eq('id', values.leadId)
        .is('deleted_at', null)
        .maybeSingle()
      lead = legacy.data
        ? ({
            ...legacy.data,
            email: null,
            date_of_birth: null,
            gender: null,
            cccd: null,
            address: null,
            career_interest: null,
            interests: null,
            parent_name: null,
            parent_phone: null,
            parent_email: null,
            parent_relation: null,
            current_school: null,
            education_level: null,
            preferred_schedule: null,
            call_summary: null,
          } as typeof lead)
        : null
      leadError = legacy.error
    }
    if (leadError) return { error: `Lỗi đọc lead: ${leadError.message}` }
    if (!lead) {
      return { error: 'Lead không tồn tại hoặc bạn không có quyền trên lead này.' }
    }
    if (lead.converted_student_id) {
      return { error: 'Lead nay da duoc chuyen hoa thanh hoc sinh truoc do.' }
    }

    const phone = normalizePhone(lead.phone)
    const { data: existingStudent } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('org_id', lead.org_id)
      .eq('role', 'student')
      .eq('phone', phone)
      .is('deleted_at', null)
      .maybeSingle()
    if (existingStudent) {
      return {
        error: `SĐT da la hoc vien "${existingStudent.full_name}". Khong tao trung tai khoan.`,
      }
    }

    const { data: targetClass } = await supabase
      .from('classes')
      .select('id, org_id, name, status')
      .eq('id', values.classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!targetClass) {
      return { error: 'Lop hoc khong ton tai hoac khong thuoc pham vi cua ban.' }
    }
    if (targetClass.status === 'closed' || targetClass.status === 'cancelled') {
      return { error: 'Lop da dong/huy — khong the nhap hoc.' }
    }

    const admin = createAdminClient()
    const capacityError = await checkStudentCapacity(admin, lead.org_id, 1)
    if (capacityError) return { error: capacityError }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: values.email,
      password: values.password,
      email_confirm: true,
      user_metadata: { full_name: lead.full_name },
    })
    if (createError || !created.user) {
      return { error: `Loi tao tai khoan Auth: ${createError?.message ?? 'khong xac dinh'}` }
    }
    const studentId = created.user.id

    const rollback = async () => {
      try {
        await admin
          .from('profiles')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', studentId)
      } catch {
        /* ignore */
      }
      try {
        await admin.from('enrollments').update({ deleted_at: new Date().toISOString() }).eq('student_id', studentId)
      } catch {
        /* ignore */
      }
      try {
        await admin.auth.admin.deleteUser(studentId)
      } catch {
        /* ignore */
      }
    }

    const studentCode = await generateStudentCode(admin, lead.org_id)
    const newProfile: Record<string, unknown> = {
      id: studentId,
      full_name: lead.full_name,
      email: values.email,
      phone,
      role: 'student',
      org_id: lead.org_id,
      status: 'active',
      address: lead.address || null,
      date_of_birth: lead.date_of_birth || null,
      gender: lead.gender || null,
      cccd: lead.cccd || null,
      parent_name: lead.parent_name || null,
      parent_phone: lead.parent_phone || null,
      parent_email: lead.parent_email || null,
      parent_relation: lead.parent_relation || null,
      career_interest: lead.career_interest || null,
      interests: lead.interests || null,
      custom_metadata: {
        from_crm_lead_id: lead.id,
        current_school: lead.current_school || null,
        education_level: lead.education_level || null,
        preferred_schedule: lead.preferred_schedule || null,
        call_summary: lead.call_summary || null,
        crm_notes: lead.notes || null,
      },
    }
    const newProfileWithCode = studentCode
      ? { ...newProfile, student_code: studentCode }
      : newProfile
    let { error: profileError } = await admin.from('profiles').insert(newProfileWithCode)
    if (profileError && /student_code/i.test(profileError.message)) {
      const retry = await admin.from('profiles').insert(newProfile)
      profileError = retry.error
    }
    // Truoc migration 053: bo cot moi neu DB chua co
    if (profileError && /column|42703/i.test(profileError.message)) {
      const baseProfile = {
        id: studentId,
        full_name: lead.full_name,
        email: values.email,
        phone,
        role: 'student',
        org_id: lead.org_id,
        status: 'active',
        address: lead.address || null,
        ...(studentCode ? { student_code: studentCode } : {}),
      }
      const retry = await admin.from('profiles').insert(baseProfile)
      profileError = retry.error
    }
    if (profileError) {
      await rollback()
      return { error: `Loi tao ho so hoc sinh: ${profileError.message}` }
    }

    const { error: enrollError } = await admin.from('enrollments').insert({
      org_id: targetClass.org_id,
      class_id: targetClass.id,
      student_id: studentId,
      status: 'active',
    })
    if (enrollError) {
      await rollback()
      return { error: `Loi ghi danh vao lop: ${enrollError.message}` }
    }

    const { error: invoiceError } = await admin.from('invoices').insert({
      org_id: lead.org_id,
      student_id: studentId,
      amount: values.tuitionAmount,
      status: 'pending',
      due_date: values.dueDate || null,
      note: `Hoc phi nhap hoc - lop ${targetClass.name} (chuyen hoa tu CRM)`,
    })
    if (invoiceError) {
      await logActivity(supabase, {
        leadId: lead.id,
        orgId: lead.org_id,
        userId: currentUser.id,
        type: 'note',
        description: `Canh bao: tao hoa don that bai — ${invoiceError.message}`,
      })
      // Continue — student + enrollment already created
    }

    const { error: leadUpdateError } = await admin
      .from('leads')
      .update({
        status: 'enrolled',
        converted_student_id: studentId,
        lost_reason: null,
      })
      .eq('id', lead.id)
    if (leadUpdateError) {
      return {
        error: `Da chuyen hoa xong nhung khong cap nhat duoc trang thai lead: ${leadUpdateError.message}`,
      }
    }

    await logActivity(supabase, {
      leadId: lead.id,
      orgId: lead.org_id,
      userId: currentUser.id,
      type: 'status_change',
      description: `Chuyen doi thanh hoc vien + ghi danh lop "${targetClass.name}".`,
    })

    revalidatePath('/crm/leads')
    revalidatePath('/students')
    revalidatePath('/finance/invoices')
    return invoiceError
      ? {
          warning: `Hoc sinh da tao & ghi danh nhung KHONG tao duoc hoa don: ${invoiceError.message}`,
        }
      : {}
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Loi khong xac dinh khi chuyen hoa lead.',
    }
  }
}

export { SOURCE_LABELS }
