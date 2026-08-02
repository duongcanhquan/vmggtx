import { redirect, notFound } from 'next/navigation'
import { getPublicCampusBySlug } from './actions'
import { campusLoginPath } from '@/lib/utils/orgSlug'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

/**
 * /coso/[slug] → thẳng cổng đăng nhập (bỏ màn chọn trung gian).
 */
export default async function CampusPortalPage({ params }: Props) {
  const { campus, error } = await getPublicCampusBySlug(params.slug)

  if (error && /045_org_slugs/i.test(error)) {
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
