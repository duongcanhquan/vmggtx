import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CampusLoginTabs } from '@/components/auth/CampusLoginTabs'
import { getPublicCampusBySlug } from '@/lib/campus/publicCampus'
import { resolveCampusSlugAlias } from '@/lib/campus/slugAliases'
import { isReservedOrgSlug } from '@/lib/utils/reservedSlugs'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
  searchParams: { tab?: string; who?: string }
}

/**
 * Cổng đăng nhập cơ sở — URL ngắn: /{slug}/login
 * 2 tab: Nhà trường | Gia đình (HV / PH)
 */
export default async function CampusLoginPage({ params, searchParams }: Props) {
  if (isReservedOrgSlug(params.slug)) notFound()

  const alias = resolveCampusSlugAlias(params.slug)
  if (alias && alias !== params.slug) {
    const qs = new URLSearchParams()
    if (searchParams.tab) qs.set('tab', searchParams.tab)
    if (searchParams.who) qs.set('who', searchParams.who)
    const q = qs.toString()
    redirect(`/${alias}/login${q ? `?${q}` : ''}`)
  }

  const { campus, error } = await getPublicCampusBySlug(params.slug)
  if (campus) {
    return (
      <CampusLoginTabs
        campus={campus}
        initialTab={searchParams.tab === 'family' ? 'family' : 'staff'}
        initialWho={searchParams.who === 'parent' ? 'parent' : 'student'}
      />
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950 shadow-sm">
        <p className="font-heading text-lg font-bold">Không mở được cổng cơ sở</p>
        <p className="mt-2 leading-relaxed">
          {error ??
            `Không tìm thấy đơn vị với mã «${params.slug}». Dùng đúng slug (vd. viet-my, có gạch ngang) hoặc tạo/seed đơn vị trên database.`}
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-amber-900/90">
          <li>
            Super Admin:{' '}
            <Link href="/login/admin" className="font-semibold underline">
              /login/admin
            </Link>
          </li>
          <li>
            Ví dụ đúng:{' '}
            <code className="rounded bg-white/70 px-1">/viet-my/login</code>
          </li>
        </ul>
      </div>
    </main>
  )
}
