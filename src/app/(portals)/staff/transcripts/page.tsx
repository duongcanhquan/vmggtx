import { redirect } from 'next/navigation'

/** Bookmark cũ /staff/transcripts → dashboard (tránh nhảy Staff Portal shell). */
export default function StaffTranscriptsRedirect() {
  redirect('/academic/transcripts')
}
