'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, BookOpen, AlertCircle, Building2, Sparkles, MonitorPlay } from 'lucide-react'
import { useCampusStore } from '@/lib/store/useCampusStore'
import { getClasses, type ClassRow } from './actions'
import { AcademicFlowTabs } from '@/components/academic/AcademicFlowTabs'

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('vi-VN')
}

export default function ClassesPage() {
  const selectedCampusId = useCampusStore((state) => state.selectedCampusId)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedCampusId) {
      setClasses([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getClasses(selectedCampusId).then((result) => {
      if (cancelled) return
      setClasses(result.data)
      setError(result.error ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [selectedCampusId])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Học phần (lớp môn)
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Mỗi học phần gắn một môn + GV. Nên tạo từ{' '}
            <Link href="/classes/groups" className="font-semibold text-primary hover:underline">
              Lớp hành chính
            </Link>{' '}
            để đồng bộ sĩ số; «Tạo lớp mới» chỉ dùng khi học phần độc lập / ghép.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AcademicFlowTabs />
          <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/academic/lms"
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden="true" />
            LMS Online
          </Link>
          <Link
            href="/academic/schedule"
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Xếp lịch / TKB
          </Link>
          <Link
            href="/classes/groups"
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Từ lớp hành chính
          </Link>
          <Link
            href="/classes/new"
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Tạo học phần độc lập
          </Link>
          </div>
        </div>
      </div>

      {/* Chưa chọn cơ sở */}
      {!selectedCampusId && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-heading text-lg font-bold">Chưa chọn cơ sở</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Chọn cơ sở ở góc trên bên phải.
          </p>
        </div>
      )}

      {/* Lỗi tải dữ liệu */}
      {selectedCampusId && error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Không tải được danh sách lớp</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Skeleton khi đang tải */}
      {selectedCampusId && loading && (
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {/* Bảng danh sách */}
      {selectedCampusId && !loading && !error && classes.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-5 py-3.5 font-semibold">Học phần</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Cơ sở</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Môn</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Giáo viên</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Ngày bắt đầu</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">Ngày kết thúc</th>
                <th scope="col" className="px-5 py-3.5 font-semibold">
                  <span className="sr-only">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => (
                <tr
                  key={cls.id}
                  className="border-b border-border transition-colors duration-150 last:border-0 hover:bg-indigo-50/50"
                >
                  <td className="max-w-[12rem] px-5 py-3.5 font-medium text-foreground">
                    <span className="block truncate" title={cls.name}>
                      {cls.name}
                    </span>
                  </td>
                  <td className="max-w-[10rem] px-5 py-3.5 text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate" title={cls.org_name}>
                        {cls.org_name}
                      </span>
                    </span>
                  </td>
                  <td className="max-w-[8rem] px-5 py-3.5">
                    <span className="block truncate" title={cls.subject_name}>
                      {cls.subject_name}
                    </span>
                  </td>
                  <td className="max-w-[10rem] px-5 py-3.5 font-medium">
                    {cls.teacher_name === '—' ? (
                      <span className="text-muted-foreground">Chưa gán</span>
                    ) : (
                      <span className="block truncate" title={cls.teacher_name}>
                        {cls.teacher_name}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums">{formatDate(cls.start_date)}</td>
                  <td className="px-5 py-3.5 tabular-nums">{formatDate(cls.end_date)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/academic/lms?classId=${cls.id}`}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-primary transition-colors duration-200 hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MonitorPlay className="h-3.5 w-3.5" aria-hidden="true" />
                        LMS
                      </Link>
                      <Link
                        href={`/classes/${cls.id}/tutor`}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-secondary transition-colors duration-200 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Gia sư AI
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {selectedCampusId && !loading && !error && classes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-primary">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-heading text-lg font-bold">Chưa có lớp học nào</p>
          <Link
            href="/classes/new"
            className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tạo lớp mới
          </Link>
        </div>
      )}
    </div>
  )
}
