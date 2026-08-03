import { redirect } from 'next/navigation'
import { campusLoginPath } from '@/lib/utils/orgSlug'

type Props = { params: { slug: string } }

export default function LegacyParentLoginRedirect({ params }: Props) {
  redirect(campusLoginPath(params.slug, 'parent'))
}
