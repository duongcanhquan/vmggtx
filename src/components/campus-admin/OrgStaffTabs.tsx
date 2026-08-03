'use client'

import { Briefcase, FileSignature, IdCard, Users } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'

/** Tabs khu vực Tổ chức / Hồ sơ NS / Hợp đồng */
export function OrgStaffTabs() {
  return (
    <SectionTabs
      tabs={[
        { label: 'Tài khoản', href: '/campus-admin/users', icon: Users },
        { label: 'Chức danh', href: '/campus-admin/job-titles', icon: Briefcase },
        { label: 'Hồ sơ & giấy tờ', href: '/hr/personnel', icon: IdCard },
        { label: 'Lương & Hợp đồng', href: '/hr/contracts', icon: FileSignature },
      ]}
    />
  )
}
