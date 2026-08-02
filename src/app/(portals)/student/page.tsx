import { redirect } from 'next/navigation'

/**
 * Canonical cổng học viên = /portal (student-portal).
 * /student giữ ROUTE_RULES + bookmark cũ → redirect để một shell duy nhất.
 */
export default function StudentPortalAliasPage() {
  redirect('/portal')
}
