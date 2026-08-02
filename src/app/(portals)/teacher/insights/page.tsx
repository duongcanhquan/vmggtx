'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { AlertTriangle, BarChart3, Users } from 'lucide-react'
import { FunLoader } from '@/components/shared/FunLoader'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { ReportKpiTile } from '@/components/reports/ReportKpiTile'
import { getTeacherInsights, type TeacherClassInsight } from './actions'

const ReportBarChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

export default function TeacherInsightsPage() {
  const [classes, setClasses] = useState<TeacherClassInsight[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    void (async () => {
      const r = await getTeacherInsights()
      setClasses(r.classes)
      setError(r.loadError ?? null)
      if (r.classes[0]) setSelected(r.classes[0].classId)
      setLoading(false)
    })()
  }, [])

  if (loading) return <FunLoader label="Đang tải phân tích lớp…" />

  const current = classes.find((c) => c.classId === selected) ?? classes[0]
  const avgPresent =
    classes.length > 0
      ? Math.round(
          classes.reduce((s, c) => s + c.presentRate, 0) / classes.length
        )
      : 100

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
          Phân tích lớp
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chuyên cần · điểm · học viên cần chú ý
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Bạn chưa được gán lớp chủ nhiệm.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ReportKpiTile
              icon={Users}
              label="Số lớp"
              value={classes.length}
              tint="indigo"
            />
            <ReportKpiTile
              icon={BarChart3}
              label="Chuyên cần TB"
              value={`${avgPresent}%`}
              tint="emerald"
            />
            <ReportKpiTile
              icon={AlertTriangle}
              label="Cần chú ý"
              value={classes.reduce((s, c) => s + c.atRisk.length, 0)}
              tint="rose"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <button
                key={c.classId}
                type="button"
                onClick={() => setSelected(c.classId)}
                className={`min-h-10 cursor-pointer rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  current?.classId === c.classId
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface hover:bg-muted'
                }`}
              >
                {c.className}
              </button>
            ))}
          </div>

          {current && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-indigo-50 p-3 text-center">
                    <p className="font-heading text-2xl font-bold tabular-nums">
                      {current.studentCount}
                    </p>
                    <p className="text-xs text-muted-foreground">HV</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 text-center">
                    <p className="font-heading text-2xl font-bold tabular-nums">
                      {current.presentRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">Chuyên cần</p>
                  </div>
                  <div className="rounded-xl bg-violet-50 p-3 text-center">
                    <p className="font-heading text-2xl font-bold tabular-nums">
                      {current.avgScore ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">ĐTB</p>
                  </div>
                </div>
                <div className="mt-4">
                  <ReportBarChart
                    data={classes.map((c) => ({
                      name: c.className.slice(0, 12),
                      value: c.presentRate,
                    }))}
                    xKey="name"
                    yKey="value"
                    color="#059669"
                    height={180}
                  />
                </div>
                <Link
                  href={`/teacher/grades/${current.classId}`}
                  className="mt-3 inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-primary"
                >
                  Mở sổ điểm →
                </Link>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <h2 className="font-heading text-sm font-bold">Cần chú ý</h2>
                {current.atRisk.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Không có học viên rủi ro nổi bật.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {current.atRisk.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2.5"
                      >
                        <span className="text-sm font-semibold text-foreground">
                          {s.name}
                        </span>
                        <span className="text-xs font-medium text-rose-700">
                          {s.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}
