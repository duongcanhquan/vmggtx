import { redirect } from 'next/navigation'

type Props = { params: { slug: string } }

/** URL cũ — mỗi cơ sở giờ chỉ có 1 cổng login duy nhất (tab Gia đình · Phụ huynh) */
export default function CampusParentLoginRedirect({ params }: Props) {
  redirect(`/coso/${params.slug}/login?tab=family&who=parent`)
}
