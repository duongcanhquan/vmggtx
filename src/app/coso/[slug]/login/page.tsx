import { notFound } from 'next/navigation'
import { CampusLoginTabs } from '@/components/auth/CampusLoginTabs'
import { getPublicCampusBySlug } from '../actions'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
  searchParams: { tab?: string; who?: string }
}

/**
 * Cổng đăng nhập cơ sở — 2 phần: Nhà trường | Gia đình
 * (Gia đình: Học viên MaSV/email+pass · Phụ huynh email+pass)
 */
export default async function CampusLoginPage({ params, searchParams }: Props) {
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
