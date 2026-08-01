import { notFound } from 'next/navigation'
import { StudentLoginForm } from '@/components/auth/StudentLoginForm'
import { getPublicCampusBySlug } from '../../actions'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

export default async function CampusStudentLoginPage({ params }: Props) {
  const { campus } = await getPublicCampusBySlug(params.slug)
  if (!campus) notFound()
  return <StudentLoginForm campus={campus} />
}
