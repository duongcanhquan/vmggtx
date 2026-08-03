import Link from 'next/link'
import {
  Bell,
  Bot,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Medal,
  Star,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  getMyNotifications,
  markAllNotificationsRead,
} from './notification-actions'

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
  const [pendingEvaluations, notifications] = await Promise.all([
    getPendingEvaluations(),
    getMyNotifications(),
  ])
  const unreadCount = notifications.filter((n) => n.read_at === null).length

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Xin chào! 👋
      </h1>

      {/* ===== Thông báo đẩy: nhắc học phí, đổi lịch… ===== */}
      {notifications.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
              <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
              Thông báo
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </h2>
            {unreadCount > 0 && (
              <form action={markAllNotificationsRead}>
                <button
                  type="submit"
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Đã đọc hết
                </button>
              </form>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {notifications.slice(0, 5).map((notice) => {
              const unread = notice.read_at === null
              const isTuition = notice.type === 'tuition_reminder'
              const content = (
                <>
                  <p
                    className={`text-sm ${
                      unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                    }`}
                  >
                    {isTuition && (
                      <Wallet
                        className="mr-1 inline h-3.5 w-3.5 text-amber-600"
                        aria-hidden="true"
                      />
                    )}
                    {notice.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{notice.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    {new Date(notice.created_at).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </>
              )
              const itemClass = `block rounded-xl border px-3.5 py-3 transition-colors ${
                unread
                  ? isTuition
                    ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
                    : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100/70'
                  : 'border-border bg-background hover:bg-indigo-50/40'
              }`
              return (
                <li key={notice.id}>
                  {notice.link ? (
                    <Link href={notice.link} className={itemClass}>
                      {content}
                    </Link>
                  ) : (
                    <div className={itemClass}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ===== Khảo sát giáo viên đang chờ (ẩn danh) ===== */}
      {pendingEvaluations.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-amber-900">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            Bạn có {pendingEvaluations.length} khảo sát đang chờ
          </h2>
          <p className="mt-0.5 text-xs text-amber-800/80">
            Đánh giá giảng viên lớp bạn học — ẩn danh, mỗi lớp 1 lần trong kỳ.
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
                      Lớp {evaluation.className}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
