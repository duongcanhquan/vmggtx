'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Loader2 } from 'lucide-react'
import { getTeacherHome, type TeacherSession } from '@/app/(portals)/teacher/actions'

// ============================================================
// Nút ĐIỂM DANH NHANH trên header Teacher Portal.
// Ưu tiên nhảy tới: (1) buổi ĐANG diễn ra → (2) buổi vừa kết thúc
// chưa điểm danh → (3) buổi sắp tới hôm nay → (4) trang lịch tuần.
// ============================================================

function pickTarget(
  todaySessions: TeacherSession[],
  pendingAttendance: TeacherSession[]
): string {
  const now = Date.now()

  const ongoing = todaySessions.find(
    (session) =>
      session.status !== 'cancelled' &&
      new Date(session.startTime).getTime() <= now &&
      now <= new Date(session.endTime).getTime()
  )
  if (ongoing) return `/attendance/${ongoing.classId}/${ongoing.id}`

  if (pendingAttendance.length > 0) {
    const pending = pendingAttendance[0]
    return `/attendance/${pending.classId}/${pending.id}`
  }

  const upcoming = todaySessions.find(
    (session) =>
      session.status === 'scheduled' && new Date(session.startTime).getTime() > now
  )
  if (upcoming) return `/attendance/${upcoming.classId}/${upcoming.id}`

  return '/teacher/schedule'
}

export function QuickAttendanceButton() {
  const router = useRouter()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTeacherHome().then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        setTarget('/teacher/schedule')
        return
      }
      setTarget(pickTarget(result.todaySessions, result.pendingAttendance))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => target && router.push(target)}
      disabled={!target}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      {target === null ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">Điểm danh nhanh</span>
      <span className="sm:hidden">Điểm danh</span>
    </button>
  )
}
