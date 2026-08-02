'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, HeartHandshake } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { StaffLoginForm, type CampusContext } from '@/components/auth/StaffLoginForm'
import { FamilyLoginForm, type FamilyWho } from '@/components/auth/FamilyLoginForm'

export type CampusLoginTab = 'staff' | 'family'

export function CampusLoginTabs({
  campus,
  initialTab = 'staff',
  initialWho = 'student',
}: {
  campus: CampusContext
  initialTab?: CampusLoginTab
  initialWho?: FamilyWho
}) {
  const [tab, setTab] = useState<CampusLoginTab>(initialTab)
  const [familyWho, setFamilyWho] = useState<FamilyWho>(initialWho)

  const belongsTo =
    campus.parentNames && campus.parentNames.length > 0
      ? campus.parentNames.join(' · ')
      : null

  const theme =
    tab === 'staff' ? 'management' : familyWho === 'parent' ? 'parent' : 'student'

  return (
    <AuthShell
      theme={theme}
      badge="EDU SYSTEM"
      title={
        <span className="block text-balance text-xl leading-snug sm:text-2xl">
          {campus.name}
        </span>
      }
      subtitle={belongsTo ? `Trực thuộc ${belongsTo}` : 'Đăng nhập cổng cơ sở'}
      footer={
        <p>
          <Link
            href="/coso"
            className="font-semibold text-white/85 underline-offset-2 hover:text-white hover:underline"
          >
            ← Chọn cơ sở khác
          </Link>
        </p>
      }
    >
      <div
        role="tablist"
        aria-label="Chọn nhóm đăng nhập"
        className="mb-1 grid grid-cols-2 gap-1 rounded-xl border border-white/30 bg-white/10 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'staff'}
          onClick={() => setTab('staff')}
          className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:text-[13px] ${
            tab === 'staff'
              ? 'bg-white text-[#162938] shadow'
              : 'text-white/85 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Building2 className="h-4 w-4" aria-hidden="true" />
          Nhà trường
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'family'}
          onClick={() => setTab('family')}
          className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:text-[13px] ${
            tab === 'family'
              ? 'bg-white text-[#162938] shadow'
              : 'text-white/85 hover:bg-white/10 hover:text-white'
          }`}
        >
          <HeartHandshake className="h-4 w-4" aria-hidden="true" />
          Gia đình
        </button>
      </div>

      {tab === 'staff' ? (
        <StaffLoginForm campus={campus} embedded />
      ) : (
        <FamilyLoginForm
          campus={campus}
          initialWho={familyWho}
          onWhoChange={setFamilyWho}
        />
      )}
    </AuthShell>
  )
}
