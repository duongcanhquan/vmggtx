import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'

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

/** Nút submit navy #162938 theo mẫu (.btn) */
export const authBtnClass =
  'flex h-[45px] w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[#162938] text-[15px] font-medium text-white transition-colors duration-300 hover:bg-[#1f3a52] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Ô nhập GẠCH CHÂN + LABEL NỔI + ICON PHẢI theo mẫu (.input-box).
 * Label nổi lên khi focus hoặc đã có nội dung (peer-placeholder-shown).
 *
 * BẮT BUỘC forwardRef: react-hook-form cần ref trỏ thẳng vào <input>
 * để đọc giá trị trình duyệt TỰ ĐIỀN (autofill). Thiếu ref → autofill
 * xong bấm Đăng nhập vẫn báo "Vui lòng nhập email…".
 */
export const AuthField = forwardRef<
  HTMLInputElement,
  {
    id: string
    label: string
    icon: LucideIcon
    error?: string
  } & React.InputHTMLAttributes<HTMLInputElement>
>(function AuthField(
  { id, label, icon: Icon, error, className = '', ...inputProps },
  ref
) {
  return (
    <div className="my-7">
      <div
        className={`relative h-[50px] w-full border-b-2 transition-colors ${
          error ? 'border-rose-300' : 'border-white/80 focus-within:border-white'
        }`}
      >
        <input
          ref={ref}
          id={id}
          placeholder=" "
          aria-invalid={!!error}
          className={`peer h-full w-full border-none bg-transparent pl-1.5 pr-9 text-base font-semibold text-white outline-none autofill:shadow-[inset_0_0_0_1000px_transparent] ${className}`}
          {...inputProps}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[15px] font-medium text-white/90 transition-all duration-300 peer-focus:top-[-2px] peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-[-2px] peer-[:not(:placeholder-shown)]:text-xs"
        >
          {label}
        </label>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/90">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-200">
          {error}
        </p>
      )}
    </div>
  )
})

export function AuthShell({
  theme,
  icon: Icon,
  badge,
  title,
  subtitle,
  children,
  footer,
}: {
  theme: AuthTheme
  icon: LucideIcon
  badge: string
  title: React.ReactNode
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
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
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white/40 bg-white/10 text-white shadow-lg">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="mt-3 inline-flex items-center rounded-full border border-white/40 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">
              {badge}
            </span>
            <h1 className="mt-3 font-heading text-[1.9em] font-bold leading-tight tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-white/85">{subtitle}</p>
          </div>

          <div className="mt-2">{children}</div>

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
