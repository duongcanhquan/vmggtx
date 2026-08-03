import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

// Trang chủ công khai — landing EDU SYSTEM.
// Superadmin: bấm góc trái dưới → icon sách → /login/admin
// Cơ sở: /{slug}/login (vd. /viet-my/login)

export const metadata: Metadata = {
  title: 'EDU SYSTEM — Quản lý trường học nhiều cơ sở',
  description:
    'Một hệ thống cho nhiều cơ sở: lớp học, điểm danh, học online, AI, học phí, sổ liên lạc phụ huynh.',
}

export default function LoginLandingPage() {
  return <LandingPage />
}
