'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, HeartHandshake, Home } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { StaffLoginForm, type CampusContext } from '@/components/auth/StaffLoginForm'
import { FamilyLoginForm } from '@/components/auth/FamilyLoginForm'

// ============================================================
// CỔNG ĐĂNG NHẬP DUY NHẤT CỦA CƠ SỞ - /coso/[slug]/login
// Chia đúng 2 phần:
//   1. Nhà trường (quản lý, giáo vụ, kế toán, giáo viên)
//   2. Gia đình — 1 form chung, tự nhận diện qua ô nhập:
//      email = Học viên (mật khẩu) · SĐT = Phụ huynh (OTP)
// ============================================================

export type CampusLoginTab = 'staff' | 'family'

export function CampusLoginTabs({
  campus,
  initialTab = 'staff',
}: {
  campus: CampusContext
  initialTab?: CampusLoginTab
}) {
  const [tab, setTab] = useState<CampusLoginTab>(initialTab)

  const belongsTo =
    campus.parentNames && campus.parentNames.length > 0
      ? campus.parentNames.join(' · ')
      : null

  return (
    <AuthShell
      theme={tab === 'staff' ? 'management' : 'student'}
      badge="EDU SYSTEM"
      title={
        <span className="block text-balance text-2xl leading-snug sm:text-[26px]">
          {campus.name}
        </span>
      }
      subtitle={belongsTo ? `Trực thuộc ${belongsTo}` : undefined}
      footer={
        <p>
          <Link
            href={`/coso/${campus.slug}`}
            className="inline-flex items-center gap-1.5 font-bold text-white/85 underline-offset-2 hover:text-white hover:underline"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Về trang cơ sở
          </Link>
        </p>
      }
    >
      {/* ===== 2 PHẦN: Nhà trường | Gia đình ===== */}
      <div
        role="tablist"
        aria-label="Chọn nhóm đăng nhập"
        className="mb-2 mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/30 bg-white/10 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'staff'}
          onClick={() => setTab('staff')}
          className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
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
          className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
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
        <FamilyLoginForm campus={campus} />
      )}
    </AuthShell>
  )
}
