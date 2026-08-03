import { redirect, notFound } from 'next/navigation'
import { getPublicBranchChain } from '../actions'
import { campusLoginPath } from '@/lib/utils/orgSlug'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string; branch: string[] } }

/** Nhánh cũ /coso/{slug}/... → login đơn vị gốc (URL mới) */
export default async function BranchPortalPage({ params }: Props) {
  const { data } = await getPublicBranchChain(params.slug, params.branch)
  if (!data) notFound()
  redirect(campusLoginPath(data.campus.slug))
}
