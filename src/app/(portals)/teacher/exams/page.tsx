'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, ClipboardCheck, MapPin } from 'lucide-react'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  getMyUpcomingProctorExams,
  type UpcomingExamRow,
} from '@/lib/exams/upcomingExams'

function formatRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  return `${s.toLocaleString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })} – ${e.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
}

export default function TeacherExamsPage() {
  const [rows, setRows] = useState<UpcomingExamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMyUpcomingProctorExams()
    setRows(res.data)
    setError(res.error ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Lịch coi thi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Các ca thi sắp tới bạn được phân công giám thị (chỉ xem).
        </p>
      </header>

      {loading ? (
        <FunLoader label="Đang tải lịch thi…" />
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center text-sm text-destructive">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">Chưa có lịch coi thi sắp tới.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-heading font-bold">{row.assessment_name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Lớp {row.class_name}
                    {row.role_label ? ` · ${row.role_label}` : ''}
                  </p>
                </div>
                {row.room && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {row.room}
                  </span>
                )}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-sm tabular-nums text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                {formatRange(row.start_time, row.end_time)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
