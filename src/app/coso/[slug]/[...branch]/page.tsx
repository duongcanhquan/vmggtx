import { redirect, notFound } from 'next/navigation'
import { getPublicBranchChain } from '../actions'
import { campusLoginPath } from '@/lib/utils/orgSlug'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string; branch: string[] } }

/** Nhánh con → thẳng login của đơn vị gốc (bỏ màn chọn trung gian). */
export default async function BranchPortalPage({ params }: Props) {
  const { data } = await getPublicBranchChain(params.slug, params.branch)
  if (!data) notFound()
  redirect(campusLoginPath(data.campus.slug))
}
