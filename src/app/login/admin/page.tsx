'use client'

import { StaffLoginForm } from '@/components/auth/StaffLoginForm'

// Cổng đăng nhập SUPER ADMIN / quản trị hệ thống (ẩn từ landing).
// Cơ sở dùng /coso/[slug]/login — không dùng trang này.
export default function SystemAdminLoginPage() {
  return <StaffLoginForm />
}
