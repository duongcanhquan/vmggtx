import { redirect } from 'next/navigation'

/**
 * Không còn trang danh sách cơ sở công khai.
 * Mỗi trường nhận link trực tiếp: /coso/{slug}/login
 * (tab Nhà trường | Gia đình). Hub /coso → về landing.
 */
export default function CampusDirectoryPage() {
  redirect('/login')
}
