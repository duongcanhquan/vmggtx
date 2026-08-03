'use client'

import { Suspense } from 'react'
import { FunLoader } from '@/components/shared/FunLoader'
import AdminSettingsInner from './SettingsInner'

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<FunLoader label="Đang tải cài đặt…" />}>
      <AdminSettingsInner />
    </Suspense>
  )
}
