import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { NavProgress } from '@/components/shared/NavProgress'
import './globals.css'

// Heading serif "luxury editorial" — hỗ trợ đầy đủ tiếng Việt
const playfair = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GDTX ERP',
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
    <html lang="vi" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <NavProgress />
        {children}
      </body>
    </html>
  )
}
