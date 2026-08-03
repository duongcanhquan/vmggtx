'use client'

import { Briefcase, Calculator, FileSignature, IdCard, Users } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'
import { useMyRole } from '@/lib/hooks/useMyRole'
import type { Role } from '@/lib/auth/roles'

/** Tabs hub Tổ chức nhân sự — lọc theo role (middleware vẫn chặn URL). */
export function OrgStaffTabs() {
  const role = useMyRole()

  const canAccounts = roleIs(role, ['super_admin', 'campus_admin'])
  const canDossier = roleIs(role, [
    'super_admin',
    'campus_admin',
    'accountant',
    'academic_staff',
  ])
  const canPayroll = roleIs(role, ['super_admin', 'campus_admin', 'accountant'])

  const tabs = [
    canAccounts
      ? { label: 'Tài khoản', href: '/campus-admin/users', icon: Users }
      : null,
    canAccounts
      ? { label: 'Chức danh', href: '/campus-admin/job-titles', icon: Briefcase }
      : null,
    canDossier
      ? { label: 'Hồ sơ & giấy tờ', href: '/hr/personnel', icon: IdCard }
      : null,
    canPayroll
      ? { label: 'Lương & Hợp đồng', href: '/hr/contracts', icon: FileSignature }
      : null,
    canPayroll
      ? { label: 'Kỳ tính lương', href: '/finance/payroll', icon: Calculator }
      : null,
  ].filter(Boolean) as { label: string; href: string; icon: typeof Users }[]

  if (tabs.length === 0) return null
  return <SectionTabs tabs={tabs} />
}

function roleIs(role: Role | null | undefined, allowed: Role[]): boolean {
  // undefined = đang tải role → không hiện tab nhạy cảm (tránh flash)
  if (role === undefined || role === null) return false
  return allowed.includes(role)
}
