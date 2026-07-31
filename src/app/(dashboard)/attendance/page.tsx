import Link from 'next/link'
import { ClipboardCheck, ChevronRight } from 'lucide-react'

// MOCK các buổi học hôm nay - sau này fetch từ `class_sessions` theo campus_id
const MOCK_SESSIONS = [
  {
    classId: 'cls-toan-12a',
    sessionId: 'ses-2026-07-31-t1',
    className: 'Toán 12A - Ca tối',
    time: '18:00 - 19:30',
    room: 'P.201',
  },
  {
    classId: 'cls-van-11b',
    sessionId: 'ses-2026-07-31-t2',
    className: 'Ngữ văn 11B',
    time: '19:45 - 21:15',
    room: 'P.105',
  },
  {
    classId: 'cls-anh-10c',
    sessionId: 'ses-2026-07-31-t3',
    className: 'Tiếng Anh 10C',
    time: '18:00 - 19:30',
    room: 'P.302',
  },
]

export default function AttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Điểm danh
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn buổi học để điểm danh học viên.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_SESSIONS.map((session) => (
          <Link
            key={session.sessionId}
            href={`/attendance/${session.classId}/${session.sessionId}`}
            className="group cursor-pointer rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-4 font-heading text-lg font-bold">{session.className}</p>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {session.time} · {session.room}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Điểm danh ngay
              <ChevronRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
