'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Bot,
  Inbox,
  Loader2,
  MessageSquareQuote,
  Sparkles,
  Star,
  Users,
  Vote,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { ChartSkeleton } from '@/components/charts/ChartSkeleton'
import { useOrgStore } from '@/lib/store/useOrgStore'

// Lazy-load recharts: không chặn thời điểm trang tương tác được
const EvaluationBarChart = dynamic(() => import('@/components/charts/EvaluationBarChart'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
})
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  getEvaluationReport,
  summarizeTeacherFeedback,
  type TeacherEvalStat,
} from './actions'

// ============================================================
// BÁO CÁO ĐÁNH GIÁ GIÁO VIÊN (/academic/evaluations)
// Bar chart so sánh AVG rating giữa các giáo viên + panel chi tiết
// với nút [AI Tóm tắt ý kiến] (Điểm mạnh / Cần cải thiện).
// Dữ liệu 100% ẨN DANH - không truy ngược được học sinh nào chấm.
// ============================================================

const RATING_LABELS: { key: keyof TeacherEvalStat; label: string }[] = [
  { key: 'avgTeaching', label: 'Kỹ năng sư phạm' },
  { key: 'avgAttitude', label: 'Thái độ, nhiệt tình' },
  { key: 'avgPunctuality', label: 'Đi dạy đúng giờ' },
]

function ratingColor(score: number): string {
  if (score >= 4) return 'text-emerald-600'
  if (score >= 3) return 'text-amber-600'
  return 'text-rose-600'
}

export default function EvaluationReportPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [stats, setStats] = useState<TeacherEvalStat[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TeacherEvalStat | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    setLoadError(null)
    setSelected(null)
    setSummary(null)
    const result = await getEvaluationReport(currentOrgId)
    if (result.error !== undefined) {
      setLoadError(result.error)
      setStats([])
    } else {
      setStats(result.stats)
    }
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSummarize() {
    if (!selected || !currentOrgId) return
    setSummarizing(true)
    setSummary(null)
    const result = await summarizeTeacherFeedback(selected.teacherId, currentOrgId)
    setSummarizing(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setSummary(result.summary)
  }

  const chartData = stats.slice(0, 10).map((stat) => ({
    name: stat.teacherName,
    'Sư phạm': stat.avgTeaching,
    'Thái độ': stat.avgAttitude,
    'Đúng giờ': stat.avgPunctuality,
  }))

  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Campus Admin / Super Admin được xem báo cáo đánh giá giáo viên.
        </p>
      }
    >
      <div className="space-y-6">
        {/* ===== Header ===== */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              <Star className="h-7 w-7 text-primary" aria-hidden="true" />
              Báo cáo Đánh giá Giáo viên
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Khảo sát ẩn danh · thang 1-5</p>
          </div>
          <Link
            href="/academic/campaigns"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Vote className="h-4 w-4" aria-hidden="true" />
            Quản lý đợt khảo sát
          </Link>
        </div>

        {loadError && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {loadError}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tổng hợp kết quả khảo sát…
          </div>
        ) : stats.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Chưa có kết quả khảo sát.</p>
          </div>
        ) : (
          <>
            {/* ===== Bar chart so sánh giáo viên ===== */}
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-heading text-base font-bold">
                So sánh điểm trung bình giữa các giáo viên
                {stats.length > 10 && ' (top 10)'}
              </h2>
              <div className="mt-2 h-80">
                <EvaluationBarChart data={chartData} />
              </div>
            </div>

            {/* ===== Danh sách + chi tiết ===== */}
            <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
              {/* Bảng xếp hạng */}
              <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-5 py-3.5 font-semibold">Giáo viên</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Sư phạm</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Thái độ</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Đúng giờ</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">TB chung</th>
                      <th scope="col" className="px-5 py-3.5 font-semibold">Lượt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat) => (
                      <tr
                        key={stat.teacherId}
                        onClick={() => {
                          setSelected(stat)
                          setSummary(null)
                        }}
                        className={`cursor-pointer border-b border-border transition-colors duration-100 last:border-0 hover:bg-indigo-50/60 ${
                          selected?.teacherId === stat.teacherId ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <td className="px-5 py-3.5 font-medium text-foreground">
                          {stat.teacherName}
                        </td>
                        <td className={`px-5 py-3.5 font-semibold ${ratingColor(stat.avgTeaching)}`}>
                          {stat.avgTeaching}
                        </td>
                        <td className={`px-5 py-3.5 font-semibold ${ratingColor(stat.avgAttitude)}`}>
                          {stat.avgAttitude}
                        </td>
                        <td className={`px-5 py-3.5 font-semibold ${ratingColor(stat.avgPunctuality)}`}>
                          {stat.avgPunctuality}
                        </td>
                        <td className={`px-5 py-3.5 font-bold ${ratingColor(stat.avgOverall)}`}>
                          {stat.avgOverall}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {stat.totalResponses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Panel chi tiết + AI tóm tắt */}
              <div className="space-y-4">
                {!selected ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
                    <Users className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">Chọn giáo viên để xem chi tiết.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface p-5">
                    <h2 className="font-heading text-base font-bold">{selected.teacherName}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.totalResponses} lượt đánh giá ·{' '}
                      {selected.feedbackCount} ý kiến văn bản
                    </p>

                    <dl className="mt-3.5 space-y-2.5">
                      {RATING_LABELS.map(({ key, label }) => {
                        const score = selected[key] as number
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between text-sm">
                              <dt className="text-muted-foreground">{label}</dt>
                              <dd className={`font-bold ${ratingColor(score)}`}>
                                {score}/5
                              </dd>
                            </div>
                            <div
                              role="progressbar"
                              aria-valuenow={score}
                              aria-valuemin={0}
                              aria-valuemax={5}
                              aria-label={label}
                              className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
                            >
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                                style={{ width: `${(score / 5) * 100}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </dl>

                    <button
                      type="button"
                      onClick={handleSummarize}
                      disabled={summarizing || selected.feedbackCount === 0}
                      className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {summarizing ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                      )}
                      AI Tóm tắt ý kiến
                    </button>
                    {selected.feedbackCount === 0 && (
                      <p className="mt-1.5 text-center text-xs text-muted-foreground">
                        Chưa có ý kiến văn bản nào để tóm tắt.
                      </p>
                    )}
                  </div>
                )}

                {summary && (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                    <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-indigo-900">
                      <Bot className="h-4 w-4" aria-hidden="true" />
                      Tóm tắt bởi AI
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-indigo-900">
                      {summary}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-indigo-700/80">
                      <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden="true" />
                      Tổng hợp từ ý kiến ẩn danh — chỉ dùng tham khảo nội bộ.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
