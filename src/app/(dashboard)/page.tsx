'use client'

import { useEffect, useState } from 'react'
import {
  BookOpen,
  Users,
  Wallet,
  Building2,
  BarChart3,
  FlaskConical,
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
          {/* Bento KPI: hero tối + thẻ gold + thẻ sáng */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bento-card-dark p-6 sm:col-span-2">
              <div className="flex items-start justify-between">
                <span className="bento-icon border border-[#c9a227]/30 bg-white/5 text-[#e5c369]">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="rounded-full border border-[#c9a227]/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#e5c369]">
                  Toàn hệ thống
                </span>
              </div>
              <p className="mt-6 font-heading text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
                {stats.totalStudents.toLocaleString('vi-VN')}
              </p>
              <p className="mt-1 text-sm font-medium text-stone-300">Học viên đang theo học</p>
              <p className="mt-1 text-xs text-stone-400">Roll-up từ mọi chi nhánh con/cháu</p>
            </div>

            <div className="bento-card-gold p-6">
              <span className="bento-icon bg-[#a16207]/10 text-[#854d0e]">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-5 truncate font-heading text-2xl font-bold tabular-nums tracking-tight text-[#573412]">
                {formatVnd(stats.projectedRevenue)}
              </p>
              <p className="mt-0.5 text-sm font-medium text-[#6b3f10]">Doanh thu dự kiến</p>
              <p className="mt-1 text-xs text-[#854d0e]/70">Ước tính 1,5 triệu ₫/học viên</p>
            </div>

            <div className="bento-card p-6">
              <span className="bento-icon bg-stone-100 text-stone-700">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-5 font-heading text-2xl font-bold tabular-nums tracking-tight">
                {stats.activeClasses.toLocaleString('vi-VN')}
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">Lớp học đang mở</p>
              <p className="mt-1 text-xs text-muted-foreground">Cộng dồn đơn vị trực thuộc</p>
            </div>
          </div>

          {/* Bento: biểu đồ (2/3) + bảng tổng kết chi nhánh (1/3) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="bento-card p-5 sm:p-6 lg:col-span-2">
              <div className="mb-4 flex items-center gap-3">
                <span className="bento-icon bg-stone-100 text-stone-700">
                  <BarChart3 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="font-heading text-lg font-bold">
                  Học viên theo đơn vị trực thuộc
                </h2>
              </div>

              {stats.childrenStats.length > 0 ? (
                <StudentsByBranchChart data={stats.childrenStats} />
              ) : (
                <p className="rounded-xl bg-stone-50 p-6 text-center text-sm text-muted-foreground">
                  Không có nhánh trực thuộc.
                </p>
              )}
            </div>

            <div className="bento-card p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="bento-icon bg-[#c9a227]/10 text-[#a16207]">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="font-heading text-lg font-bold">Xếp hạng chi nhánh</h2>
              </div>

              {stats.childrenStats.length > 0 ? (
                <ol className="space-y-4">
                  {stats.childrenStats.map((child, index) => {
                    const share =
                      stats.totalStudents > 0
                        ? Math.round((child.students / stats.totalStudents) * 100)
                        : 0
                    return (
                      <li key={child.orgId}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                index === 0
                                  ? 'bg-[#c9a227]/15 text-[#a16207] ring-1 ring-[#c9a227]/40'
                                  : 'bg-stone-100 text-stone-500'
                              }`}
                            >
                              {index + 1}
                            </span>
                            <span className="truncate font-medium text-foreground">
                              {child.name}
                            </span>
                          </span>
                          <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
                            {child.students.toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <div
                          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"
                          role="presentation"
                        >
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#44403c] to-[#c9a227]"
                            style={{ width: `${Math.max(share, 4)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-right text-[11px] text-muted-foreground">
                          {share}% toàn hệ thống
                        </p>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="rounded-xl bg-stone-50 p-6 text-center text-sm text-muted-foreground">
                  Đơn vị cấp cuối — không có chi nhánh con.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
