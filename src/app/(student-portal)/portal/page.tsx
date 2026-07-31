import Link from 'next/link'
import { Bot, CalendarDays, ChevronRight, Medal, Star, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Trang chủ Cổng Học sinh: khảo sát đang chờ + lối tắt (bento cards).
const QUICK_LINKS = [
  {
    href: '/schedule',
    icon: CalendarDays,
    title: 'Lịch học',
    description: 'Các buổi học sắp tới của bạn',
    accent: 'bg-indigo-50 text-indigo-600',
  },
  {
    href: '/grades',
    icon: Medal,
    title: 'Kết quả học tập',
    description: 'Điểm số và trung bình dự kiến',
    accent: 'bg-violet-50 text-violet-600',
  },
  {
    href: '/tuition',
    icon: Wallet,
    title: 'Học phí',
    description: 'Hóa đơn và lịch sử đóng tiền',
    accent: 'bg-amber-50 text-amber-600',
  },
  {
    href: '/assistant',
    icon: Bot,
    title: 'Trợ lý AI',
    description: 'Gia sư AI hỗ trợ ôn tập 24/7',
    accent: 'bg-emerald-50 text-emerald-600',
  },
]

type PendingEvaluation = {
  token: string
  campaignName: string
  className: string
}

/**
 * Khảo sát giáo viên đang chờ: token CHƯA dùng của học sinh này
 * (RLS: học sinh chỉ SELECT được token của chính mình), thuộc đợt
 * đang active và còn trong khung ngày.
 */
async function getPendingEvaluations(): Promise<PendingEvaluation[]> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data: tokens } = await supabase
      .from('evaluation_tokens')
      .select(
        'token, is_used, evaluation_campaigns(name, status, start_date, end_date, deleted_at), classes(name)'
      )
      .eq('student_id', user.id)
      .eq('is_used', false)

    const today = new Date().toISOString().slice(0, 10)
    return (tokens ?? [])
      .filter((row) => {
        const campaign = row.evaluation_campaigns as unknown as {
          status: string
          start_date: string
          end_date: string
          deleted_at: string | null
        } | null
        return (
          campaign !== null &&
          campaign.deleted_at === null &&
          campaign.status === 'active' &&
          today >= campaign.start_date &&
          today <= campaign.end_date
        )
      })
      .map((row) => ({
        token: row.token as string,
        campaignName:
          (row.evaluation_campaigns as unknown as { name: string } | null)?.name ??
          'Khảo sát',
        className: (row.classes as unknown as { name: string } | null)?.name ?? '—',
      }))
  } catch {
    return []
  }
}

export default async function StudentPortalHomePage() {
  const pendingEvaluations = await getPendingEvaluations()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Xin chào! 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cổng thông tin dành cho Học sinh &amp; Phụ huynh của GDTX ERP.
        </p>
      </div>

      {/* ===== Khảo sát giáo viên đang chờ (ẩn danh) ===== */}
      {pendingEvaluations.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-amber-900">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            Bạn có {pendingEvaluations.length} khảo sát đang chờ
          </h2>
          <p className="mt-0.5 text-xs text-amber-800/80">
            Đánh giá hoàn toàn ẩn danh — nhà trường không biết ai đã gửi.
          </p>
          <ul className="mt-3 space-y-2">
            {pendingEvaluations.map((evaluation) => (
              <li key={evaluation.token}>
                <Link
                  href={`/evaluations/${evaluation.token}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-surface px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {evaluation.campaignName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Lớp {evaluation.className} · Bấm để đánh giá
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${link.accent}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-3 font-heading text-base font-bold text-foreground group-hover:text-primary">
                {link.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
