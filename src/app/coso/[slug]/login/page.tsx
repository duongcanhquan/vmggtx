import { notFound } from 'next/navigation'
import { StaffLoginForm } from '@/components/auth/StaffLoginForm'
import { getPublicCampusBySlug } from '../actions'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

export default async function CampusStaffLoginPage({ params }: Props) {
  const { campus } = await getPublicCampusBySlug(params.slug)
  if (!campus) notFound()
  return <StaffLoginForm campus={campus} />
}
