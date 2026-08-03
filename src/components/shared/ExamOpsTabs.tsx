'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: { href: string; label: string }[] = [
  { href: '/staff/exam-office', label: 'Tổng quan' },
  { href: '/staff/exam-bank', label: 'Ngân hàng đề' },
  { href: '/staff/exams', label: 'Kỳ thi' },
  { href: '/staff/exam-schedule', label: 'Lịch & giám thị' },
  { href: '/staff/assessments', label: 'Tổ chức / thi lại' },
  { href: '/staff/exam-grades', label: 'Điểm & công bố' },
  { href: '/staff/exam-export', label: 'Xuất TT thi' },
  { href: '/academic/transcripts', label: 'Bảng điểm' },
  { href: '/reports/exams', label: 'Báo cáo' },
  { href: '/staff/learning-pathways', label: 'Lộ trình HV' },
  { href: '/staff/results-approval', label: 'Xét duyệt' },
]

/** Tab điều hướng chung module Khảo thí */
export function ExamOpsTabs() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Luồng khảo thí"
      className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-surface p-2"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href !== '/staff/exam-office' && pathname.startsWith(tab.href))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
