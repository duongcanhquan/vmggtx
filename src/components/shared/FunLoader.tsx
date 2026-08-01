'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Backpack,
  BellRing,
  BookOpenCheck,
  Coffee,
  FlaskConical,
  GraduationCap,
  Lightbulb,
  NotebookPen,
  Pencil,
  School,
  Sparkles,
  Timer,
  type LucideIcon,
} from 'lucide-react'

// ============================================================
// FunLoader - bộ loader "vui" dùng chung toàn hệ thống.
// Thông điệp xoay vòng mỗi ~1.6s để giảm cảm giác chờ đợi.
// Dùng: <FunLoader /> hoặc <FunLoader label="Đang tải sổ điểm…" />
// ============================================================

const FUN_MESSAGES: { icon: LucideIcon; text: string }[] = [
  { icon: BellRing, text: 'Trống trường sắp điểm, dữ liệu sắp về…' },
  { icon: Pencil, text: 'Đang mài bút chì cho thật nhọn…' },
  { icon: NotebookPen, text: 'Đang truy bài các con số…' },
  { icon: School, text: 'Đang lau bảng, chờ xíu nhé…' },
  { icon: BookOpenCheck, text: 'Đang gọi sổ điểm dậy…' },
  { icon: Coffee, text: 'Đang rót trà mời phụ huynh…' },
  { icon: GraduationCap, text: 'Thầy hiệu trưởng đang ký duyệt…' },
  { icon: Backpack, text: 'Đang soạn cặp sách cho dữ liệu…' },
  { icon: FlaskConical, text: 'Đang pha chế số liệu trong phòng thí nghiệm…' },
  { icon: Timer, text: 'Đang điểm danh dữ liệu… bạn nào vắng?' },
  { icon: Lightbulb, text: 'Ý tưởng lớn cần vài giây suy nghĩ…' },
  { icon: Sparkles, text: 'Đang đánh bóng từng pixel cho đẹp…' },
]

type FunLoaderProps = {
  /** Nhãn ngữ cảnh (VD: "Đang tải sổ điểm…") - hiện trước, sau đó xoay câu vui */
  label?: string
  /** 'block' = khối lớn giữa trang (mặc định) | 'inline' = 1 dòng nhỏ */
  variant?: 'block' | 'inline'
  className?: string
}

export function FunLoader({ label, variant = 'block', className = '' }: FunLoaderProps) {
  // Có label: hiện label trước rồi xen kẽ câu vui.
  // Không label: bắt đầu từ câu ngẫu nhiên để mỗi lần chờ một câu khác.
  const sequence = useMemo(() => {
    const shuffled = [...FUN_MESSAGES].sort(() => Math.random() - 0.5)
    return label ? [{ icon: Timer, text: label }, ...shuffled] : shuffled
  }, [label])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % sequence.length),
      1600
    )
    return () => clearInterval(timer)
  }, [sequence])

  const message = sequence[index]
  const Icon = message.icon

  if (variant === 'inline') {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${className}`}
      >
        <Icon key={index} className="fun-loader-icon h-4 w-4 shrink-0 text-[#a16207]" aria-hidden="true" />
        <span key={`t-${index}`} className="fun-loader-text">
          {message.text}
        </span>
      </span>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm ${className}`}
    >
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-stone-200 border-t-[#c9a227]" />
        <Icon key={index} className="fun-loader-icon h-5 w-5 text-[#a16207]" aria-hidden="true" />
      </span>
      <p key={`t-${index}`} className="fun-loader-text text-sm font-medium text-muted-foreground">
        {message.text}
      </p>
    </div>
  )
}
