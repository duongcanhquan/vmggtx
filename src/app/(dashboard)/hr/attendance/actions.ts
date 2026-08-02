'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import {
  countStandardWorkdays,
  computeWorkedDays,
  parseWorkWeek,
  toDateKey,
  type WorkWeekDay,
  type WorkdayOverrideStatus,
} from '@/lib/hr/workdays'

export type LeaveType = 'annual' | 'unpaid' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type HrConfig = {
  annualLeaveDays: number
  workWeek: WorkWeekDay[]
  holidays: { date: string; name: string }[]
}

export type LeaveBalanceRow = {
  id: string
  profile_id: string
  profile_name: string
  year: number
  entitled_days: number
  used_days: number
  remaining_days: number
}

export type LeaveRequestRow = {
  id: string
  org_id: string
  profile_id: string
  profile_name: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days_count: number
  reason: string | null
  status: LeaveStatus
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export type TimesheetDay = {
  date: string
  label: 'work' | 'weekend' | 'holiday' | 'leave' | 'absent' | 'present' | 'remote'
  note?: string | null
}

export type MonthlyTimesheetRow = {
  profile_id: string
  profile_name: string
  year: number
  month: number
  standard_days: number
  leave_days: number
  worked_days: number
  days: TimesheetDay[]
}

export type StaffSalaryTermRow = {
  id: string
  profile_id: string
  profile_name: string
  monthly_base: number
  effective_from: string
  effective_to: string | null
}

export type StaffOption = { id: string; full_name: string; role: string }

function migHint(message: string): string {
  if (
    /hr_leave|hr_workday|staff_salary|does not exist|schema cache/i.test(message)
  ) {
    return 'Database chưa có bảng HR phép/công. Chạy supabase/migrations/067_hr_leave_workdays.sql trong SQL Editor.'
  }
  return message
}

type Scope =
  | { error: string }
  | {
      error?: undefined
      supabase: ReturnType<typeof createClient>
      userId: string
      orgIds: string[]
    }

async function requireHrAdmin(orgId: string): Promise<Scope> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  const role = profile?.role as string | undefined

  if (role === 'super_admin') {
    const orgIds = await getDescendantOrgIds(supabase, orgId)
    return {
      supabase,
      userId: user.id,
      orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
    }
  }

  if (role === 'accountant') {
    const auth = await isAuthorizedRpc(supabase, {
      p_user_id: user.id,
      p_target_org_id: orgId,
      p_required_role: 'accountant',
    })
    if (auth.error || auth.data !== true) {
      return { error: 'Bạn không có quyền quản lý ngày công & phép trong đơn vị này.' }
    }
    const orgIds = await getDescendantOrgIds(supabase, orgId)
    return {
      supabase,
      userId: user.id,
      orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
    }
  }

  for (const requiredRole of ['campus_admin', 'academic_staff'] as const) {
    const auth = await isAuthorizedRpc(supabase, {
      p_user_id: user.id,
      p_target_org_id: orgId,
      p_required_role: requiredRole,
      p_menu_key: 'hr_leave',
    })
    if (auth.data === true) {
      const orgIds = await getDescendantOrgIds(supabase, orgId)
      return {
        supabase,
        userId: user.id,
        orgIds: orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds],
      }
    }
  }

  return { error: 'Bạn không có quyền quản lý ngày công & phép trong đơn vị này.' }
}

function parseHrFromConfig(raw: unknown): { annualLeaveDays: number; workWeek: WorkWeekDay[] } {
  const cfg = raw as {
    hr?: { annual_leave_days?: unknown; work_week?: unknown }
    hr_annual_leave_days?: unknown
    hr_work_week?: unknown
  } | null
  const nested = cfg?.hr
  const annualRaw = nested?.annual_leave_days ?? cfg?.hr_annual_leave_days
  const weekRaw = nested?.work_week ?? cfg?.hr_work_week
  const annual =
    typeof annualRaw === 'number' && annualRaw >= 0 ? annualRaw : 12
  return {
    annualLeaveDays: annual,
    workWeek: parseWorkWeek(weekRaw),
  }
}

export async function getHrConfig(
  orgId: string | null,
  year?: number
): Promise<{ data: HrConfig | null; error?: string }> {
  if (!orgId) return { data: null }
  const y = year ?? new Date().getFullYear()
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { data: null, error: scope.error }

    const [{ data: settings }, { data: holidays, error: hErr }] = await Promise.all([
      scope.supabase
        .from('org_settings')
        .select('config')
        .eq('org_id', orgId)
        .maybeSingle(),
      scope.supabase
        .from('org_holidays')
        .select('holiday_date, name')
        .in('org_id', scope.orgIds)
        .gte('holiday_date', `${y}-01-01`)
        .lte('holiday_date', `${y}-12-31`)
        .is('deleted_at', null)
        .order('holiday_date'),
    ])

    if (hErr && /does not exist|schema cache/i.test(hErr.message)) {
      // org_holidays optional — continue without
    } else if (hErr) {
      return { data: null, error: hErr.message }
    }

    const parsed = parseHrFromConfig(settings?.config)
    return {
      data: {
        annualLeaveDays: parsed.annualLeaveDays,
        workWeek: parsed.workWeek,
        holidays: (holidays ?? []).map((h) => ({
          date: String(h.holiday_date).slice(0, 10),
          name: h.name as string,
        })),
      },
    }
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Lỗi tải cấu hình HR.',
    }
  }
}

export async function ensureLeaveBalance(
  orgId: string,
  profileId: string,
  year: number
): Promise<{ data?: LeaveBalanceRow; error?: string }> {
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const config = await getHrConfig(orgId, year)
    const entitled = config.data?.annualLeaveDays ?? 12

    const { data: existing, error: exErr } = await scope.supabase
      .from('hr_leave_balances')
      .select('id, profile_id, year, entitled_days, used_days')
      .eq('org_id', orgId)
      .eq('profile_id', profileId)
      .eq('year', year)
      .is('deleted_at', null)
      .maybeSingle()

    if (exErr) return { error: migHint(exErr.message) }

    if (existing) {
      const { data: prof } = await scope.supabase
        .from('profiles')
        .select('full_name')
        .eq('id', profileId)
        .maybeSingle()
      const entitledDays = Number(existing.entitled_days)
      const usedDays = Number(existing.used_days)
      return {
        data: {
          id: existing.id as string,
          profile_id: profileId,
          profile_name: (prof?.full_name as string) ?? '—',
          year,
          entitled_days: entitledDays,
          used_days: usedDays,
          remaining_days: Math.max(0, entitledDays - usedDays),
        },
      }
    }

    const { data: inserted, error } = await scope.supabase
      .from('hr_leave_balances')
      .insert({
        org_id: orgId,
        profile_id: profileId,
        year,
        entitled_days: entitled,
        used_days: 0,
      })
      .select('id, entitled_days, used_days')
      .maybeSingle()

    if (error) return { error: migHint(error.message) }
    if (!inserted) return { error: 'Không tạo được quỹ phép.' }

    const { data: prof } = await scope.supabase
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle()

    return {
      data: {
        id: inserted.id as string,
        profile_id: profileId,
        profile_name: (prof?.full_name as string) ?? '—',
        year,
        entitled_days: Number(inserted.entitled_days),
        used_days: 0,
        remaining_days: Number(inserted.entitled_days),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi khởi tạo quỹ phép.' }
  }
}

export async function listLeaveBalances(
  orgId: string | null,
  year: number
): Promise<{ data: LeaveBalanceRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data: staff } = await scope.supabase
      .from('profiles')
      .select('id, full_name')
      .in('org_id', scope.orgIds)
      .neq('role', 'student')
      .is('deleted_at', null)
      .order('full_name')
      .limit(500)

    const staffList = staff ?? []
    for (const s of staffList) {
      await ensureLeaveBalance(orgId, s.id as string, year)
    }

    const { data, error } = await scope.supabase
      .from('hr_leave_balances')
      .select('id, profile_id, year, entitled_days, used_days, profiles(full_name)')
      .eq('org_id', orgId)
      .eq('year', year)
      .is('deleted_at', null)
      .order('profile_id')

    if (error) return { data: [], error: migHint(error.message) }

    return {
      data: (data ?? []).map((row) => {
        const prof = row.profiles as { full_name?: string } | { full_name?: string }[] | null
        const name = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name
        const entitled = Number(row.entitled_days)
        const used = Number(row.used_days)
        return {
          id: row.id as string,
          profile_id: row.profile_id as string,
          profile_name: name ?? '—',
          year: row.year as number,
          entitled_days: entitled,
          used_days: used,
          remaining_days: Math.max(0, entitled - used),
        }
      }),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải quỹ phép.' }
  }
}

export async function listLeaveRequests(
  orgId: string | null,
  status?: LeaveStatus
): Promise<{ data: LeaveRequestRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    let query = scope.supabase
      .from('hr_leave_requests')
      .select(
        'id, org_id, profile_id, leave_type, start_date, end_date, days_count, reason, status, reviewed_at, review_note, created_at, profiles(full_name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return { data: [], error: migHint(error.message) }

    return {
      data: (data ?? []).map((row) => {
        const prof = row.profiles as { full_name?: string } | { full_name?: string }[] | null
        const name = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name
        return {
          id: row.id as string,
          org_id: row.org_id as string,
          profile_id: row.profile_id as string,
          profile_name: name ?? '—',
          leave_type: row.leave_type as LeaveType,
          start_date: String(row.start_date).slice(0, 10),
          end_date: String(row.end_date).slice(0, 10),
          days_count: Number(row.days_count),
          reason: (row.reason as string | null) ?? null,
          status: row.status as LeaveStatus,
          reviewed_at: (row.reviewed_at as string | null) ?? null,
          review_note: (row.review_note as string | null) ?? null,
          created_at: row.created_at as string,
        }
      }),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải đơn nghỉ.' }
  }
}

export async function reviewLeaveRequest(
  orgId: string,
  requestId: string,
  decision: 'approve' | 'reject',
  note?: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { data: req, error: rErr } = await scope.supabase
      .from('hr_leave_requests')
      .select('id, org_id, profile_id, leave_type, days_count, status, start_date')
      .eq('id', requestId)
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .maybeSingle()

    if (rErr) return { error: migHint(rErr.message) }
    if (!req) return { error: 'Không tìm thấy đơn nghỉ.' }
    if (req.status !== 'pending') return { error: 'Đơn không còn ở trạng thái chờ duyệt.' }

    const now = new Date().toISOString()
    const year = new Date(String(req.start_date)).getFullYear()

    if (decision === 'approve' && req.leave_type === 'annual') {
      const bal = await ensureLeaveBalance(orgId, req.profile_id as string, year)
      if (bal.error || !bal.data) return { error: bal.error ?? 'Không đọc được quỹ phép.' }
      const days = Number(req.days_count)
      if (bal.data.remaining_days < days) {
        return {
          error: `Quỹ phép không đủ (còn ${bal.data.remaining_days} ngày, đơn ${days} ngày).`,
        }
      }

      const newUsed = bal.data.used_days + days
      const { error: bErr } = await scope.supabase
        .from('hr_leave_balances')
        .update({ used_days: newUsed })
        .eq('id', bal.data.id)
        .is('deleted_at', null)

      if (bErr) return { error: migHint(bErr.message) }
    }

    const { error } = await scope.supabase
      .from('hr_leave_requests')
      .update({
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewed_by: scope.userId,
        reviewed_at: now,
        review_note: note?.trim() || null,
      })
      .eq('id', requestId)
      .eq('status', 'pending')

    if (error) return { error: migHint(error.message) }

    revalidatePath('/hr/attendance')
    revalidatePath('/hr/my-leave')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi duyệt đơn.' }
  }
}

function buildTimesheetForProfile(input: {
  profileId: string
  profileName: string
  year: number
  month: number
  workWeek: WorkWeekDay[]
  holidaySet: Set<string>
  leaves: { start_date: string; end_date: string; days_count: number }[]
  overrides: { work_date: string; status: WorkdayOverrideStatus; note: string | null }[]
}): MonthlyTimesheetRow {
  const { year, month, workWeek, holidaySet } = input
  const standardDays = countStandardWorkdays(year, month, workWeek, holidaySet)
  const last = new Date(year, month, 0).getDate()

  const overrideMap = new Map(
    input.overrides.map((o) => [String(o.work_date).slice(0, 10), o])
  )

  const leaveRanges = input.leaves.map((l) => ({
    start: String(l.start_date).slice(0, 10),
    end: String(l.end_date).slice(0, 10),
  }))

  function inLeave(dateKey: string): boolean {
    return leaveRanges.some((r) => dateKey >= r.start && dateKey <= r.end)
  }

  let leaveDaysInMonth = 0
  const days: TimesheetDay[] = []

  for (let d = 1; d <= last; d++) {
    const date = new Date(year, month - 1, d)
    const key = toDateKey(date)
    const dow = date.getDay() as WorkWeekDay
    const override = overrideMap.get(key)

    if (!workWeek.includes(dow)) {
      days.push({ date: key, label: 'weekend' })
      continue
    }
    if (holidaySet.has(key)) {
      days.push({ date: key, label: 'holiday' })
      continue
    }

    if (override) {
      const label =
        override.status === 'present'
          ? 'present'
          : override.status === 'remote'
            ? 'remote'
            : override.status === 'absent'
              ? 'absent'
              : override.status === 'leave'
                ? 'leave'
                : 'holiday'
      days.push({ date: key, label, note: override.note })
      if (override.status === 'leave') leaveDaysInMonth += 1
      continue
    }

    if (inLeave(key)) {
      days.push({ date: key, label: 'leave' })
      leaveDaysInMonth += 1
      continue
    }

    days.push({ date: key, label: 'work' })
  }

  const workedDays = computeWorkedDays({
    standardDays,
    leaveDaysInMonth,
    overrides: input.overrides.map((o) => ({ status: o.status })),
  })

  return {
    profile_id: input.profileId,
    profile_name: input.profileName,
    year,
    month,
    standard_days: standardDays,
    leave_days: leaveDaysInMonth,
    worked_days: workedDays,
    days,
  }
}

export async function listMonthlyTimesheet(
  orgId: string | null,
  year: number,
  month: number,
  profileId?: string
): Promise<{ data: MonthlyTimesheetRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  if (month < 1 || month > 12) return { data: [], error: 'Tháng không hợp lệ.' }

  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const configRes = await getHrConfig(orgId, year)
    const workWeek = configRes.data?.workWeek ?? parseWorkWeek(null)
    const holidaySet = new Set(
      (configRes.data?.holidays ?? []).map((h) => h.date)
    )

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    let staffQuery = scope.supabase
      .from('profiles')
      .select('id, full_name')
      .in('org_id', scope.orgIds)
      .neq('role', 'student')
      .is('deleted_at', null)
      .order('full_name')
      .limit(200)

    if (profileId) staffQuery = staffQuery.eq('id', profileId)

    const { data: staff, error: sErr } = await staffQuery
    if (sErr) return { data: [], error: sErr.message }

    const staffList = staff ?? []
    if (staffList.length === 0) return { data: [] }

    const profileIds = staffList.map((s) => s.id as string)

    const [{ data: leaves, error: lErr }, { data: overrides, error: oErr }] =
      await Promise.all([
        scope.supabase
          .from('hr_leave_requests')
          .select('profile_id, start_date, end_date, days_count')
          .in('org_id', scope.orgIds)
          .in('profile_id', profileIds)
          .eq('status', 'approved')
          .lte('start_date', monthEnd)
          .gte('end_date', monthStart)
          .is('deleted_at', null),
        scope.supabase
          .from('hr_workday_overrides')
          .select('profile_id, work_date, status, note')
          .in('org_id', scope.orgIds)
          .in('profile_id', profileIds)
          .gte('work_date', monthStart)
          .lte('work_date', monthEnd)
          .is('deleted_at', null),
      ])

    if (lErr) return { data: [], error: migHint(lErr.message) }
    if (oErr) return { data: [], error: migHint(oErr.message) }

    const leavesByProfile = new Map<string, typeof leaves>()
    for (const l of leaves ?? []) {
      const pid = l.profile_id as string
      if (!leavesByProfile.has(pid)) leavesByProfile.set(pid, [])
      leavesByProfile.get(pid)!.push(l)
    }

    const overridesByProfile = new Map<string, typeof overrides>()
    for (const o of overrides ?? []) {
      const pid = o.profile_id as string
      if (!overridesByProfile.has(pid)) overridesByProfile.set(pid, [])
      overridesByProfile.get(pid)!.push(o)
    }

    const rows = staffList.map((s) =>
      buildTimesheetForProfile({
        profileId: s.id as string,
        profileName: s.full_name as string,
        year,
        month,
        workWeek,
        holidaySet,
        leaves: (leavesByProfile.get(s.id as string) ?? []).map((l) => ({
          start_date: String(l.start_date),
          end_date: String(l.end_date),
          days_count: Number(l.days_count),
        })),
        overrides: (overridesByProfile.get(s.id as string) ?? []).map((o) => ({
          work_date: String(o.work_date),
          status: o.status as WorkdayOverrideStatus,
          note: (o.note as string | null) ?? null,
        })),
      })
    )

    return { data: rows }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải bảng công.',
    }
  }
}

export async function upsertWorkdayOverride(
  orgId: string,
  input: {
    profileId: string
    workDate: string
    status: WorkdayOverrideStatus
    note?: string
  }
): Promise<{ error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) {
    return { error: 'Ngày không hợp lệ.' }
  }

  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const { data: existing } = await scope.supabase
      .from('hr_workday_overrides')
      .select('id')
      .eq('org_id', orgId)
      .eq('profile_id', input.profileId)
      .eq('work_date', input.workDate)
      .is('deleted_at', null)
      .maybeSingle()

    const payload = {
      org_id: orgId,
      profile_id: input.profileId,
      work_date: input.workDate,
      status: input.status,
      note: input.note?.trim() || null,
    }

    if (existing?.id) {
      const { error } = await scope.supabase
        .from('hr_workday_overrides')
        .update(payload)
        .eq('id', existing.id)
      if (error) return { error: migHint(error.message) }
    } else {
      const { error } = await scope.supabase.from('hr_workday_overrides').insert(payload)
      if (error) return { error: migHint(error.message) }
    }

    revalidatePath('/hr/attendance')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu override.' }
  }
}

export async function listStaffSalaryTerms(
  orgId: string | null
): Promise<{ data: StaffSalaryTermRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('staff_salary_terms')
      .select(
        'id, profile_id, monthly_base, effective_from, effective_to, profiles(full_name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .is('effective_to', null)
      .order('effective_from', { ascending: false })
      .limit(200)

    if (error) return { data: [], error: migHint(error.message) }

    return {
      data: (data ?? []).map((row) => {
        const prof = row.profiles as { full_name?: string } | { full_name?: string }[] | null
        const name = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name
        return {
          id: row.id as string,
          profile_id: row.profile_id as string,
          profile_name: name ?? '—',
          monthly_base: Number(row.monthly_base),
          effective_from: String(row.effective_from).slice(0, 10),
          effective_to: (row.effective_to as string | null)
            ? String(row.effective_to).slice(0, 10)
            : null,
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lương văn phòng.',
    }
  }
}

export async function upsertStaffSalaryTerm(
  orgId: string,
  input: {
    profileId: string
    monthlyBase: number
    effectiveFrom?: string
    id?: string
  }
): Promise<{ error?: string }> {
  if (input.monthlyBase < 0) return { error: 'Lương tháng không được âm.' }

  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const effectiveFrom = input.effectiveFrom ?? new Date().toISOString().slice(0, 10)

    if (input.id) {
      const { error } = await scope.supabase
        .from('staff_salary_terms')
        .update({
          monthly_base: input.monthlyBase,
          effective_from: effectiveFrom,
        })
        .eq('id', input.id)
        .in('org_id', scope.orgIds)
        .is('deleted_at', null)
      if (error) return { error: migHint(error.message) }
    } else {
      await scope.supabase
        .from('staff_salary_terms')
        .update({ effective_to: effectiveFrom })
        .eq('org_id', orgId)
        .eq('profile_id', input.profileId)
        .is('effective_to', null)
        .is('deleted_at', null)

      const { error } = await scope.supabase.from('staff_salary_terms').insert({
        org_id: orgId,
        profile_id: input.profileId,
        monthly_base: input.monthlyBase,
        effective_from: effectiveFrom,
      })
      if (error) return { error: migHint(error.message) }
    }

    revalidatePath('/hr/attendance')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu lương.' }
  }
}

export async function listHrStaff(
  orgId: string | null
): Promise<{ data: StaffOption[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireHrAdmin(orgId)
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('org_id', scope.orgIds)
      .neq('role', 'student')
      .is('deleted_at', null)
      .order('full_name')
      .limit(300)

    if (error) return { data: [], error: error.message }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        full_name: r.full_name as string,
        role: r.role as string,
      })),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải nhân sự.' }
  }
}
