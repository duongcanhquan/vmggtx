import { redirect } from 'next/navigation'
import { campusLoginPath } from '@/lib/utils/orgSlug'

type Props = { params: { slug: string } }

/** Tương thích URL cũ /coso/{slug}/student/login */
export default function LegacyStudentLoginRedirect({ params }: Props) {
  redirect(campusLoginPath(params.slug, 'student'))
}
