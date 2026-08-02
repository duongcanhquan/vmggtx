'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  AlertTriangle,
  BookOpenCheck,
  GraduationCap,
  Layers,
  PiggyBank,
  Wallet,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { ReportKpiTile } from '@/components/reports/ReportKpiTile'
import { getCampusReport, type CampusReport } from './actions'

const ReportBarChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const ReportAreaChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportAreaChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)
const ReportPieChart = dynamic(
  () => import('@/components/reports/ReportCharts').then((m) => m.ReportPieChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const LINKS = [
  {
    href: '/reports/academic',
    title: 'Cảnh báo học vụ',
    desc: 'Xu hướng · lớp nóng',
    tint: 'bg-rose-50 border-rose-100 text-rose-800',
  },
  {
    href: '/reports/exams',
    title: 'Khảo thí',
    desc: 'Đậu · phân bố điểm',
    tint: 'bg-violet-50 border-violet-100 text-violet-800',
  },
  {
    href: '/admin/revenue',
    title: 'Doanh thu',
    desc: 'Thu · công nợ',
    tint: 'bg-amber-50 border-amber-100 text-amber-900',
  },
  {
    href: '/staff/transcripts',
    title: 'Bảng điểm',
    desc: 'Ma trận lớp',
    tint: 'bg-sky-50 border-sky-100 text-sky-800',
  },
]

export default function ReportsHubPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [data, setData] = useState<CampusReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getCampusReport(orgId)
    setData(r.data)
    setError(r.error ?? null)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <FunLoader label="Đang tải báo cáo…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Báo cáo vận hành
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Đa chiều · biểu đồ · ít chữ
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <ReportKpiTile
          icon={GraduationCap}
          label="Học viên"
          value={data?.students ?? 0}
          tint="indigo"
        />
        <ReportKpiTile
          icon={Layers}
          label="Lớp mở"
          value={data?.activeClasses ?? 0}
          tint="sky"
        />
        <ReportKpiTile
          icon={BookOpenCheck}
          label="Chuyên cần 7 ngày"
          value={`${data?.presentRateWeek ?? 100}%`}
          tint="emerald"
        />
        <ReportKpiTile
          icon={AlertTriangle}
          label="Cảnh báo mở"
          value={data?.warningsOpen ?? 0}
          tint="rose"
        />
        <ReportKpiTile
          icon={PiggyBank}
          label="Đã thu"
          value={vnd.format(data?.collected ?? 0)}
          tint="amber"
        />
        <ReportKpiTile
          icon={Wallet}
          label="Công nợ"
          value={vnd.format(data?.outstanding ?? 0)}
          tint="violet"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold text-foreground">
            Chuyên cần 7 ngày
          </h2>
          <ReportAreaChart
            data={(data?.attendanceWeek ?? []).map((d) => ({
              day: d.day,
              value: d.present,
            }))}
            xKey="day"
            yKey="value"
            color="#059669"
          />
        </section>
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold text-foreground">
            Học viên theo đơn vị
          </h2>
          <ReportBarChart
            data={(data?.byBranch ?? []).map((d) => ({
              name: d.name,
              value: d.students,
            }))}
            xKey="name"
            yKey="value"
          />
        </section>
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold text-foreground">
            Trạng thái ghi danh
          </h2>
          <ReportPieChart data={data?.enrollPie ?? []} />
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {(data?.enrollPie ?? []).map((x) => (
              <li key={x.name}>
                {x.name}: <span className="font-semibold text-foreground">{x.value}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <h2 className="font-heading text-sm font-bold text-foreground">
            Cơ cấu cảnh báo
          </h2>
          <ReportPieChart data={data?.warningPie ?? []} />
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-2xl border p-4 shadow-sm transition-shadow duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${link.tint}`}
          >
            <p className="font-heading text-base font-bold">{link.title}</p>
            <p className="mt-1 text-xs opacity-80">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
