'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { AlertTriangle, BarChart3, Medal } from 'lucide-react'
import { FunLoader } from '@/components/shared/FunLoader'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { ReportKpiTile } from '@/components/reports/ReportKpiTile'
import {
  getParentInsights,
  type ParentInsightReport,
} from '../../actions'

const ReportBarChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const ReportAreaChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportAreaChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

export default function ParentInsightsPage() {
  const [data, setData] = useState<ParentInsightReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const r = await getParentInsights()
      setData(r.data)
      setError(r.loadError ?? null)
      setLoading(false)
    })()
  }, [])

  if (loading) return <FunLoader label="Đang tải xu hướng…" />

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight">
          <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
          Xu hướng học tập
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">Biểu đồ · ít chữ</p>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ReportKpiTile
          icon={BarChart3}
          label="Chuyên cần"
          value={`${data?.presentRate ?? 100}%`}
          tint="emerald"
        />
        <ReportKpiTile
          icon={Medal}
          label="ĐTB"
          value={data?.avgScore ?? '—'}
          tint="indigo"
        />
        <ReportKpiTile
          icon={AlertTriangle}
          label="Vắng KP"
          value={data?.unexcused ?? 0}
          tint="rose"
        />
        <ReportKpiTile
          icon={AlertTriangle}
          label="Cảnh báo"
          value={data?.openWarnings ?? 0}
          tint="amber"
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="font-heading text-sm font-bold">Điểm theo thời gian</h2>
        <ReportAreaChart
          data={(data?.gradeTrend ?? []).map((g) => ({
            day: g.label,
            value: g.score,
          }))}
          xKey="day"
          yKey="value"
          color="#4F46E5"
          height={200}
        />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="font-heading text-sm font-bold">Điểm danh gần đây</h2>
        <ReportBarChart
          data={(data?.attendanceBars ?? []).map((d) => ({
            name: d.label,
            value: d.present,
          }))}
          xKey="name"
          yKey="value"
          color="#059669"
          height={180}
        />
      </section>
    </div>
  )
}
