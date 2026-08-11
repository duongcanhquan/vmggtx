import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Header trang gọn 1 hàng: tiêu đề nhỏ + cụm hành động bên phải.
 * Ưu tiên diện tích cho danh sách / nội dung bên dưới.
 */
export function PageHeader({
  title,
  icon: Icon,
  actions,
  className = '',
}: {
  title: string
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center justify-between gap-2 ${className}`}
    >
      <h1 className="flex min-w-0 items-center gap-2 font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
        {Icon ? (
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        ) : null}
        <span className="truncate">{title}</span>
      </h1>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
