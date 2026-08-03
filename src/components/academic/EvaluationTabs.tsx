'use client'

import { ClipboardList, Star } from 'lucide-react'
import { SectionTabs } from '@/components/shared/SectionTabs'

/** Đợt đánh giá + báo cáo — một hub trên menu. */
export function EvaluationTabs() {
  return (
    <SectionTabs
      tabs={[
        { label: 'Đợt đánh giá', href: '/academic/campaigns', icon: ClipboardList },
        { label: 'Báo cáo', href: '/academic/evaluations', icon: Star },
      ]}
    />
  )
}
