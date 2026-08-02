import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

// Trang chủ công khai — landing giới thiệu EDU SYSTEM.
// Superadmin: icon sách mờ góc trái dưới → /login/admin
// Cơ sở: /coso/[slug]/login

export const metadata: Metadata = {
  title: 'EDU SYSTEM — Quản lý trường học nhiều cơ sở',
  description:
    'Một hệ thống cho nhiều cơ sở: lớp học, điểm danh, học online, AI, học phí, sổ liên lạc phụ huynh.',
}

export default function LoginLandingPage() {
  return <LandingPage />
}
