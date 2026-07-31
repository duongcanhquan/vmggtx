'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clock, Loader2, MapPin, User } from 'lucide-react'
import { getMySchedule, type PortalSession } from '../actions'

// ============================================================
// Lịch học cá nhân (/schedule - Cổng Học sinh)
// student_id lấy từ session auth ở server; danh sách buổi học của
// các lớp đang ghi danh (enrollments), sắp theo thời gian tăng dần.
// ============================================================

function formatDayHeading(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dayKey(iso: string) {
  return new Date(iso).toDateString()
}

export default function StudentSchedulePage() {
  const [sessions, setSessions] = useState<PortalSession[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMySchedule().then((result) => {
      setSessions(result.data)
      setIsDemo(result.demo)
      setLoading(false)
    })
  }, [])

  // Gom theo ngày để hiển thị heading (dữ liệu đã sắp tăng dần)
  const groups: { day: string; items: PortalSession[] }[] = []
  for (const session of sessions) {
    const key = dayKey(session.start_time)
    const last = groups[groups.length - 1]
    if (last && last.day === key) {
      last.items.push(session)
    } else {
      groups.push({ day: key, items: [session] })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Lịch học của tôi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Các buổi học sắp tới của những lớp bạn đang theo học.
        </p>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị lịch demo (chưa đăng nhập bằng tài khoản học sinh).
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải lịch học…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Bạn chưa có buổi học nào sắp tới.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.day} aria-label={formatDayHeading(group.items[0].start_time)}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {formatDayHeading(group.items[0].start_time)}
              </h2>
              <div className="space-y-3">
                {group.items.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
                  >
                    <h3 className="font-heading text-base font-bold text-foreground">
                      {session.class_name}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
                        {formatTime(session.start_time)} – {formatTime(session.end_time)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
                        {session.teacher_name}
                      </span>
                      {session.room && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                          {session.room}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
