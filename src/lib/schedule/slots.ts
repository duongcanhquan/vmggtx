/** Khung giờ ca cố định cho lưới tuần / auto TKB */

export type ScheduleSlot = {
  id: string
  label: string
  start: string // HH:mm
  end: string
}

export const DEFAULT_SCHEDULE_SLOTS: ScheduleSlot[] = [
  { id: 'ca1', label: 'Ca 1', start: '07:30', end: '09:00' },
  { id: 'ca2', label: 'Ca 2', start: '09:15', end: '10:45' },
  { id: 'ca3', label: 'Ca 3', start: '13:30', end: '15:00' },
  { id: 'ca4', label: 'Ca 4', start: '15:15', end: '16:45' },
  { id: 'ca5', label: 'Ca 5', start: '18:00', end: '20:00' },
]

export function normalizeScheduleSlots(raw: unknown): ScheduleSlot[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SCHEDULE_SLOTS
  const out: ScheduleSlot[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    const label = typeof o.label === 'string' ? o.label.trim() : ''
    const start = typeof o.start === 'string' ? o.start.trim() : ''
    const end = typeof o.end === 'string' ? o.end.trim() : ''
    if (!id || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) {
      continue
    }
    out.push({ id, label: label || id, start, end })
  }
  return out.length > 0 ? out : DEFAULT_SCHEDULE_SLOTS
}

/** Map session time → nearest slot id (same start), else null */
export function matchSlotId(
  startISO: string,
  slots: ScheduleSlot[]
): string | null {
  const d = new Date(startISO)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const t = `${hh}:${mm}`
  return slots.find((s) => s.start === t)?.id ?? null
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday 00:00 local of the week containing `ref` */
export function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const day = d.getDay() // 0 CN
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const
