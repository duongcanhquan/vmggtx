import { redirect } from 'next/navigation'
import { campusLoginPath } from '@/lib/utils/orgSlug'

type Props = {
  params: { slug: string }
  searchParams: { tab?: string; who?: string }
}

/** /coso/{slug}/login → /{slug}/login (giữ query tab/who) */
export default function LegacyCampusLoginRedirect({
  params,
  searchParams,
}: Props) {
  const base = campusLoginPath(
    params.slug,
    searchParams.who === 'parent'
      ? 'parent'
      : searchParams.tab === 'family'
        ? 'student'
        : 'management'
  )
  redirect(base)
}
