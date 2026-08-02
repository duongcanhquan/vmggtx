'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import {
  countLeaveDaysInRange,
  parseWorkWeek,
  type WorkWeekDay,
} from '@/lib/hr/workdays'
import type { LeaveBalanceRow, LeaveRequestRow, LeaveType } from '../attendance/actions'

const STAFF_ROLES = [
  'super_admin',
  'campus_admin',
  'academic_staff',
  'admission_staff',
  'accountant',
  'teacher',
] as const

function migHint(message: string): string {
  if (
    /hr_leave|hr_workday|staff_salary|does not exist|schema cache/i.test(message)
  ) {
    return 'Database chưa có bảng HR phép/công. Chạy supabase/migrations/067_hr_leave_workdays.sql trong SQL Editor.'
  }
  return message
}

type SelfScope =
  | { error: string }
  | {
      error?: undefined
      supabase: ReturnType<typeof createClient>
      userId: string
      orgId: string
      role: string
    }

async function requireStaffSelf(): Promise<SelfScope> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!profile?.org_id) return { error: 'Tài khoản chưa gắn cơ sở.' }
  if (!STAFF_ROLES.includes(profile.role as (typeof STAFF_ROLES)[number])) {
    return { error: 'Chức năng này không dành cho học viên.' }
  }

  return {
    supabase,
    userId: user.id,
    orgId: profile.org_id as string,
    role: profile.role as string,
  }
}

async function getWorkConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  year: number
): Promise<{ workWeek: WorkWeekDay[]; holidayDates: Set<string>; annualLeaveDays: number }> {
  const orgIds = await getDescendantOrgIds(supabase, orgId)
  const scopeIds = orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds]

  const [{ data: settings }, { data: holidays }] = await Promise.all([
    supabase.from('org_settings').select('config').eq('org_id', orgId).maybeSingle(),
    supabase
      .from('org_holidays')
      .select('holiday_date')
      .in('org_id', scopeIds)
      .gte('holiday_date', `${year}-01-01`)
      .lte('holiday_date', `${year}-12-31`)
      .is('deleted_at', null),
  ])

  const cfg = settings?.config as { hr?: { annual_leave_days?: number; work_week?: unknown } } | null
  const annual =
    typeof cfg?.hr?.annual_leave_days === 'number' && cfg.hr.annual_leave_days >= 0
      ? cfg.hr.annual_leave_days
      : 12

  return {
    workWeek: parseWorkWeek(cfg?.hr?.work_week),
    holidayDates: new Set(
      (holidays ?? []).map((h) => String(h.holiday_date).slice(0, 10))
    ),
    annualLeaveDays: annual,
  }
}

export async function getMyLeaveBalance(
  year?: number
): Promise<{ data: LeaveBalanceRow | null; error?: string }> {
  const y = year ?? new Date().getFullYear()
  try {
    const scope = await requireStaffSelf()
    if (scope.error !== undefined) return { data: null, error: scope.error }

    const { data: existing, error: exErr } = await scope.supabase
      .from('hr_leave_balances')
      .select('id, profile_id, year, entitled_days, used_days')
      .eq('org_id', scope.orgId)
      .eq('profile_id', scope.userId)
      .eq('year', y)
      .is('deleted_at', null)
      .maybeSingle()

    if (exErr) return { data: null, error: migHint(exErr.message) }

    const config = await getWorkConfig(scope.supabase, scope.orgId, y)

    if (!existing) {
      const { data: inserted, error } = await scope.supabase
        .from('hr_leave_balances')
        .insert({
          org_id: scope.orgId,
          profile_id: scope.userId,
          year: y,
          entitled_days: config.annualLeaveDays,
          used_days: 0,
        })
        .select('id, entitled_days, used_days')
        .maybeSingle()

      if (error) return { data: null, error: migHint(error.message) }
      if (!inserted) return { data: null, error: 'Không tạo được quỹ phép.' }

      const { data: prof } = await scope.supabase
        .from('profiles')
        .select('full_name')
        .eq('id', scope.userId)
        .maybeSingle()

      const entitled = Number(inserted.entitled_days)
      return {
        data: {
          id: inserted.id as string,
          profile_id: scope.userId,
          profile_name: (prof?.full_name as string) ?? '—',
          year: y,
          entitled_days: entitled,
          used_days: 0,
          remaining_days: entitled,
        },
      }
    }

    const { data: prof } = await scope.supabase
      .from('profiles')
      .select('full_name')
      .eq('id', scope.userId)
      .maybeSingle()

    const entitled = Number(existing.entitled_days)
    const used = Number(existing.used_days)
    return {
      data: {
        id: existing.id as string,
        profile_id: scope.userId,
        profile_name: (prof?.full_name as string) ?? '—',
        year: y,
        entitled_days: entitled,
        used_days: used,
        remaining_days: Math.max(0, entitled - used),
      },
    }
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Lỗi tải quỹ phép.',
    }
  }
}

export async function listMyLeaveRequests(): Promise<{
  data: LeaveRequestRow[]
  error?: string
}> {
  try {
    const scope = await requireStaffSelf()
    if (scope.error !== undefined) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('hr_leave_requests')
      .select(
        'id, org_id, profile_id, leave_type, start_date, end_date, days_count, reason, status, reviewed_at, review_note, created_at, profiles(full_name)'
      )
      .eq('profile_id', scope.userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return { data: [], error: migHint(error.message) }

    const { data: prof } = await scope.supabase
      .from('profiles')
      .select('full_name')
      .eq('id', scope.userId)
      .maybeSingle()
    const myName = (prof?.full_name as string) ?? '—'

    return {
      data: (data ?? []).map((row) => ({
        id: row.id as string,
        org_id: row.org_id as string,
        profile_id: row.profile_id as string,
        profile_name: myName,
        leave_type: row.leave_type as LeaveType,
        start_date: String(row.start_date).slice(0, 10),
        end_date: String(row.end_date).slice(0, 10),
        days_count: Number(row.days_count),
        reason: (row.reason as string | null) ?? null,
        status: row.status as LeaveRequestRow['status'],
        reviewed_at: (row.reviewed_at as string | null) ?? null,
        review_note: (row.review_note as string | null) ?? null,
        created_at: row.created_at as string,
      })),
    }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Lỗi tải đơn nghỉ.' }
  }
}

export async function createLeaveRequest(input: {
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason?: string
}): Promise<{ error?: string; id?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return { error: 'Ngày không hợp lệ.' }
  }
  if (input.endDate < input.startDate) {
    return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' }
  }

  try {
    const scope = await requireStaffSelf()
    if (scope.error !== undefined) return { error: scope.error }

    const year = new Date(input.startDate + 'T00:00:00').getFullYear()
    const config = await getWorkConfig(scope.supabase, scope.orgId, year)
    const daysCount = countLeaveDaysInRange(
      input.startDate,
      input.endDate,
      config.workWeek,
      config.holidayDates
    )

    if (daysCount <= 0) {
      return { error: 'Khoảng nghỉ không có ngày làm việc hợp lệ (cuối tuần/lễ).' }
    }

    if (input.leaveType === 'annual') {
      const bal = await getMyLeaveBalance(year)
      if (bal.error || !bal.data) return { error: bal.error ?? 'Không đọc được quỹ phép.' }
      if (bal.data.remaining_days < daysCount) {
        return {
          error: `Quỹ phép không đủ (còn ${bal.data.remaining_days} ngày).`,
        }
      }
    }

    const { data, error } = await scope.supabase
      .from('hr_leave_requests')
      .insert({
        org_id: scope.orgId,
        profile_id: scope.userId,
        leave_type: input.leaveType,
        start_date: input.startDate,
        end_date: input.endDate,
        days_count: daysCount,
        reason: input.reason?.trim() || null,
        status: 'pending',
      })
      .select('id')
      .maybeSingle()

    if (error) return { error: migHint(error.message) }
    if (!data?.id) return { error: 'Không tạo được đơn nghỉ.' }

    revalidatePath('/hr/my-leave')
    revalidatePath('/hr/attendance')
    return { id: data.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi tạo đơn nghỉ.' }
  }
}

export async function cancelLeaveRequest(requestId: string): Promise<{ error?: string }> {
  try {
    const scope = await requireStaffSelf()
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await scope.supabase
      .from('hr_leave_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('profile_id', scope.userId)
      .eq('status', 'pending')
      .is('deleted_at', null)

    if (error) return { error: migHint(error.message) }

    revalidatePath('/hr/my-leave')
    revalidatePath('/hr/attendance')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi hủy đơn.' }
  }
}
