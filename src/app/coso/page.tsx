import { redirect } from 'next/navigation'

/**
 * Hub /coso đã bỏ. Link cũ → landing công khai.
 * Cổng cơ sở: /{slug}/login
 */
export default function CampusDirectoryPage() {
  redirect('/login')
}
