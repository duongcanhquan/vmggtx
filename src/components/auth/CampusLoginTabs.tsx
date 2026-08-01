'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, GraduationCap, HeartHandshake, Home } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { StaffLoginForm, type CampusContext } from '@/components/auth/StaffLoginForm'
import { StudentLoginForm } from '@/components/auth/StudentLoginForm'
import { ParentLoginForm } from '@/components/auth/ParentLoginForm'

// ============================================================
// CỔNG ĐĂNG NHẬP DUY NHẤT CỦA CƠ SỞ - /coso/[slug]/login
// Chia đúng 2 phần:
//   1. Nhà trường · Giảng viên (quản lý, giáo vụ, kế toán, GV)
//   2. Gia đình (Học viên đăng nhập email/mật khẩu · Phụ huynh SĐT+OTP)
// Badge hiển thị rõ chuỗi trực thuộc: "Cơ sở A1 · thuộc Trường A"
// để ai đăng nhập cũng biết mình đang ở đơn vị nào, thuộc đâu.
// ============================================================

export type CampusLoginTab = 'staff' | 'family'
export type FamilyWho = 'student' | 'parent'

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
  const [who, setWho] = useState<FamilyWho>(initialWho)

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
          Nhà trường · GV
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
        <>
          {/* Gia đình: chọn Học viên / Phụ huynh */}
          <div className="mb-1 mt-3 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setWho('student')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                who === 'student'
                  ? 'border-white bg-white text-[#162938]'
                  : 'border-white/40 text-white/85 hover:bg-white/10'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              Học viên
            </button>
            <button
              type="button"
              onClick={() => setWho('parent')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                who === 'parent'
                  ? 'border-white bg-white text-[#162938]'
                  : 'border-white/40 text-white/85 hover:bg-white/10'
              }`}
            >
              <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
              Phụ huynh
            </button>
          </div>
          {who === 'student' ? (
            <StudentLoginForm campus={campus} embedded />
          ) : (
            <ParentLoginForm campus={campus} embedded />
          )}
        </>
      )}
    </AuthShell>
  )
}
