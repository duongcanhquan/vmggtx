import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Be_Vietnam_Pro } from 'next/font/google'
import { NavProgress } from '@/components/shared/NavProgress'
import './globals.css'

// ============================================================
// FONT SYSTEM "đều và logic" — 2 sans hiện đại, cùng nhịp hình học:
// - Space Grotesk: tiêu đề (geometric, đắt tiền, hỗ trợ tiếng Việt)
// - Be Vietnam Pro: nội dung (thiết kế RIÊNG cho tiếng Việt, đều nét)
// ============================================================
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-heading',
  display: 'swap',
})

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EDU SYSTEM',
  description: 'Hệ thống Quản lý Giáo dục Đa cơ sở (Multi-campus) kết hợp AI',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${spaceGrotesk.variable} ${beVietnam.variable}`}>
      <body>
        {/* Nền aurora cố định - các trang kính mờ nổi lên trên */}
        <div className="aurora-bg" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
          <div className="aurora-blob aurora-blob-3" />
        </div>
        <NavProgress />
        {children}
      </body>
    </html>
  )
}
