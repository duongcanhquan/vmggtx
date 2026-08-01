'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Star,
  UserCheck,
  Users,
} from 'lucide-react'
import { getB2BBoard, type B2BBoard } from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// BẢNG ĐIỀU KHIỂN B2B (/b2b) — tổng quan thực tập sinh tại
// doanh nghiệp: đang thực tập, đã hoàn thành, điểm trung bình.
// ============================================================

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-3 font-heading text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export default function B2BDashboardPage() {
  const [board, setBoard] = useState<B2BBoard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getB2BBoard().then((result) => {
      if (result.error !== undefined) setError(result.error)
      else setBoard(result)
    })
  }, [])

  if (error) {
    return (
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
        {error}
      </p>
    )
  }
  if (!board) return <FunLoader />

  const activeInterns = board.interns.filter((i) => i.status === 'active').slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{board.enterpriseName}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {board.industry ?? 'Doanh nghiệp đối tác'}
            {board.taxCode ? ` · MST: ${board.taxCode}` : ''}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
          <Building2 className="h-4 w-4" aria-hidden="true" />
          Cổng Doanh nghiệp
        </span>
      </div>

      {board.migrationMissing && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Database chưa chạy migration 037_b2b_portal.sql — dữ liệu thực tập sinh chưa khả dụng.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Tổng thực tập sinh"
          value={String(board.stats.total)}
          tone="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          icon={UserCheck}
          label="Đang thực tập"
          value={String(board.stats.active)}
          tone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Đã hoàn thành"
          value={String(board.stats.completed)}
          tone="bg-sky-50 text-sky-600"
        />
        <StatCard
          icon={Star}
          label="Điểm TB đã chấm"
          value={board.stats.avgRating !== null ? board.stats.avgRating.toFixed(2) : '—'}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      <section className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-heading text-base font-bold">Đang thực tập</h2>
          <Link
            href="/b2b/interns"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Xem tất cả <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {activeInterns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Chưa có học viên nào đang thực tập tại doanh nghiệp.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activeInterns.map((intern) => (
              <li key={intern.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {intern.studentName}
                    {intern.maSV && (
                      <span className="ml-2 font-normal text-muted-foreground">{intern.maSV}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {intern.position ?? 'Thực tập sinh'} · từ {dateFmt.format(new Date(intern.startDate))}
                  </p>
                </div>
                {intern.rating !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-700">
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    {intern.rating}
                  </span>
                ) : (
                  <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Chưa chấm
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
