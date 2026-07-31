'use client'

import {
  BookOpen,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  FileSpreadsheet,
  FileStack,
  PenSquare,
  Users,
} from 'lucide-react'
import { PortalShell, type PortalNavGroup } from '@/components/shared/PortalShell'
import { MyOrgBadge } from '@/components/shared/MyOrgBadge'

// ============================================================
// Layout STAFF PORTAL (/staff/*) — Vận hành & Khảo thí.
// Header hiển thị TÊN CƠ SỞ đang trực thuộc (badge tĩnh —
// Staff KHÔNG được đổi cơ sở, khác Admin dùng OrgTreeSelector).
// ============================================================

const STAFF_NAV: PortalNavGroup[] = [
  {
    label: 'Hành chính',
    items: [
      { label: 'Học viên', href: '/students', icon: Users },
      { label: 'Lớp học', href: '/staff/classes', icon: BookOpen },
      { label: 'Thời khóa biểu', href: '/staff/timetable', icon: CalendarRange },
      { label: 'Điểm danh', href: '/attendance', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Khảo thí',
    items: [
      { label: 'Ngân hàng đề', href: '/staff/exam-bank', icon: FileStack },
      { label: 'Kỳ thi', href: '/staff/exams', icon: PenSquare },
      { label: 'Bảng điểm tổng', href: '/staff/transcripts', icon: FileSpreadsheet },
      { label: 'Xét duyệt kết quả', href: '/staff/results-approval', icon: CheckSquare },
    ],
  },
]

export default function StaffPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalShell
      portalName="Staff Portal"
      navGroups={STAFF_NAV}
      storageKey="gdtx-sidebar-staff"
      headerRight={<MyOrgBadge />}
    >
      {children}
    </PortalShell>
  )
}
