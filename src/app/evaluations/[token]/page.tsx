import type { Metadata } from 'next'
import { BadgeCheck, CalendarOff, ShieldQuestion } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { EvaluationForm } from './EvaluationForm'

// ============================================================
// FORM ĐÁNH GIÁ GIÁO VIÊN - TRANG PUBLIC (link gửi qua Zalo).
// Nằm NGOÀI (dashboard) và ngoài matcher middleware -> không cần
// đăng nhập. Server component verify token bằng Admin client và
// CHỈ trả về Tên giáo viên + Tên lớp (không lộ tên học sinh).
// ============================================================

export const metadata: Metadata = {
  title: 'Đánh giá giáo viên | GDTX ERP',
}

type TokenState =
  | { kind: 'invalid' }
  | { kind: 'used' }
  | { kind: 'closed'; campaignName: string }
  | { kind: 'ok'; campaignName: string; className: string; teacherName: string }

async function checkToken(rawToken: string): Promise<TokenState> {
  const token = decodeURIComponent(rawToken).trim().toUpperCase()
  if (!token || token.length > 24) return { kind: 'invalid' }

  const admin = createAdminClient()
  const { data: tokenRow } = await admin
    .from('evaluation_tokens')
    .select('id, campaign_id, class_id, is_used')
    .eq('token', token)
    .maybeSingle()
  if (!tokenRow) return { kind: 'invalid' }
  if (tokenRow.is_used) return { kind: 'used' }

  const [{ data: campaign }, { data: cls }] = await Promise.all([
    admin
      .from('evaluation_campaigns')
      .select('name, status, start_date, end_date')
      .eq('id', tokenRow.campaign_id)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('classes')
      .select('name, teacher_id')
      .eq('id', tokenRow.class_id)
      .is('deleted_at', null)
      .maybeSingle(),
  ])
  if (!campaign || !cls) return { kind: 'invalid' }

  const today = new Date().toISOString().slice(0, 10)
  if (
    campaign.status !== 'active' ||
    today < (campaign.start_date as string) ||
    today > (campaign.end_date as string)
  ) {
    return { kind: 'closed', campaignName: campaign.name }
  }

  let teacherName = 'Giáo viên phụ trách'
  if (cls.teacher_id) {
    const { data: teacher } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', cls.teacher_id)
      .maybeSingle()
    if (teacher?.full_name) teacherName = teacher.full_name
  }

  return {
    kind: 'ok',
    campaignName: campaign.name,
    className: cls.name,
    teacherName,
  }
}

function StatusCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
      {icon}
      <h1 className="font-heading text-lg font-bold text-foreground">{title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

export default async function PublicEvaluationPage({
  params,
}: {
  params: { token: string }
}) {
  const state = await checkToken(params.token)

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-background to-background px-4 py-8">
      <div className="mx-auto w-full max-w-[480px]">
        <p className="mb-4 text-center font-heading text-sm font-bold uppercase tracking-widest text-primary">
          GDTX ERP · Khảo sát ẩn danh
        </p>

        {state.kind === 'invalid' && (
          <StatusCard
            icon={<ShieldQuestion className="h-10 w-10 text-rose-500" aria-hidden="true" />}
            title="Mã không hợp lệ"
            description="Đường link hoặc mã khảo sát không tồn tại. Vui lòng kiểm tra lại tin nhắn được gửi cho bạn."
          />
        )}
        {state.kind === 'used' && (
          <StatusCard
            icon={<BadgeCheck className="h-10 w-10 text-emerald-500" aria-hidden="true" />}
            title="Bạn đã gửi đánh giá"
            description="Mã này đã được sử dụng. Mỗi mã chỉ dùng được một lần để đảm bảo tính công bằng của khảo sát. Cảm ơn bạn!"
          />
        )}
        {state.kind === 'closed' && (
          <StatusCard
            icon={<CalendarOff className="h-10 w-10 text-amber-500" aria-hidden="true" />}
            title="Đợt khảo sát đã đóng"
            description={`"${state.campaignName}" hiện không trong thời gian nhận đánh giá. Vui lòng liên hệ nhà trường nếu bạn nghĩ đây là nhầm lẫn.`}
          />
        )}
        {state.kind === 'ok' && (
          <EvaluationForm
            token={decodeURIComponent(params.token).trim().toUpperCase()}
            campaignName={state.campaignName}
            className={state.className}
            teacherName={state.teacherName}
          />
        )}
      </div>
    </main>
  )
}
