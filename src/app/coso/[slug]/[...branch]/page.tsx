import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Building2, ChevronRight, HeartHandshake, Users } from 'lucide-react'
import { getPublicBranchChain } from '../actions'
import { campusLoginPath } from '@/lib/utils/orgSlug'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string; branch: string[] } }

/**
 * URL PHÂN CẤP: /coso/[khach-hang]/[co-so]/[nhanh]/…
 * Mỗi đoạn là slug của một nhánh con bên trong Đơn vị khách hàng.
 * Trang hiển thị đúng ngữ cảnh nhánh (breadcrumb đầy đủ) nhưng vẫn dùng
 * MỘT cổng đăng nhập chung của Đơn vị — hệ thống tự nhận diện người dùng
 * thuộc cơ sở nào sau khi đăng nhập.
 */
export default async function BranchPortalPage({ params }: Props) {
  const { data } = await getPublicBranchChain(params.slug, params.branch)
  if (!data) notFound()

  const { campus, chain } = data
  const current = chain[chain.length - 1]

  const portals = [
    {
      href: campusLoginPath(campus.slug, 'management'),
      title: 'Nhà trường & Giảng viên',
      desc: 'Quản trị, giáo vụ, kế toán, lịch dạy, điểm danh',
      icon: Building2,
      tint: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
      iconBg: 'bg-indigo-100 text-indigo-600',
    },
    {
      href: campusLoginPath(campus.slug, 'student'),
      title: 'Gia đình · Học viên & Phụ huynh',
      desc: 'Bài giảng, bài tập, điểm số, sổ liên lạc điện tử',
      icon: HeartHandshake,
      tint: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
  ] as const

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/40 to-emerald-50/30">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl motion-safe:animate-pulse"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl"
      />

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
            <Users className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            EDU SYSTEM
          </p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {current.name}
          </h1>

          {/* Breadcrumb phân cấp: Khách hàng › Cơ sở › Nhánh */}
          <nav
            aria-label="Trực thuộc"
            className="mt-2.5 flex flex-wrap items-center justify-center gap-1 text-sm font-medium text-indigo-700"
          >
            <Link href={`/coso/${campus.slug}`} className="hover:underline">
              {campus.name}
            </Link>
            {chain.map((node, index) => (
              <span key={node.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                {index === chain.length - 1 ? (
                  <span className="text-slate-700">{node.name}</span>
                ) : (
                  <Link
                    href={`/coso/${campus.slug}/${chain
                      .slice(0, index + 1)
                      .map((c) => c.slug)
                      .join('/')}`}
                    className="hover:underline"
                  >
                    {node.name}
                  </Link>
                )}
              </span>
            ))}
          </nav>

        </div>

        <ul className="grid gap-3 sm:gap-4">
          {portals.map((portal) => {
            const Icon = portal.icon
            return (
              <li key={portal.href}>
                <Link
                  href={portal.href}
                  className={`group flex items-center gap-4 rounded-2xl ring-1 ${portal.tint} px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${portal.iconBg}`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-heading text-base font-bold">
                      {portal.title}
                    </span>
                    <span className="mt-0.5 block text-sm opacity-80">{portal.desc}</span>
                  </span>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            )
          })}
        </ul>

        <p className="mt-8 text-center text-xs text-slate-400">
          <Link
            href={`/coso/${campus.slug}`}
            className="font-semibold text-indigo-600 hover:underline"
          >
            ← Về cổng chính {campus.name}
          </Link>
        </p>
      </div>
    </main>
  )
}
