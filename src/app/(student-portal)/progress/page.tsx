'use client'

import { useEffect, useState } from 'react'
import {
  ClipboardList,
  MessageSquareText,
  BookOpen,
  Megaphone,
} from 'lucide-react'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  getMyAttendanceSummary,
  getMyLearningNotes,
  type PortalAttendanceSummary,
  type PortalLearningNote,
} from '../actions'

const KIND_META: Record<
  PortalLearningNote['kind'],
  { label: string; icon: typeof MessageSquareText; tint: string }
> = {
  attendance_note: {
    label: 'Nhận xét cá nhân',
    icon: MessageSquareText,
    tint: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  diary: {
    label: 'Sổ đầu bài',
    icon: BookOpen,
    tint: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  parent_note: {
    label: 'Dặn dò',
    icon: Megaphone,
    tint: 'bg-amber-50 text-amber-800 border-amber-100',
  },
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function StudentProgressPage() {
  const [summary, setSummary] = useState<PortalAttendanceSummary | null>(null)
  const [notes, setNotes] = useState<PortalLearningNote[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const [att, learning] = await Promise.all([
        getMyAttendanceSummary(),
        getMyLearningNotes(),
      ])
      setSummary(att.data)
      setNotes(learning.data)
      setLoadError(att.loadError ?? learning.loadError ?? null)
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <FunLoader label="Đang tải chuyên cần…" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
          Chuyên cần & thái độ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi điểm danh và nhận xét từ giáo viên / sổ đầu bài.
        </p>
      </div>

      {loadError && (
        <p
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {loadError}
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tổng buổi
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-foreground">
              {summary.total}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Có mặt
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-emerald-700">
              {summary.present}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Có phép
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-amber-800">
              {summary.excused}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Không phép
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-rose-700">
              {summary.unexcused}
            </p>
          </div>
        </div>
      )}

      {summary && summary.total > 0 && (
        <p className="text-sm text-muted-foreground">
          Tỷ lệ chuyên cần:{' '}
          <span className="font-semibold text-foreground">
            {summary.presentRate}%
          </span>{' '}
          (có mặt / tổng buổi đã điểm danh).
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-bold text-foreground">
          Nhận xét & thái độ học tập
        </h2>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
            <MessageSquareText
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              Chưa có nhận xét hoặc sổ đầu bài nào.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => {
              const meta = KIND_META[note.kind]
              const Icon = meta.icon
              return (
                <li
                  key={note.id}
                  className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${meta.tint}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(note.date)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {note.title}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                    {note.description}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
