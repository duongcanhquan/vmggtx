'use client'

import { LoginGuide } from '@/components/auth/LoginGuide'

/** Hướng dẫn trên trang /coso (nền sáng) */
export function CampusLoginHelp() {
  return (
    <div className="mt-8">
      <LoginGuide variant="light" />
    </div>
  )
}
