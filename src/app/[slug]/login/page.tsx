import { notFound, redirect } from 'next/navigation'
import { CampusLoginTabs } from '@/components/auth/CampusLoginTabs'
import { getPublicCampusBySlug } from '@/app/coso/[slug]/actions'
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

  const { campus } = await getPublicCampusBySlug(params.slug)
  if (!campus) notFound()

  return (
    <CampusLoginTabs
      campus={campus}
      initialTab={searchParams.tab === 'family' ? 'family' : 'staff'}
      initialWho={searchParams.who === 'parent' ? 'parent' : 'student'}
    />
  )
}
