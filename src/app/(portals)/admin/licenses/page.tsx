import { redirect } from 'next/navigation'

// ============================================================
// /admin/licenses đã GỘP vào /admin/modules (Module & Gói dịch vụ):
// chọn Đơn vị -> quản lý gói + ghép/gỡ/bật/tắt module một chỗ.
// Giữ route này để bookmark/link cũ không vỡ.
// ============================================================
export default function AdminLicensesPage() {
  redirect('/admin/modules')
}
