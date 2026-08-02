import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

// Trang chủ công khai — landing giới thiệu EDU SYSTEM.
// Superadmin: icon sách mờ góc trái dưới → /login/admin
// Cơ sở: /coso/[slug]/login

export const metadata: Metadata = {
  title: 'EDU SYSTEM — Quản lý trường học đa cơ sở tích hợp AI',
  description:
    'Hệ thống quản lý giáo dục all-in-one: đa tầng, đa cơ sở, đào tạo, nhân sự, LMS, AI chatbot, lịch dạy thông minh.',
}

export default function LoginLandingPage() {
  return <LandingPage />
}
