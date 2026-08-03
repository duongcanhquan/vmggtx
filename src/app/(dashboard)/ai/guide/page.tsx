'use client'

import Link from 'next/link'
import {
  Bot,
  BookMarked,
  Building2,
  GraduationCap,
  Inbox,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'

/**
 * Hướng dẫn phân quyền + chỗ gắn AI trong vận hành.
 * Không thay ma trận /admin/permissions — bổ sung góc nhìn quản lý.
 */
const ROLE_ROWS: { role: string; sees: string; ai: string }[] = [
  {
    role: 'Super Admin',
    sees: 'Chỉ /admin/*: đơn vị, gói module, API HQ, cấp quyền module',
    ai: 'Phân bổ API AI theo đơn vị (Cài đặt chung → API theo Đơn vị)',
  },
  {
    role: 'Admin cơ sở',
    sees: 'Toàn bộ vận hành trong cây org; ma trận menu + kiêm nhiệm',
    ai: 'Bật module AI, nạp KB, cấu hình CRM AI, trợ lý quản lý',
  },
  {
    role: 'Giáo vụ / Tuyển sinh / Kế toán',
    sees: 'Menu theo defaultRoles + ghi đè permissions + grants',
    ai: 'CRM AI (tuyển sinh); Copilot/KB nếu được cấp ai_kb',
  },
  {
    role: 'Giáo viên',
    sees: 'Portal /teacher + menu Dashboard nếu được grant',
    ai: 'Trợ lý giảng dạy, LMS draft bài, Gia sư lớp (RAG)',
  },
  {
    role: 'Học viên / Phụ huynh',
    sees: 'Cổng /portal và Sổ liên lạc — không dùng menu dashboard',
    ai: 'Gia sư AI theo lớp (HV); PH không chat AI',
  },
]

const AI_HOOKS: {
  title: string
  href: string
  icon: typeof Sparkles
  body: string
}[] = [
  {
    title: 'AI soạn trong form (D45)',
    href: '/announcements',
    icon: Sparkles,
    body: 'Nút «AI soạn» điền thẳng: thông báo, ngân hàng đề, sổ liên lạc, cảnh báo PH, khoản thu, lý do nghỉ, import HV.',
  },
  {
    title: 'Nút nổi Hỏi AI (mọi module)',
    href: '/crm/leads',
    icon: Sparkles,
    body: 'Góc phải dưới Dashboard + Staff Portal: đổi ngữ cảnh theo trang (tuyển sinh / đào tạo / CSVC / khảo thí / NS / tài chính).',
  },
  {
    title: 'Kho tri thức (RAG)',
    href: '/ai/knowledge-base',
    icon: BookMarked,
    body: 'Nạp tài liệu theo category: admissions, training, hr, finance, exams, admin, general — lọc org_id.',
  },
  {
    title: 'AI tuyển sinh (CRM)',
    href: '/crm/leads',
    icon: Inbox,
    body: 'Khối hỏi nhanh trên pipeline + AI trong drawer lead (tóm tắt, kịch bản gọi, follow-up).',
  },
  {
    title: 'Gia sư / LMS',
    href: '/teacher/lms',
    icon: GraduationCap,
    body: 'GV soạn bài bằng AI; HV hỏi theo tài liệu lớp (không lẫn cơ sở khác).',
  },
  {
    title: 'Trợ lý giáo viên',
    href: '/teacher/assistant',
    icon: Bot,
    body: 'Soạn giáo án 45 phút từ KB training — key theo org_ai_settings.',
  },
  {
    title: 'API theo đơn vị',
    href: '/admin/settings?tab=api-units',
    icon: KeyRound,
    body: 'Super Admin gán OpenAI/Anthropic/Google riêng từng cơ sở hoặc để kế thừa HQ/env.',
  },
  {
    title: 'Ma trận phân quyền',
    href: '/admin/permissions',
    icon: ShieldCheck,
    body: 'Ghi đè menu theo role trong cơ sở; kiêm nhiệm user tại Tổ chức nhân sự.',
  },
]

export default function AiManagementGuidePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          Phân quyền & AI hỗ trợ quản lý
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tóm tắt cách hệ thống chặn quyền (menu + RLS + license) và các điểm gắn AI vào vận
          hành hàng ngày.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          Ai thấy gì?
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Vai trò</th>
                <th className="py-2 pr-3 font-semibold">Phạm vi</th>
                <th className="py-2 font-semibold">AI liên quan</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ROWS.map((row) => (
                <tr key={row.role} className="border-b border-border/70 align-top">
                  <td className="py-2.5 pr-3 font-semibold text-foreground">{row.role}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{row.sees}</td>
                  <td className="py-2.5 text-muted-foreground">{row.ai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Ba tầng: (1) role mặc định trong code, (2) ma trận menu theo cơ sở, (3) module license +
          tắt module + quyền kiêm nhiệm. CSVC: mọi cán bộ/GV được role mặc định có thể{' '}
          <strong>đặt</strong> phòng/xe; chỉ quản lý duyệt / danh mục phòng.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {AI_HOOKS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                {item.title}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </Link>
          )
        })}
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3.5 text-sm text-indigo-950">
        <p className="flex items-center gap-2 font-semibold">
          <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Việc cần làm để AI «chạy thật»
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-indigo-900">
          <li>Super Admin cấp module liên quan (CRM / LMS / ai_kb) trong Gói dịch vụ.</li>
          <li>Gắn API key HQ hoặc theo đơn vị tại Cài đặt chung.</li>
          <li>Admin cơ sở nạp tài liệu KB đúng category (admissions, quy chế…).</li>
          <li>Tại Phân quyền: mở menu CRM / Kho tri thức cho đúng role vận hành.</li>
        </ol>
      </section>
    </div>
  )
}
