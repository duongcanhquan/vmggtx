'use client'

import {
  BookOpen,
  CalendarCog,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  FileSpreadsheet,
  FileStack,
  GraduationCap,
  PenSquare,
  Projector,
  RefreshCcw,
  ShieldCheck,
  Users,
  LayoutDashboard,
  BarChart3,
} from 'lucide-react'
import { PortalShell, type PortalNavGroup } from '@/components/shared/PortalShell'
import { MyOrgBadge } from '@/components/shared/MyOrgBadge'

// ============================================================
// Layout STAFF PORTAL — tách Hành chính (đào tạo) vs Khảo thí.
// ============================================================

const STAFF_NAV: PortalNavGroup[] = [
  {
    label: 'Hành chính · Đào tạo',
    items: [
      { label: 'Học viên', href: '/students', icon: Users },
      { label: 'Lớp học', href: '/staff/classes', icon: BookOpen },
      { label: 'Xếp lịch / TKB', href: '/academic/schedule', icon: CalendarRange },
      { label: 'Thời khóa biểu', href: '/staff/timetable', icon: CalendarRange },
      { label: 'Điều phối lịch', href: '/staff/schedule-management', icon: CalendarCog },
      { label: 'Điểm danh', href: '/attendance', icon: ClipboardCheck },
      { label: 'Đặt phòng / TB / xe', href: '/staff/facilities', icon: Projector },
    ],
  },
  {
    label: 'Khảo thí',
    items: [
      { label: 'Trung tâm Khảo thí', href: '/staff/exam-office', icon: LayoutDashboard },
      { label: 'Ngân hàng đề', href: '/staff/exam-bank', icon: FileStack },
      { label: 'Kỳ thi', href: '/staff/exams', icon: PenSquare },
      { label: 'Lịch thi & Giám thị', href: '/staff/exam-schedule', icon: ShieldCheck },
      { label: 'Tổ chức thi & Thi lại', href: '/staff/assessments', icon: RefreshCcw },
      { label: 'Điểm & công bố', href: '/staff/exam-grades', icon: CheckSquare },
      { label: 'Xuất TT thi', href: '/staff/exam-export', icon: FileSpreadsheet },
      { label: 'Bảng điểm tổng', href: '/academic/transcripts', icon: FileSpreadsheet },
      { label: 'Báo cáo thi cử', href: '/reports/exams', icon: BarChart3 },
      { label: 'Lộ trình học tập', href: '/staff/learning-pathways', icon: GraduationCap },
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
