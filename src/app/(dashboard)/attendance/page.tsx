'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Ban,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { getTodaySessions, type TodaySession } from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Điểm danh (/attendance): buổi học HÔM NAY từ class_sessions,
// theo phạm vi org đang chọn (RLS cắt thêm theo quyền).
// ============================================================

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

export default function AttendancePage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const [sessions, setSessions] = useState<TodaySession[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getTodaySessions(currentOrgId).then((result) => {
      if (cancelled) return
      setSessions(result.data)
      setIsDemo(result.demo)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  const doneCount = sessions.filter((s) => s.done).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <ClipboardCheck className="h-7 w-7 text-primary" aria-hidden="true" />
            Điểm danh hôm nay
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Intl.DateTimeFormat('vi-VN', {
              weekday: 'long',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              timeZone: 'Asia/Ho_Chi_Minh',
            }).format(new Date())}
          </p>
        </div>
        {sessions.length > 0 && (
          <p className="text-sm font-medium text-muted-foreground">
            Đã điểm danh{' '}
            <span className="font-bold tabular-nums text-emerald-700">
              {doneCount}/{sessions.length}
            </span>{' '}
            buổi
          </p>
        )}
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Chưa đăng nhập hoặc chưa chọn cơ sở — không tải được lịch buổi học.
        </p>
      )}

      {loading ? (
        <FunLoader label="Đang tải buổi học hôm nay…" />
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <CalendarX2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Hôm nay không có buổi học nào</p>
          <p className="text-xs text-muted-foreground">
            Buổi học được tạo trong phần Thời khóa biểu / Lớp học.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <Link
              key={session.sessionId}
              href={`/attendance/${session.classId}/${session.sessionId}`}
              aria-disabled={session.cancelled}
              className={`group cursor-pointer rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                session.cancelled ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    session.done
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-sky-50 text-sky-600'
                  }`}
                >
                  {session.done ? (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                {session.done && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    Đã điểm danh
                  </span>
                )}
                {session.cancelled && (
                  <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500">
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    Đã hủy
                  </span>
                )}
              </div>
              <p className="mt-4 font-heading text-lg font-bold">{session.className}</p>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                {timeFormat.format(new Date(session.startTime))}–
                {timeFormat.format(new Date(session.endTime))}
                {session.room ? ` · Phòng ${session.room}` : ''}
              </p>
              {!session.cancelled && (
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {session.done ? 'Xem / điểm danh lại' : 'Điểm danh ngay'}
                  <ChevronRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
