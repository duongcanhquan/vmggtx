'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { scheduleSessionSchema, zodFail } from '@/lib/validation/schemas'
import { z } from 'zod'
import {
  DEFAULT_SCHEDULE_SLOTS,
  localDateKey,
  normalizeScheduleSlots,
  startOfWeekMonday,
  type ScheduleSlot,
} from '@/lib/schedule/slots'
import {
  buildAutoPreview,
  type AutoBusy,
  type AutoPlanInput,
} from '@/lib/schedule/autoScheduler'

export type ScheduleClassOption = {
  id: string
  name: string
  org_id: string
  org_name: string
  teacher_id: string | null
  teacher_name: string
}

export type ScheduleTeacherOption = {
  id: string
  full_name: string
}

export type ScheduleFacilityOption = {
  id: string
  name: string
  type: string
}

export type UpcomingSessionRow = {
  id: string
  class_name: string
  teacher_name: string
  room: string | null
  start_time: string
  end_time: string
  is_substitute: boolean
}

async function getOrgSubtreeIds(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_descendant_org_ids', {
    p_org_id: orgId,
  })
  if (error) return [orgId]
  const ids = (data ?? []) as string[]
  return ids.includes(orgId) ? ids : [orgId, ...ids]
}

async function requireScheduleAccess(orgId: string): Promise<
  | { supabase: ReturnType<typeof createClient>; userId: string; orgIds: string[] }
  | { error: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const auth = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
    p_menu_key: 'staff_ops',
  })
  if (auth.error || auth.data !== true) {
    return { error: 'Bạn không có quyền xếp lịch trong đơn vị này.' }
  }

  return {
    supabase,
    userId: user.id,
    orgIds: await getOrgSubtreeIds(supabase, orgId),
  }
}

/** Lớp trong subtree — để chọn khi xếp lịch. */
export async function getScheduleClasses(
  orgId: string | null
): Promise<{ data: ScheduleClassOption[]; error?: string }> {
  if (!orgId) return { data: [], error: 'Chưa chọn tổ chức.' }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('classes')
      .select(
        'id, name, org_id, teacher_id, profiles(full_name), organizations(name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('name')

    if (error) return { data: [], error: error.message }

    return {
      data: (data ?? []).map((row) => {
        const teacher = row.profiles as
          | { full_name?: string }
          | { full_name?: string }[]
          | null
        const org = row.organizations as
          | { name?: string }
          | { name?: string }[]
          | null
        return {
          id: row.id,
          name: row.name,
          org_id: row.org_id,
          org_name: Array.isArray(org)
            ? org[0]?.name ?? '—'
            : org?.name ?? '—',
          teacher_id: row.teacher_id,
          teacher_name: Array.isArray(teacher)
            ? teacher[0]?.full_name ?? 'Chưa gán'
            : teacher?.full_name ?? 'Chưa gán',
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lớp.',
    }
  }
}

/** GV trong subtree. */
export async function getScheduleTeachers(
  orgId: string | null
): Promise<{ data: ScheduleTeacherOption[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'teacher')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('full_name')

    if (error) return { data: [], error: error.message }
    return { data: (data ?? []).map((t) => ({ id: t.id, full_name: t.full_name })) }
  } catch {
    return { data: [] }
  }
}

/** Buổi sắp tới (14 ngày) trong subtree — xem nhanh. */
export async function getUpcomingSessions(
  orgId: string | null
): Promise<{ data: UpcomingSessionRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const now = new Date()
    const until = new Date(now.getTime() + 14 * 24 * 3600 * 1000)

    const { data, error } = await scope.supabase
      .from('class_sessions')
      .select(
        'id, room, start_time, end_time, teacher_id, substitute_teacher_id, classes(name), profiles!class_sessions_teacher_id_fkey(full_name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .gte('start_time', now.toISOString())
      .lt('start_time', until.toISOString())
      .order('start_time')
      .limit(40)

    if (error) {
      // Cột substitute có thể chưa có trên DB cũ
      if (/substitute|42703|column/i.test(error.message)) {
        const legacy = await scope.supabase
          .from('class_sessions')
          .select(
            'id, room, start_time, end_time, teacher_id, classes(name), profiles!class_sessions_teacher_id_fkey(full_name)'
          )
          .in('org_id', scope.orgIds)
          .is('deleted_at', null)
          .gte('start_time', now.toISOString())
          .lt('start_time', until.toISOString())
          .order('start_time')
          .limit(40)
        if (legacy.error) return { data: [], error: legacy.error.message }
        return {
          data: (legacy.data ?? []).map((row) => mapUpcoming(row, false)),
        }
      }
      return { data: [], error: error.message }
    }

    return {
      data: (data ?? []).map((row) =>
        mapUpcoming(row, Boolean(row.substitute_teacher_id))
      ),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lịch.',
    }
  }
}

function mapUpcoming(
  row: Record<string, unknown>,
  isSubstitute: boolean
): UpcomingSessionRow {
  const cls = row.classes as { name?: string } | { name?: string }[] | null
  const teacher = row.profiles as
    | { full_name?: string }
    | { full_name?: string }[]
    | null
  return {
    id: String(row.id),
    class_name: Array.isArray(cls)
      ? cls[0]?.name ?? '—'
      : cls?.name ?? '—',
    teacher_name: Array.isArray(teacher)
      ? teacher[0]?.full_name ?? '—'
      : teacher?.full_name ?? '—',
    room: (row.room as string | null) ?? null,
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    is_substitute: isSubstitute,
  }
}

async function assertClassInSubtree(
  supabase: ReturnType<typeof createClient>,
  classId: string,
  orgIds: string[]
): Promise<{ org_id: string } | { error: string }> {
  const { data: cls, error } = await supabase
    .from('classes')
    .select('id, org_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!cls) return { error: 'Lớp không tồn tại.' }
  if (!orgIds.includes(cls.org_id)) {
    return { error: 'Lớp không thuộc phạm vi đơn vị đang chọn.' }
  }
  return { org_id: cls.org_id }
}

async function insertOneSession(
  supabase: ReturnType<typeof createClient>,
  args: {
    orgId: string
    classId: string
    teacherId: string
    room: string
    /** P3: CSVC — nullable; room text vẫn giữ */
    facilityId?: string | null
    startISO: string
    endISO: string
  }
): Promise<{ error?: string }> {
  if (args.teacherId || args.room) {
    const { data: hasConflict } = await supabase.rpc('check_schedule_conflict', {
      p_teacher_id: args.teacherId || null,
      p_room: args.room || null,
      p_start_time: args.startISO,
      p_end_time: args.endISO,
    })
    if (hasConflict === true) {
      return {
        error: `TRÙNG LỊCH: ${new Date(args.startISO).toLocaleString('vi-VN')} — GV hoặc phòng đã có buổi khác.`,
      }
    }
  }

  const payload: Record<string, unknown> = {
    org_id: args.orgId,
    class_id: args.classId,
    teacher_id: args.teacherId || null,
    room: args.room || null,
    start_time: args.startISO,
    end_time: args.endISO,
  }
  if (args.facilityId) {
    payload.facility_id = args.facilityId
  }

  const { error } = await supabase.from('class_sessions').insert(payload)
  if (error) {
    if (/facility_id|does not exist|schema cache/i.test(error.message)) {
      // Migration 060 chưa chạy — fallback không gắn facility
      delete payload.facility_id
      const retry = await supabase.from('class_sessions').insert(payload)
      if (retry.error) return { error: retry.error.message }
      return {}
    }
    return { error: error.message }
  }
  return {}
}

/** Phòng CSVC trong subtree (P3) — dropdown xếp lịch. */
export async function getScheduleFacilities(
  orgId: string | null
): Promise<{ data: ScheduleFacilityOption[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('facilities')
      .select('id, name, type, org_id')
      .in('org_id', scope.orgIds)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')

    if (error) {
      if (/facilities|does not exist/i.test(error.message)) {
        return { data: [] }
      }
      return { data: [], error: error.message }
    }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        type: String(r.type ?? 'room'),
      })),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải phòng CSVC.',
    }
  }
}

/** Xếp 1 buổi (dashboard — theo org đang chọn). */
export async function createScheduleSession(
  orgId: string,
  formData: FormData
): Promise<{ error?: string; created?: number }> {
  const facilityIdRaw = String(formData.get('facilityId') ?? '').trim()
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
  const facilityId =
    facilityIdRaw &&
    /^[0-9a-f-]{36}$/i.test(facilityIdRaw)
      ? facilityIdRaw
      : null
  const startISO = new Date(`${date}T${startTime}:00`).toISOString()
  const endISO = new Date(`${date}T${endTime}:00`).toISOString()

  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope

    const ownership = await assertClassInSubtree(
      scope.supabase,
      classId,
      scope.orgIds
    )
    if ('error' in ownership) return ownership

    const { data: isHoliday, error: holErr } = await scope.supabase.rpc(
      'is_org_holiday',
      {
        p_org_id: ownership.org_id,
        p_date: date,
      }
    )
    if (!holErr && isHoliday === true) {
      return {
        error: `Ngày ${date} là ngày nghỉ của cơ sở — không xếp buổi học.`,
      }
    }

    const result = await insertOneSession(scope.supabase, {
      orgId: ownership.org_id,
      classId,
      teacherId: teacherId || '',
      room: room || '',
      facilityId,
      startISO,
      endISO,
    })
    if (result.error) return result

    revalidatePath('/academic/schedule')
    revalidatePath('/teacher/schedule')
    revalidatePath('/staff/classes')
    revalidatePath('/staff/timetable')
    return { created: 1 }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xếp lịch.' }
  }
}

const recurringSchema = z
  .object({
    classId: z.string().uuid('Thiếu lớp học.'),
    teacherId: z.string().trim().optional().default(''),
    room: z.string().trim().max(50).optional().default(''),
    facilityId: z.string().uuid().optional().nullable(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ bắt đầu HH:mm.'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Giờ kết thúc HH:mm.'),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu không hợp lệ.'),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày kết thúc không hợp lệ.'),
    /** JS getDay(): 0=CN … 6=T7. UI gửi T2=1 … CN=0 */
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Chọn ít nhất một thứ trong tuần.'),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu.',
    path: ['endTime'],
  })
  .refine((d) => d.toDate >= d.fromDate, {
    message: 'Khoảng ngày không hợp lệ.',
    path: ['toDate'],
  })

/**
 * Xếp lịch tuần lặp: mọi ngày khớp weekdays trong [fromDate, toDate].
 * Tối đa 60 buổi / lần để tránh spam.
 */
export async function createRecurringSchedule(
  orgId: string,
  input: z.input<typeof recurringSchema>
): Promise<{
  error?: string
  created?: number
  skipped?: number
  skippedHoliday?: number
}> {
  const parsed = recurringSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const {
    classId,
    teacherId,
    room,
    facilityId,
    startTime,
    endTime,
    fromDate,
    toDate,
    weekdays,
  } = parsed.data

  const daySet = new Set(weekdays)
  const from = new Date(`${fromDate}T00:00:00`)
  const to = new Date(`${toDate}T00:00:00`)
  const spanDays =
    Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000)) + 1
  if (spanDays > 120) {
    return { error: 'Khoảng lặp tối đa 120 ngày. Hãy chia nhỏ.' }
  }

  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope

    const ownership = await assertClassInSubtree(
      scope.supabase,
      classId,
      scope.orgIds
    )
    if ('error' in ownership) return ownership

    const slots: { startISO: string; endISO: string; dateStr: string }[] = []
    const cursor = new Date(from)
    while (cursor <= to) {
      if (daySet.has(cursor.getDay())) {
        const dateStr = localDateKey(cursor)
        slots.push({
          dateStr,
          startISO: new Date(`${dateStr}T${startTime}:00`).toISOString(),
          endISO: new Date(`${dateStr}T${endTime}:00`).toISOString(),
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    if (slots.length === 0) {
      return { error: 'Không có ngày nào khớp thứ đã chọn trong khoảng.' }
    }
    if (slots.length > 60) {
      return {
        error: `Sẽ tạo ${slots.length} buổi (>60). Thu hẹp khoảng hoặc bỏ bớt thứ.`,
      }
    }

    let created = 0
    let skipped = 0
    let skippedHoliday = 0
    for (const slot of slots) {
      const { data: isHoliday, error: holErr } = await scope.supabase.rpc(
        'is_org_holiday',
        {
          p_org_id: ownership.org_id,
          p_date: slot.dateStr,
        }
      )
      if (!holErr && isHoliday === true) {
        skippedHoliday += 1
        continue
      }

      const result = await insertOneSession(scope.supabase, {
        orgId: ownership.org_id,
        classId,
        teacherId: teacherId || '',
        room: room || '',
        facilityId: facilityId || null,
        startISO: slot.startISO,
        endISO: slot.endISO,
      })
      if (result.error) {
        if (/TRÙNG LỊCH/i.test(result.error)) skipped += 1
        else return { error: result.error, created, skipped, skippedHoliday }
      } else {
        created += 1
      }
    }

    revalidatePath('/academic/schedule')
    revalidatePath('/teacher/schedule')
    revalidatePath('/staff/classes')
    revalidatePath('/staff/timetable')
    return { created, skipped, skippedHoliday }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Lỗi xếp lịch lặp.',
    }
  }
}

// ---------- Holidays / slots / week / auto (D24) ----------

function migrationHint(message: string, file: string): string {
  if (/does not exist|schema cache|org_holidays|class_schedule|is_org_holiday/i.test(message)) {
    return `Database thiếu bảng/hàm TKB. Chạy migration ${file} trong Supabase SQL Editor.`
  }
  return message
}

export type OrgHolidayRow = {
  id: string
  org_id: string
  holiday_date: string
  name: string
  holiday_type: 'holiday' | 'break'
}

export async function listOrgHolidays(
  orgId: string | null
): Promise<{ data: OrgHolidayRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('org_holidays')
      .select('id, org_id, holiday_date, name, holiday_type')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('holiday_date')

    if (error) {
      return { data: [], error: migrationHint(error.message, '057_org_holidays.sql') }
    }
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        holiday_date: String(r.holiday_date).slice(0, 10),
        name: r.name as string,
        holiday_type: (r.holiday_type as 'holiday' | 'break') ?? 'holiday',
      })),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải ngày nghỉ.',
    }
  }
}

export async function upsertOrgHoliday(
  orgId: string,
  input: {
    id?: string
    holidayDate: string
    name: string
    holidayType: 'holiday' | 'break'
  }
): Promise<{ error?: string }> {
  const name = input.name.trim()
  if (!name) return { error: 'Nhập tên ngày nghỉ.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.holidayDate)) {
    return { error: 'Ngày không hợp lệ.' }
  }

  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope

    if (input.id) {
      const { error } = await scope.supabase
        .from('org_holidays')
        .update({
          holiday_date: input.holidayDate,
          name,
          holiday_type: input.holidayType,
        })
        .eq('id', input.id)
        .is('deleted_at', null)
      if (error) return { error: migrationHint(error.message, '057_org_holidays.sql') }
    } else {
      const { error } = await scope.supabase.from('org_holidays').insert({
        org_id: orgId,
        holiday_date: input.holidayDate,
        name,
        holiday_type: input.holidayType,
      })
      if (error) {
        if (/uq_org_holidays|duplicate/i.test(error.message)) {
          return { error: 'Đã có ngày nghỉ trùng trong cơ sở này.' }
        }
        return { error: migrationHint(error.message, '057_org_holidays.sql') }
      }
    }
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu ngày nghỉ.' }
  }
}

export async function deleteOrgHoliday(
  orgId: string,
  holidayId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope
    const { error } = await scope.supabase
      .from('org_holidays')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', holidayId)
      .is('deleted_at', null)
    if (error) return { error: migrationHint(error.message, '057_org_holidays.sql') }
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xóa ngày nghỉ.' }
  }
}

export async function getScheduleSlots(
  orgId: string | null
): Promise<{ data: ScheduleSlot[]; error?: string }> {
  if (!orgId) return { data: DEFAULT_SCHEDULE_SLOTS }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: DEFAULT_SCHEDULE_SLOTS, error: scope.error }

    const admin = createAdminClient()
    const { data } = await admin
      .from('org_settings')
      .select('config')
      .eq('org_id', orgId)
      .maybeSingle()

    const config = (data?.config ?? {}) as Record<string, unknown>
    return { data: normalizeScheduleSlots(config.schedule_slots) }
  } catch {
    return { data: DEFAULT_SCHEDULE_SLOTS }
  }
}

export async function saveScheduleSlots(
  orgId: string,
  slots: ScheduleSlot[]
): Promise<{ error?: string }> {
  const normalized = normalizeScheduleSlots(slots)
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope

    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('org_settings')
      .select('config')
      .eq('org_id', orgId)
      .maybeSingle()
    const prev = (existing?.config ?? {}) as Record<string, unknown>
    const { error } = await admin.from('org_settings').upsert(
      {
        org_id: orgId,
        config: { ...prev, schedule_slots: normalized },
      },
      { onConflict: 'org_id' }
    )
    if (error) return { error: error.message }
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu khung giờ.' }
  }
}

export type WeekSessionRow = {
  id: string
  class_id: string
  class_name: string
  teacher_id: string | null
  teacher_name: string
  room: string | null
  start_time: string
  end_time: string
  org_id: string
}

export async function getWeekSessions(
  orgId: string | null,
  weekStartISO: string
): Promise<{ data: WeekSessionRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const weekStart = startOfWeekMonday(new Date(weekStartISO))
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const { data, error } = await scope.supabase
      .from('class_sessions')
      .select(
        'id, class_id, org_id, room, start_time, end_time, teacher_id, classes(name), profiles!class_sessions_teacher_id_fkey(full_name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString())
      .order('start_time')

    if (error) return { data: [], error: error.message }

    return {
      data: (data ?? []).map((row) => {
        const cls = row.classes as { name?: string } | { name?: string }[] | null
        const teacher = row.profiles as
          | { full_name?: string }
          | { full_name?: string }[]
          | null
        return {
          id: row.id as string,
          class_id: row.class_id as string,
          class_name: Array.isArray(cls)
            ? cls[0]?.name ?? '—'
            : cls?.name ?? '—',
          teacher_id: (row.teacher_id as string | null) ?? null,
          teacher_name: Array.isArray(teacher)
            ? teacher[0]?.full_name ?? '—'
            : teacher?.full_name ?? '—',
          room: (row.room as string | null) ?? null,
          start_time: String(row.start_time),
          end_time: String(row.end_time),
          org_id: row.org_id as string,
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lịch tuần.',
    }
  }
}

export async function moveSession(
  orgId: string,
  input: { sessionId: string; date: string; startTime: string; endTime: string }
): Promise<{ error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: 'Ngày không hợp lệ.' }
  }
  const startISO = new Date(`${input.date}T${input.startTime}:00`).toISOString()
  const endISO = new Date(`${input.date}T${input.endTime}:00`).toISOString()
  if (endISO <= startISO) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' }

  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope

    const { data: session, error: loadErr } = await scope.supabase
      .from('class_sessions')
      .select('id, org_id, teacher_id, substitute_teacher_id, room')
      .eq('id', input.sessionId)
      .is('deleted_at', null)
      .maybeSingle()

    if (loadErr) return { error: loadErr.message }
    if (!session || !scope.orgIds.includes(session.org_id as string)) {
      return { error: 'Buổi học không tồn tại hoặc ngoài phạm vi.' }
    }

    const { data: isHoliday } = await scope.supabase.rpc('is_org_holiday', {
      p_org_id: session.org_id,
      p_date: input.date,
    })
    if (isHoliday === true) {
      return { error: 'Không thể chuyển buổi sang ngày nghỉ.' }
    }

    const teacherId =
      (session.substitute_teacher_id as string | null) ||
      (session.teacher_id as string | null) ||
      null
    const room = (session.room as string | null) || null

    if (teacherId || room) {
      const { data: hasConflict } = await scope.supabase.rpc(
        'check_schedule_conflict',
        {
          p_teacher_id: teacherId,
          p_room: room,
          p_start_time: startISO,
          p_end_time: endISO,
        }
      )
      // RPC may count the same session — re-check excluding self via query if needed
      if (hasConflict === true) {
        const { data: others } = await scope.supabase
          .from('class_sessions')
          .select('id, teacher_id, substitute_teacher_id, room, start_time, end_time')
          .neq('id', input.sessionId)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .lt('start_time', endISO)
          .gt('end_time', startISO)

        const clash = (others ?? []).some((o) => {
          const oTeacher =
            (o.substitute_teacher_id as string | null) ||
            (o.teacher_id as string | null)
          const sameT = teacherId && oTeacher && teacherId === oTeacher
          const sameR =
            room?.trim() &&
            o.room &&
            room.trim().toLowerCase() === String(o.room).trim().toLowerCase()
          return Boolean(sameT || sameR)
        })
        if (clash) {
          return { error: 'TRÙNG LỊCH: GV hoặc phòng đã có buổi khác tại khung này.' }
        }
      }
    }

    const { error } = await scope.supabase
      .from('class_sessions')
      .update({ start_time: startISO, end_time: endISO })
      .eq('id', input.sessionId)

    if (error) return { error: error.message }
    revalidatePath('/academic/schedule')
    revalidatePath('/teacher/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi chuyển buổi.' }
  }
}

export async function cancelSession(
  orgId: string,
  sessionId: string
): Promise<{ error?: string }> {
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope
    const { data: session } = await scope.supabase
      .from('class_sessions')
      .select('id, org_id')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!session || !scope.orgIds.includes(session.org_id as string)) {
      return { error: 'Buổi học không tồn tại.' }
    }
    const { error } = await scope.supabase
      .from('class_sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId)
    if (error) return { error: error.message }
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi hủy buổi.' }
  }
}

export type SchedulePlanRow = {
  id: string
  class_id: string
  class_name: string
  sessions_per_week: number
  preferred_weekdays: number[]
  preferred_slot_ids: string[]
  default_room: string | null
  is_active: boolean
}

export async function listSchedulePlans(
  orgId: string | null
): Promise<{ data: SchedulePlanRow[]; error?: string }> {
  if (!orgId) return { data: [] }
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    const { data, error } = await scope.supabase
      .from('class_schedule_plans')
      .select(
        'id, class_id, sessions_per_week, preferred_weekdays, preferred_slot_ids, default_room, is_active, classes(name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return {
        data: [],
        error: migrationHint(error.message, '058_class_schedule_plans.sql'),
      }
    }

    return {
      data: (data ?? []).map((r) => {
        const cls = r.classes as { name?: string } | { name?: string }[] | null
        return {
          id: r.id as string,
          class_id: r.class_id as string,
          class_name: Array.isArray(cls)
            ? cls[0]?.name ?? '—'
            : cls?.name ?? '—',
          sessions_per_week: r.sessions_per_week as number,
          preferred_weekdays: Array.isArray(r.preferred_weekdays)
            ? (r.preferred_weekdays as number[])
            : [],
          preferred_slot_ids: Array.isArray(r.preferred_slot_ids)
            ? (r.preferred_slot_ids as string[])
            : [],
          default_room: (r.default_room as string | null) ?? null,
          is_active: Boolean(r.is_active),
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải kế hoạch.',
    }
  }
}

export async function saveSchedulePlan(
  orgId: string,
  input: {
    classId: string
    sessionsPerWeek: number
    preferredWeekdays: number[]
    preferredSlotIds: string[]
    defaultRoom?: string
  }
): Promise<{ error?: string }> {
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return scope

    const ownership = await assertClassInSubtree(
      scope.supabase,
      input.classId,
      scope.orgIds
    )
    if ('error' in ownership) return ownership

    const payload = {
      org_id: ownership.org_id,
      class_id: input.classId,
      sessions_per_week: Math.min(14, Math.max(1, input.sessionsPerWeek)),
      preferred_weekdays: input.preferredWeekdays,
      preferred_slot_ids: input.preferredSlotIds,
      default_room: input.defaultRoom?.trim() || null,
      is_active: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await scope.supabase
      .from('class_schedule_plans')
      .select('id')
      .eq('class_id', input.classId)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await scope.supabase
        .from('class_schedule_plans')
        .update(payload)
        .eq('id', existing.id)
      if (error) {
        return { error: migrationHint(error.message, '058_class_schedule_plans.sql') }
      }
    } else {
      const { error } = await scope.supabase
        .from('class_schedule_plans')
        .insert(payload)
      if (error) {
        return { error: migrationHint(error.message, '058_class_schedule_plans.sql') }
      }
    }
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi lưu kế hoạch.' }
  }
}

export async function previewAutoSchedule(
  orgId: string,
  input: { fromDate: string; toDate: string; classIds?: string[] }
): Promise<{
  error?: string
  placeable?: ReturnType<typeof buildAutoPreview>['placeable']
  skipped?: ReturnType<typeof buildAutoPreview>['skipped']
}> {
  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { error: scope.error }

    const slotsRes = await getScheduleSlots(orgId)
    const holidaysRes = await listOrgHolidays(orgId)
    const holidayDates = new Set(holidaysRes.data.map((h) => h.holiday_date))

    let plansQuery = scope.supabase
      .from('class_schedule_plans')
      .select(
        'class_id, org_id, sessions_per_week, preferred_weekdays, preferred_slot_ids, default_room, classes(name, teacher_id)'
      )
      .in('org_id', scope.orgIds)
      .eq('is_active', true)
      .is('deleted_at', null)

    if (input.classIds && input.classIds.length > 0) {
      plansQuery = plansQuery.in('class_id', input.classIds)
    }

    const { data: plans, error } = await plansQuery
    if (error) {
      return { error: migrationHint(error.message, '058_class_schedule_plans.sql') }
    }
    if (!plans?.length) {
      return { error: 'Chưa có kế hoạch xếp lịch lớp nào. Lưu kế hoạch trước.' }
    }

    const { data: existing } = await scope.supabase
      .from('class_sessions')
      .select('teacher_id, room, start_time, end_time')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('start_time', `${input.fromDate}T00:00:00`)
      .lte('start_time', `${input.toDate}T23:59:59`)

    const existingBusy: AutoBusy[] = (existing ?? []).map((e) => ({
      teacherId: (e.teacher_id as string | null) ?? null,
      room: (e.room as string | null) ?? null,
      startISO: String(e.start_time),
      endISO: String(e.end_time),
    }))

    const planInputs: AutoPlanInput[] = plans.map((p) => {
      const cls = p.classes as
        | { name?: string; teacher_id?: string | null }
        | { name?: string; teacher_id?: string | null }[]
        | null
      const c = Array.isArray(cls) ? cls[0] : cls
      return {
        classId: p.class_id as string,
        className: c?.name ?? '—',
        orgId: p.org_id as string,
        teacherId: c?.teacher_id ?? null,
        room: (p.default_room as string | null) ?? null,
        sessionsPerWeek: p.sessions_per_week as number,
        preferredWeekdays: Array.isArray(p.preferred_weekdays)
          ? (p.preferred_weekdays as number[])
          : [],
        preferredSlotIds: Array.isArray(p.preferred_slot_ids)
          ? (p.preferred_slot_ids as string[])
          : [],
      }
    })

    const result = buildAutoPreview({
      plans: planInputs,
      slots: slotsRes.data,
      fromDate: input.fromDate,
      toDate: input.toDate,
      holidayDates,
      existingBusy,
    })
    return result
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi xem trước auto.' }
  }
}

export async function commitAutoSchedule(
  orgId: string,
  input: { fromDate: string; toDate: string; classIds?: string[] }
): Promise<{ error?: string; created?: number; skipped?: number }> {
  const preview = await previewAutoSchedule(orgId, input)
  if (preview.error) return { error: preview.error }

  try {
    const scope = await requireScheduleAccess(orgId)
    if ('error' in scope) return { error: scope.error }

    let created = 0
    let skipped = preview.skipped?.length ?? 0
    for (const cand of preview.placeable ?? []) {
      const result = await insertOneSession(scope.supabase, {
        orgId: cand.orgId,
        classId: cand.classId,
        teacherId: cand.teacherId || '',
        room: cand.room || '',
        startISO: cand.startISO,
        endISO: cand.endISO,
      })
      if (result.error) {
        if (/TRÙNG LỊCH/i.test(result.error)) skipped += 1
        else return { error: result.error, created, skipped }
      } else {
        created += 1
      }
    }

    revalidatePath('/academic/schedule')
    revalidatePath('/teacher/schedule')
    return { created, skipped }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lỗi áp dụng auto.' }
  }
}
