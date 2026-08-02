/**
 * Tính ngày công hybrid (D-HR5): work_week − lễ − phép + override.
 */

export type WorkWeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

const DEFAULT_WORK_WEEK: WorkWeekDay[] = [1, 2, 3, 4, 5]

export function parseWorkWeek(raw: unknown): WorkWeekDay[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_WORK_WEEK
  const days = raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) as WorkWeekDay[]
  return days.length > 0 ? [...new Set(days)] : DEFAULT_WORK_WEEK
}

/** Đếm ngày trong tháng thuộc work_week và không nằm trong holiday set (YYYY-MM-DD). */
export function countStandardWorkdays(
  year: number,
  month: number,
  workWeek: WorkWeekDay[],
  holidayDates: Set<string>
): number {
  const last = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= last; d++) {
    const date = new Date(year, month - 1, d)
    const key = toDateKey(date)
    if (holidayDates.has(key)) continue
    if (workWeek.includes(date.getDay() as WorkWeekDay)) count += 1
  }
  return count
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Số ngày làm việc trong khoảng [start, end] theo work_week − holidays. */
export function countLeaveDaysInRange(
  startIso: string,
  endIso: string,
  workWeek: WorkWeekDay[],
  holidayDates: Set<string>
): number {
  const start = new Date(startIso + 'T00:00:00')
  const end = new Date(endIso + 'T00:00:00')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0
  }
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const key = toDateKey(cur)
    if (!holidayDates.has(key) && workWeek.includes(cur.getDay() as WorkWeekDay)) {
      count += 1
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export type WorkdayOverrideStatus = 'present' | 'absent' | 'leave' | 'holiday' | 'remote'

/**
 * worked_days ≈ standard − absent − leaveDays(+approved) + present/remote overrides…
 * Đơn giản MVP: bắt đầu = standard; trừ leaveDays; apply override.
 */
export function computeWorkedDays(input: {
  standardDays: number
  leaveDaysInMonth: number
  overrides: { status: WorkdayOverrideStatus }[]
}): number {
  let worked = input.standardDays - input.leaveDaysInMonth
  for (const o of input.overrides) {
    if (o.status === 'absent') worked -= 1
    if (o.status === 'present' || o.status === 'remote') {
      // nếu ngày đó đã bị trừ leave/absent nhầm — MVP: present cộng lại tối đa +1
      worked += 1
    }
    if (o.status === 'leave') {
      // đã tính trong leaveDaysInMonth — bỏ qua để tránh double
    }
  }
  return Math.max(0, Math.min(input.standardDays + 5, worked))
}
