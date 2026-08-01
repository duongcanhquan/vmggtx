'use client'

import { StaffLoginForm } from '@/components/auth/StaffLoginForm'

// Cổng đăng nhập toàn hệ thống (không gắn 1 cơ sở).
// Cổng theo cơ sở: /coso/[slug]/login
export default function LoginPage() {
  return <StaffLoginForm />
}
