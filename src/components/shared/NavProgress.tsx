'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// ============================================================
// THANH TIẾN TRÌNH CHUYỂN TRANG (toàn cục, gắn ở root layout).
//
// Vì sao: khi bấm menu/link, App Router phải tải RSC payload nên
// có độ trễ mạng - nếu màn hình đứng im, người dùng cảm giác
// "bấm không ăn". Component này hiện NGAY một thanh chạy trên
// cùng màn hình từ thời điểm click (capture phase - trước cả khi
// Next.js xử lý), và tự ẩn khi pathname đổi (trang mới đã vào).
// ============================================================

export function NavProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Trang mới đã render -> tắt thanh tiến trình
  useEffect(() => {
    setVisible(false)
    if (safetyTimer.current) {
      clearTimeout(safetyTimer.current)
      safetyTimer.current = null
    }
  }, [pathname])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      // Bỏ qua mở tab mới / phím tắt
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href]')
      if (!anchor) return
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href') ?? ''
      if (!href.startsWith('/')) return // external / mailto / hash

      const url = new URL(href, window.location.origin)
      if (url.pathname === window.location.pathname) return // cùng trang

      setVisible(true)
      // An toàn: nếu điều hướng bị hủy/lỗi, tự ẩn sau 8s
      if (safetyTimer.current) clearTimeout(safetyTimer.current)
      safetyTimer.current = setTimeout(() => setVisible(false), 8000)
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      if (safetyTimer.current) clearTimeout(safetyTimer.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden"
    >
      <div className="nav-progress-bar h-full rounded-r-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-[#e5c369] shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
    </div>
  )
}
