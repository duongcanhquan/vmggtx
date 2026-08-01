'use client'

import { useEffect, useState } from 'react'
import {
  BookOpen,
  Users,
  Wallet,
  Building2,
  BarChart3,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { findOrgNode, type OrgTreeNode } from '@/lib/utils/org-tree'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { getDashboardStats, type DashboardStats } from './actions'

// Lazy-load recharts: dashboard tương tác được ngay, biểu đồ tải nền
const StudentsByBranchChart = dynamic(
  () =>
    import('@/components/dashboard/StudentsByBranchChart').then(
      (mod) => mod.StudentsByBranchChart
    ),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

function formatVnd(amount: number) {
  return amount.toLocaleString('vi-VN') + ' ₫'
}

// ===== Demo fallback: sinh số liệu ỔN ĐỊNH từ cây org khi DB chưa có dữ liệu =====
function stableHash(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100_000
  }
  return hash
}

function demoStudentsOfNode(node: OrgTreeNode): number {
  return 40 + (stableHash(node.id) % 160)
}

function demoSubtreeStudents(node: OrgTreeNode): number {
  return node.children.reduce(
    (sum, child) => sum + demoSubtreeStudents(child),
    demoStudentsOfNode(node)
  )
}

function buildDemoStats(node: OrgTreeNode): DashboardStats {
  const totalStudents = demoSubtreeStudents(node)
  return {
    activeClasses: Math.max(1, Math.round(totalStudents / 25)),
    totalStudents,
    projectedRevenue: totalStudents * 1_500_000,
    childrenStats: node.children
      .map((child) => ({
        orgId: child.id,
        name: child.name,
        students: demoSubtreeStudents(child),
      }))
      .sort((a, b) => b.students - a.students),
  }
}
// =================================================================================

export default function OverviewPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const orgTree = useOrgStore((state) => state.orgTree)
  const currentOrg = currentOrgId ? findOrgNode(orgTree, currentOrgId) : null

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    if (!currentOrgId) {
      setStats(null)
      return
    }
    let cancelled = false
    setLoading(true)
    getDashboardStats(currentOrgId).then((result) => {
      if (cancelled) return
      if (result.data) {
        setStats(result.data)
        setIsDemo(false)
      } else {
        // DB chưa sẵn sàng -> số liệu demo nhất quán với cây org đang chọn
        const node = findOrgNode(useOrgStore.getState().orgTree, currentOrgId)
        setStats(node ? buildDemoStats(node) : null)
        setIsDemo(true)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  const kpiCards: { label: string; value: string; hint: string; icon: LucideIcon; tile: string; text: string }[] =
    stats
      ? [
          {
            label: 'Lớp học đang mở',
            value: stats.activeClasses.toLocaleString('vi-VN'),
            hint: 'Cộng dồn toàn bộ đơn vị trực thuộc',
            icon: BookOpen,
            tile: 'bg-indigo-50',
            text: 'text-indigo-600',
          },
          {
            label: 'Học viên đang theo học',
            value: stats.totalStudents.toLocaleString('vi-VN'),
            hint: 'Roll-up từ mọi chi nhánh con/cháu',
            icon: Users,
            tile: 'bg-emerald-50',
            text: 'text-emerald-600',
          },
          {
            label: 'Doanh thu dự kiến tháng này',
            value: formatVnd(stats.projectedRevenue),
            hint: 'Ước tính 1,5 triệu ₫/học viên (chưa có bảng invoices)',
            icon: Wallet,
            tile: 'bg-amber-50',
            text: 'text-amber-600',
          },
        ]
      : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Tổng quan Hệ thống
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentOrg ? (
              <span className="font-semibold text-foreground">{currentOrg.name}</span>
            ) : (
              'Chọn cấp quản lý để xem số liệu.'
            )}
          </p>
        </div>
        {isDemo && (
          <span className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-secondary">
            <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            Dữ liệu demo
          </span>
        )}
      </div>

      {/* Chưa chọn org */}
      {!currentOrgId && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-heading text-lg font-bold">Chưa chọn cấp quản lý</p>
          <p className="max-w-sm text-sm text-muted-foreground">Chọn đơn vị để xem thống kê.</p>
        </div>
      )}

      {/* Skeleton */}
      {currentOrgId && loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {currentOrgId && !loading && stats && (
        <>
          {/* 3 KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {kpiCards.map((kpi) => {
              const Icon = kpi.icon
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${kpi.tile} ${kpi.text}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-4 truncate font-heading text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                    {kpi.value}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{kpi.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
                </div>
              )
            })}
          </div>

          {/* Biểu đồ so sánh các nhánh trực thuộc */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <BarChart3 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-heading text-lg font-bold">
                  Học viên theo đơn vị trực thuộc
                </h2>
              </div>
            </div>

            {stats.childrenStats.length > 0 ? (
              <StudentsByBranchChart data={stats.childrenStats} />
            ) : (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                Không có nhánh trực thuộc.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
