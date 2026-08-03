'use client'

import { BookMarked, BookOpen, Layers } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'

/** Quy trình Đào tạo: Môn → Lớp hành chính → Học phần */
export function AcademicFlowTabs() {
  return (
    <SectionTabs
      tabs={[
        { label: '1. Chương trình môn', href: '/academic/subjects', icon: BookMarked },
        { label: '2. Lớp hành chính', href: '/classes/groups', icon: Layers },
        { label: '3. Học phần', href: '/classes', icon: BookOpen },
      ]}
    />
  )
}
