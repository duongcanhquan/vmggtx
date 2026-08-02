import type { ScheduleSlot } from './slots'
import { localDateKey } from './slots'

export type AutoPlanInput = {
  classId: string
  className: string
  orgId: string
  teacherId: string | null
  room: string | null
  sessionsPerWeek: number
  preferredWeekdays: number[]
  preferredSlotIds: string[]
}

export type AutoCandidate = {
  classId: string
  className: string
  orgId: string
  teacherId: string | null
  room: string | null
  date: string
  slotId: string
  startISO: string
  endISO: string
  reason?: 'ok' | 'holiday' | 'conflict' | 'full_week'
}

export type AutoBusy = {
  teacherId: string | null
  room: string | null
  startISO: string
  endISO: string
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart)
}

function isBusy(
  busy: AutoBusy[],
  teacherId: string | null,
  room: string | null,
  startISO: string,
  endISO: string
): boolean {
  for (const b of busy) {
    if (!overlaps(startISO, endISO, b.startISO, b.endISO)) continue
    if (teacherId && b.teacherId && teacherId === b.teacherId) return true
    if (
      room?.trim() &&
      b.room?.trim() &&
      room.trim().toLowerCase() === b.room.trim().toLowerCase()
    ) {
      return true
    }
  }
  return false
}

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

/**
 * Greedy auto-fill: mỗi tuần lịch (T2–CN) cố gắng đặt đủ sessionsPerWeek
 * theo weekday + slot ưu tiên, rồi fallback.
 */
export function buildAutoPreview(args: {
  plans: AutoPlanInput[]
  slots: ScheduleSlot[]
  fromDate: string
  toDate: string
  holidayDates: Set<string>
  existingBusy: AutoBusy[]
}): { placeable: AutoCandidate[]; skipped: AutoCandidate[] } {
  const from = new Date(`${args.fromDate}T00:00:00`)
  const to = new Date(`${args.toDate}T00:00:00`)
  const busy = [...args.existingBusy]
  const placeable: AutoCandidate[] = []
  const skipped: AutoCandidate[] = []

  const slotById = new Map(args.slots.map((s) => [s.id, s]))
  const orderedSlots = [
    ...args.slots.filter((s) => true),
  ]

  let weekStart = mondayOf(from)
  const lastMonday = mondayOf(to)

  while (weekStart <= lastMonday) {
    for (const plan of args.plans) {
      let placedThisWeek = 0
      const prefDays =
        plan.preferredWeekdays.length > 0
          ? plan.preferredWeekdays
          : [1, 2, 3, 4, 5]
      const prefSlots =
        plan.preferredSlotIds.length > 0
          ? plan.preferredSlotIds
              .map((id) => slotById.get(id))
              .filter((s): s is ScheduleSlot => Boolean(s))
          : orderedSlots
      const trySlots =
        prefSlots.length > 0
          ? [
              ...prefSlots,
              ...orderedSlots.filter((s) => !prefSlots.some((p) => p.id === s.id)),
            ]
          : orderedSlots

      // Prefer preferred weekdays first, then other days in week
      const dayOrder = [
        ...prefDays,
        ...[1, 2, 3, 4, 5, 6, 0].filter((d) => !prefDays.includes(d)),
      ]

      for (const wd of dayOrder) {
        if (placedThisWeek >= plan.sessionsPerWeek) break
        const day = new Date(weekStart)
        // weekStart is Monday; map JS day
        const mondayJs = 1
        let offset = wd - mondayJs
        if (wd === 0) offset = 6
        day.setDate(weekStart.getDate() + offset)
        if (day < from || day > to) continue

        const dateStr = localDateKey(day)
        if (args.holidayDates.has(dateStr)) {
          skipped.push({
            classId: plan.classId,
            className: plan.className,
            orgId: plan.orgId,
            teacherId: plan.teacherId,
            room: plan.room,
            date: dateStr,
            slotId: '',
            startISO: '',
            endISO: '',
            reason: 'holiday',
          })
          continue
        }

        for (const slot of trySlots) {
          if (placedThisWeek >= plan.sessionsPerWeek) break
          const startISO = new Date(`${dateStr}T${slot.start}:00`).toISOString()
          const endISO = new Date(`${dateStr}T${slot.end}:00`).toISOString()
          if (
            isBusy(busy, plan.teacherId, plan.room, startISO, endISO)
          ) {
            continue
          }
          const cand: AutoCandidate = {
            classId: plan.classId,
            className: plan.className,
            orgId: plan.orgId,
            teacherId: plan.teacherId,
            room: plan.room,
            date: dateStr,
            slotId: slot.id,
            startISO,
            endISO,
            reason: 'ok',
          }
          placeable.push(cand)
          busy.push({
            teacherId: plan.teacherId,
            room: plan.room,
            startISO,
            endISO,
          })
          placedThisWeek += 1
          break
        }
      }

      if (placedThisWeek < plan.sessionsPerWeek) {
        skipped.push({
          classId: plan.classId,
          className: plan.className,
          orgId: plan.orgId,
          teacherId: plan.teacherId,
          room: plan.room,
          date: localDateKey(weekStart),
          slotId: '',
          startISO: '',
          endISO: '',
          reason: 'full_week',
        })
      }
    }
    weekStart = new Date(weekStart)
    weekStart.setDate(weekStart.getDate() + 7)
  }

  return { placeable, skipped }
}
