'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Clock, DoorOpen } from 'lucide-react'
import {
  getParentStudent,
  getWeekSessions,
  type WeekSession,
} from '../../actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Lịch học của con (7 ngày tới) - nhóm theo ngày, mobile-first.
// ============================================================

function groupByDay(sessions: WeekSession[]) {
  const groups = new Map<string, WeekSession[]>()
  for (const session of sessions) {
    const key = new Date(session.start_time).toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    })
    groups.set(key, [...(groups.get(key) ?? []), session])
  }
  return Array.from(groups.entries())
}

export default function ParentSchedulePage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<WeekSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const student = await getParentStudent()
      if (cancelled) return
      if (!student) {
        router.replace('/parent/login')
        return
      }
      const data = await getWeekSessions()
      if (cancelled) return
      setSessions(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loading) {
    return (
      <FunLoader label="Đang tải lịch học…" />
    )
  }

  const groups = groupByDay(sessions)

  return (
    <div className="space-y-4 p-4">
      <h1 className="font-heading text-xl font-bold tracking-tight">Lịch học của con</h1>
      <p className="text-sm text-muted-foreground">Các buổi học trong 7 ngày tới.</p>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Không có buổi học nào sắp tới.</p>
        </div>
      ) : (
        groups.map(([day, daySessions]) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-semibold capitalize text-primary">{day}</h2>
            <ul className="space-y-2">
              {daySessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-2xl border border-border bg-surface p-3.5 shadow-sm"
                >
                  <p className="font-heading text-sm font-bold text-foreground">
                    {session.class_name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {new Date(session.start_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      {' - '}
                      {new Date(session.end_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {session.room && (
                      <span className="flex items-center gap-1">
                        <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        {session.room}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
