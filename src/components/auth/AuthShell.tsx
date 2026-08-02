import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { EmblemFallback, OrgBrandMark } from '@/components/shared/OrgBrandMark'

// ============================================================
// AuthShell - Khung đăng nhập KÍNH TRONG SUỐT (transparent glass)
// theo mẫu wrapper codingstella: viền trắng 2px, bo 20px,
// backdrop-blur 20px, input GẠCH CHÂN + label NỔI + icon phải,
// nút màu navy #162938. Dùng chung cho 3 cổng TÁCH BIỆT
// (sau này mỗi cổng 1 tên miền):
//
//   management : Nhà trường & Giảng viên - nền indigo học thuật.
//   student    : Học viên - nền xanh da trời / ngọc lục bảo.
//   parent     : Phụ huynh - nền cam hổ phách ấm áp.
// ============================================================

export type AuthTheme = 'management' | 'student' | 'parent'

const THEME: Record<
  AuthTheme,
  { bg: string; blobA: string; blobB: string; blobC: string }
> = {
  management: {
    bg: 'bg-gradient-to-br from-[#1e1b4b] via-[#27276b] to-[#0f172a]',
    blobA: 'bg-amber-400/25',
    blobB: 'bg-sky-500/25',
    blobC: 'bg-indigo-400/20',
  },
  student: {
    bg: 'bg-gradient-to-br from-sky-600 via-cyan-600 to-emerald-600',
    blobA: 'bg-yellow-300/30',
    blobB: 'bg-white/20',
    blobC: 'bg-emerald-300/30',
  },
  parent: {
    bg: 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500',
    blobA: 'bg-yellow-200/40',
    blobB: 'bg-white/20',
    blobC: 'bg-rose-300/30',
  },
}

/** Nút submit — chữ vừa, không đè mô tả */
export const authBtnClass =
  'flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#162938] text-sm font-semibold text-white transition-colors duration-300 hover:bg-[#1f3a52] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Ô nhập: label NẰM TRÊN (không đè chữ khi gõ), chữ input vừa phải.
 * forwardRef bắt buộc cho react-hook-form + autofill.
 */
export const AuthField = forwardRef<
  HTMLInputElement,
  {
    id: string
    label: string
    icon: LucideIcon
    error?: string
    hint?: string
  } & React.InputHTMLAttributes<HTMLInputElement>
>(function AuthField(
  { id, label, icon: Icon, error, hint, className = '', ...inputProps },
  ref
) {
  return (
    <div className="mb-5">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/75"
      >
        {label}
      </label>
      <div
        className={`relative flex h-11 w-full items-center rounded-lg border bg-white/10 px-3 transition-colors ${
          error
            ? 'border-rose-300/80'
            : 'border-white/35 focus-within:border-white/80 focus-within:bg-white/[0.14]'
        }`}
      >
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          className={`h-full w-full border-none bg-transparent pr-8 text-sm font-medium text-white outline-none placeholder:text-white/40 autofill:shadow-[inset_0_0_0_1000px_rgba(22,41,56,0.85)] ${className}`}
          {...inputProps}
        />
        <span className="pointer-events-none absolute right-3 text-white/70">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {hint && !error && (
        <p className="mt-1 text-[11px] leading-snug text-white/55">{hint}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs font-semibold text-rose-200">
          {error}
        </p>
      )}
    </div>
  )
})

export function AuthShell({
  theme,
  badge,
  title,
  subtitle,
  children,
  footer,
  logoUrl,
}: {
  theme: AuthTheme
  badge?: string
  title: React.ReactNode
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Logo cơ sở — null/undefined = emblem EDU SYSTEM */
  logoUrl?: string | null
}) {
  const t = THEME[theme]
  return (
    <main
      className={`relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 ${t.bg}`}
    >
      {/* Quầng sáng trang trí */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl ${t.blobA}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-32 -right-24 h-[30rem] w-[30rem] rounded-full blur-3xl ${t.blobB}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl ${t.blobC}`}
      />
      {/* Lưới chấm mờ tạo chiều sâu */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* ===== WRAPPER kính TRONG SUỐT theo mẫu ===== */}
      <div className="relative w-full max-w-[420px]">
        <div className="rounded-[20px] border-2 border-white/50 bg-white/5 p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur-[20px] sm:p-10">
          <div className="text-center">
            {logoUrl ? (
              <OrgBrandMark logoUrl={logoUrl} size="xl" tone="glass" alt="Logo cơ sở" />
            ) : (
              <EmblemFallback />
            )}
            {badge && (
              <span className="mt-3 inline-flex max-w-full items-center rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                <span className="truncate">{badge}</span>
              </span>
            )}
            <h1 className="mt-3 break-words font-heading text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-balance text-xs text-white/70 sm:text-sm">{subtitle}</p>
            )}
          </div>

          <div className="mt-4">{children}</div>

          {/* login-register: liên kết chéo giữa các cổng */}
          {footer && (
            <div className="mt-6 space-y-1.5 text-center text-[13.5px] font-medium text-white/90">
              {footer}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
