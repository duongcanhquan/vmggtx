/** Client-side overlap helpers for week grid conflict highlight */

export type ConflictSession = {
  id: string
  teacher_id: string | null
  room: string | null
  start_time: string
  end_time: string
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = new Date(aStart).getTime()
  const ae = new Date(aEnd).getTime()
  const bs = new Date(bStart).getTime()
  const be = new Date(bEnd).getTime()
  return as < be && ae > bs
}

/** Returns set of session ids that conflict with at least one other (same teacher or same room). */
export function findConflictIds(sessions: ConflictSession[]): Set<string> {
  const bad = new Set<string>()
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i]
      const b = sessions[j]
      if (!overlaps(a.start_time, a.end_time, b.start_time, b.end_time)) continue
      const sameTeacher =
        Boolean(a.teacher_id) && a.teacher_id === b.teacher_id
      const sameRoom =
        Boolean(a.room?.trim()) &&
        a.room!.trim().toLowerCase() === b.room!.trim().toLowerCase()
      if (sameTeacher || sameRoom) {
        bad.add(a.id)
        bad.add(b.id)
      }
    }
  }
  return bad
}
