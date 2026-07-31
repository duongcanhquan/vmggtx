'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Flag, Loader2, MessageSquareHeart } from 'lucide-react'
import {
  getParentNotices,
  getParentStudent,
  type ParentNotice,
} from '../../actions'

// ============================================================
// Báo bài & Nhận xét (tab Thông báo):
//  - "Thông báo từ nhà trường" = student_warnings (cờ đỏ/cam).
//  - "Nhận xét của giáo viên"  = note trong grades / attendance.
// ============================================================

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

export default function ParentNotificationsPage() {
  const router = useRouter()
  const [notices, setNotices] = useState<ParentNotice[]>([])
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
      const data = await getParentNotices()
      if (cancelled) return
      setNotices(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải thông báo…
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="font-heading text-xl font-bold tracking-tight">Báo bài &amp; Nhận xét</h1>
      <p className="text-sm text-muted-foreground">
        Thông báo từ nhà trường và nhận xét hằng ngày của giáo viên.
      </p>

      {notices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-center">
          <Bell className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Chưa có thông báo hay nhận xét nào.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => {
            const isWarning = notice.kind === 'warning'
            const isRed = isWarning && notice.warning_type === 'attendance'
            return (
              <li
                key={notice.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  isWarning
                    ? isRed
                      ? 'border-rose-200 bg-rose-50'
                      : 'border-orange-200 bg-orange-50'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isWarning
                        ? isRed
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-orange-100 text-orange-600'
                        : 'bg-indigo-50 text-primary'
                    }`}
                  >
                    {isWarning ? (
                      <Flag className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <MessageSquareHeart className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`text-sm font-semibold ${
                          isWarning
                            ? isRed
                              ? 'text-rose-800'
                              : 'text-orange-800'
                            : 'text-foreground'
                        }`}
                      >
                        {notice.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatDate(notice.date)}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-sm ${
                        isWarning
                          ? isRed
                            ? 'text-rose-700'
                            : 'text-orange-700'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {notice.description}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
