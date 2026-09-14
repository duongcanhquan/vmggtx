import { notFound, redirect } from 'next/navigation'
import { getPublicCampusBySlug } from '@/lib/campus/publicCampus'
import { resolveCampusSlugAlias } from '@/lib/campus/slugAliases'
import { campusLoginPath } from '@/lib/utils/orgSlug'
import { isReservedOrgSlug } from '@/lib/utils/reservedSlugs'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

/** /{slug} → thẳng cổng login cơ sở */
export default async function CampusRootPage({ params }: Props) {
  if (isReservedOrgSlug(params.slug)) notFound()

  const alias = resolveCampusSlugAlias(params.slug)
  if (alias && alias !== params.slug) {
    redirect(`/${alias}`)
  }

  const { campus, error } = await getPublicCampusBySlug(params.slug)

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-heading text-lg font-bold">Chưa sẵn sàng</p>
          <p className="mt-2">{error}</p>
        </div>
      </main>
    )
  }
  if (!campus) notFound()

  redirect(campusLoginPath(campus.slug))
}
