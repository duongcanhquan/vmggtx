'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Medal, Percent, XCircle } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { ReportKpiTile } from '@/components/reports/ReportKpiTile'
import { getExamAnalyticsReport, type ExamAnalyticsReport } from '../actions'

const ReportBarChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const ReportPieChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportPieChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

export default function ExamReportsPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [data, setData] = useState<ExamAnalyticsReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getExamAnalyticsReport(orgId)
    setData(r.data)
    setError(r.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <FunLoader label="Đang tải khảo thí…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/reports"
          className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Hub
        </Link>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Báo cáo khảo thí
        </h1>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReportKpiTile
          icon={Medal}
          label="Số điểm"
          value={data?.gradeCount ?? 0}
          tint="indigo"
        />
        <ReportKpiTile
          icon={Medal}
          label="ĐTB"
          value={data?.avgScore ?? 0}
          tint="sky"
        />
        <ReportKpiTile
          icon={Percent}
          label="Tỷ lệ ≥ 5"
          value={`${data?.passRate ?? 0}%`}
          tint="emerald"
        />
        <ReportKpiTile
          icon={XCircle}
          label="Dưới 5"
          value={data?.failCount ?? 0}
          tint="rose"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold">Phân bố điểm</h2>
          <ReportPieChart data={data?.distribution ?? []} />
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {(data?.distribution ?? []).map((x) => (
              <li key={x.name}>
                {x.name}:{' '}
                <span className="font-semibold text-foreground">{x.value}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold">ĐTB theo lớp</h2>
          <ReportBarChart
            data={(data?.byClass ?? []).map((d) => ({
              name: d.name,
              value: d.avg,
            }))}
            xKey="name"
            yKey="value"
            color="#7C3AED"
          />
        </section>
      </div>
    </div>
  )
}
