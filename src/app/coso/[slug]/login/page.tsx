import { notFound } from 'next/navigation'
import { CampusLoginTabs } from '@/components/auth/CampusLoginTabs'
import { getPublicCampusBySlug } from '../actions'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
  searchParams: { tab?: string; who?: string }
}

/**
 * CỔNG ĐĂNG NHẬP DUY NHẤT của cơ sở — 2 phần trong 1 trang:
 * - Nhà trường · Giảng viên (mặc định)
 * - Gia đình: Học viên / Phụ huynh (?tab=family, ?who=parent)
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
