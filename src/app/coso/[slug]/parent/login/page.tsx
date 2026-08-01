import { notFound } from 'next/navigation'
import { ParentLoginForm } from '@/components/auth/ParentLoginForm'
import { getPublicCampusBySlug } from '../../actions'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

export default async function CampusParentLoginPage({ params }: Props) {
  const { campus } = await getPublicCampusBySlug(params.slug)
  if (!campus) notFound()
  return <ParentLoginForm campus={campus} />
}
