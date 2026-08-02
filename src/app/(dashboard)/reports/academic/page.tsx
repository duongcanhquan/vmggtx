'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, BellRing, Flag, ShieldCheck } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { ReportKpiTile } from '@/components/reports/ReportKpiTile'
import {
  getAcademicWarningReport,
  type AcademicWarningReport,
} from '../actions'

const ReportBarChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const ReportAreaChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportAreaChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

export default function AcademicReportsPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [data, setData] = useState<AcademicWarningReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getAcademicWarningReport(orgId)
    setData(r.data)
    setError(r.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <FunLoader label="Đang tải cảnh báo…" />

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
          Báo cáo cảnh báo học vụ
        </h1>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <ReportKpiTile icon={Flag} label="Tổng" value={data?.total ?? 0} tint="indigo" />
        <ReportKpiTile
          icon={Flag}
          label="Vắng"
          value={data?.attendance ?? 0}
          tint="rose"
        />
        <ReportKpiTile
          icon={Flag}
          label="Điểm yếu"
          value={data?.grade ?? 0}
          tint="amber"
        />
        <ReportKpiTile
          icon={BellRing}
          label="Chưa gửi"
          value={data?.statusNew ?? 0}
          tint="sky"
        />
        <ReportKpiTile
          icon={BellRing}
          label="Đã báo PH"
          value={data?.statusNotified ?? 0}
          tint="emerald"
        />
        <ReportKpiTile
          icon={ShieldCheck}
          label="Đã xử lý"
          value={data?.statusResolved ?? 0}
          tint="violet"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold">Xu hướng 30 ngày</h2>
          <ReportAreaChart
            data={(data?.trend ?? []).map((d) => ({ day: d.day, value: d.count }))}
            xKey="day"
            yKey="value"
            color="#E11D48"
          />
        </section>
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold">Theo lớp (top 10)</h2>
          <ReportBarChart
            data={(data?.byClass ?? []).map((d) => ({
              name: d.name,
              value: d.count,
            }))}
            xKey="name"
            yKey="value"
            color="#D97706"
          />
        </section>
      </div>

      <Link
        href="/academic/warnings"
        className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Mở danh sách xử lý
      </Link>
    </div>
  )
}
