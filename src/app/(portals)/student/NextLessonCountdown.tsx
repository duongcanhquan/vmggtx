'use client'

import { useEffect, useState } from 'react'
import { Clock, DoorOpen, GraduationCap, Radio } from 'lucide-react'
import type { NextLesson } from './actions'

// ============================================================
// Khối "Bài học kế tiếp" — countdown ĐẾM NGƯỢC realtime (client).
// Buổi đang diễn ra thì hiện trạng thái LIVE thay vì đếm ngược.
// ============================================================

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

function CountdownDigit({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex min-w-14 flex-col items-center rounded-xl bg-white/15 px-2 py-2 backdrop-blur-sm">
      <span className="font-heading text-2xl font-bold tabular-nums leading-none">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
        {unit}
      </span>
    </div>
  )
}

export function NextLessonCountdown({ lesson }: { lesson: NextLesson }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const start = new Date(lesson.startTime).getTime()
  const end = new Date(lesson.endTime).getTime()
  const isLive = now >= start && now <= end
  const diff = Math.max(0, start - now)

  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1000)

  return (
    <section
      aria-label="Bài học kế tiếp"
      className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-5 text-white shadow-lg shadow-indigo-500/20"
    >
      <p className="text-xs font-bold uppercase tracking-widest opacity-90">
        Bài học kế tiếp
      </p>
      <h2 className="mt-1.5 font-heading text-xl font-bold leading-snug">
        {lesson.className}
      </h2>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-90">
        <span className="flex items-center gap-1 capitalize">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {dateFormat.format(new Date(lesson.startTime))} ·{' '}
          {timeFormat.format(new Date(lesson.startTime))}–
          {timeFormat.format(new Date(lesson.endTime))}
        </span>
        {lesson.room && (
          <span className="flex items-center gap-1">
            <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Phòng {lesson.room}
          </span>
        )}
        {lesson.teacherName && (
          <span className="flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            {lesson.teacherName}
          </span>
        )}
      </p>

      {isLive ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm">
          <Radio className="h-5 w-5 animate-pulse text-emerald-300" aria-hidden="true" />
          <span className="font-heading text-base font-bold">
            Buổi học đang diễn ra!
          </span>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2" role="timer" aria-live="polite">
          {days > 0 && <CountdownDigit value={days} unit="ngày" />}
          <CountdownDigit value={hours} unit="giờ" />
          <CountdownDigit value={minutes} unit="phút" />
          {days === 0 && <CountdownDigit value={seconds} unit="giây" />}
        </div>
      )}
    </section>
  )
}
