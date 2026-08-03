import { redirect } from 'next/navigation'
import { campusLoginPath } from '@/lib/utils/orgSlug'

type Props = { params: { slug: string } }

/** /coso/{slug} → /{slug}/login */
export default function LegacyCampusPortalRedirect({ params }: Props) {
  redirect(campusLoginPath(params.slug))
}
