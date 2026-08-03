import { redirect } from 'next/navigation'

/** Bookmark cũ /admin/ai → Cài đặt chung · tab API theo Đơn vị */
export default function AdminAIRedirectPage() {
  redirect('/admin/settings?tab=api-units')
}
