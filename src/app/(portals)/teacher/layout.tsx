'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  CalendarCheck,
  GraduationCap,
  MonitorPlay,
  PenSquare,
  Sparkles,
} from 'lucide-react'
import { QuickAttendanceButton } from '@/components/shared/QuickAttendanceButton'

// ============================================================
// Layout TEACHER PORTAL (/teacher/*) — TABLET-FIRST.
// Top Navigation ngang (không sidebar): các tab lớn, chạm dễ trên
// tablet; mobile thu về icon-only. Header có nút Điểm danh nhanh.
// ============================================================

const TEACHER_MENU = [
  { label: 'Lịch dạy hôm nay', href: '/teacher', icon: CalendarCheck },
  { label: 'Các lớp phụ trách', href: '/teacher/classes', icon: BookOpen },
  { label: 'Chấm điểm', href: '/teacher/grading', icon: PenSquare },
  { label: 'LMS Online', href: '/teacher/lms', icon: MonitorPlay },
  { label: 'Trợ lý AI', href: '/teacher/assistant', icon: Sparkles },
]

export default function TeacherPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* ===== Header: brand + Điểm danh nhanh ===== */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/teacher"
            className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-base font-bold leading-tight tracking-tight">
                GDTX <span className="text-primary">ERP</span>
              </span>
              <span className="hidden text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:block">
                Teacher Portal
              </span>
            </span>
          </Link>

          <QuickAttendanceButton />
        </div>

        {/* ===== Top Navigation (tablet-first, cuộn ngang nếu chật) ===== */}
        <nav
          aria-label="Menu giáo viên"
          className="mx-auto w-full max-w-5xl overflow-x-auto px-2 sm:px-4"
        >
          <ul className="flex min-w-max items-center gap-1 pb-2">
            {TEACHER_MENU.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === '/teacher'
                  ? pathname === '/teacher'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-indigo-50 hover:text-primary'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  )
}
