'use client'

import { Boxes, CalendarPlus, Car, DoorOpen } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'

/** Quy trình Hành chính & CSVC */
export function AdminOpsTabs() {
  return (
    <SectionTabs
      tabs={[
        { label: 'Đặt lịch CSVC', href: '/facilities', icon: CalendarPlus },
        { label: 'Đặt xe', href: '/facilities/vehicles', icon: Car },
        { label: 'Danh mục phòng/TB', href: '/academic/rooms', icon: DoorOpen },
        { label: 'Sổ tài sản', href: '/assets', icon: Boxes },
      ]}
    />
  )
}
