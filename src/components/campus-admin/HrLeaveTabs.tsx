'use client'

import { CalendarClock, Palmtree } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'
import { useMyRole } from '@/lib/hooks/useMyRole'
import type { Role } from '@/lib/auth/roles'

/** Gộp Ngày công (quản lý) + Xin nghỉ phép (cá nhân). */
export function HrLeaveTabs() {
  const role = useMyRole()
  const canManage = roleIs(role, [
    'super_admin',
    'campus_admin',
    'academic_staff',
    'accountant',
  ])

  const tabs = [
    canManage
      ? { label: 'Ngày công & duyệt phép', href: '/hr/attendance', icon: CalendarClock }
      : null,
    {
      label: 'Xin nghỉ của tôi',
      href: '/hr/my-leave',
      icon: Palmtree,
    },
  ].filter(Boolean) as { label: string; href: string; icon: typeof CalendarClock }[]

  return <SectionTabs tabs={tabs} />
}

function roleIs(role: Role | null | undefined, allowed: Role[]): boolean {
  if (role === undefined || role === null) return false
  return allowed.includes(role)
}
