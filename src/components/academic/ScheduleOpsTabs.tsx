'use client'

import { BookOpen, CalendarCog, CalendarRange, Calendar } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'

/** Xếp lịch / TKB / điều phối — một hub trên menu. */
export function ScheduleOpsTabs() {
  return (
    <SectionTabs
      tabs={[
        { label: 'Xếp lịch', href: '/academic/schedule', icon: CalendarRange },
        { label: 'TKB tuần', href: '/staff/timetable', icon: Calendar },
        { label: 'Dạy thay / bù', href: '/staff/schedule-management', icon: CalendarCog },
        { label: 'Lớp vận hành', href: '/staff/classes', icon: BookOpen },
      ]}
    />
  )
}
