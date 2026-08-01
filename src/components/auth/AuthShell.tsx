import type { LucideIcon } from 'lucide-react'

// ============================================================
// AuthShell - Khung đăng nhập KÍNH MỜ (glassmorphism) dùng chung
// cho 3 cổng đăng nhập TÁCH BIỆT (sau này mỗi cổng 1 tên miền):
//
//   management : Nhà trường & Giảng viên - xanh indigo học thuật
//                sâu lắng + ánh vàng đồng sang trọng.
//   student    : Học viên - xanh da trời / ngọc lục bảo tươi sáng,
//                thân thiện, tràn năng lượng.
//   parent     : Phụ huynh - cam hổ phách / hồng đào ấm áp, gần gũi.
//
// Thẻ form là "tấm kính trắng mờ" (bg-white/75 + backdrop-blur) nổi
// trên nền gradient + các quầng sáng blur - nội dung form giữ chữ
// tối, dễ đọc, đạt chuẩn tương phản.
// ============================================================

export type AuthTheme = 'management' | 'student' | 'parent'

const THEME: Record<
  AuthTheme,
  {
    bg: string
    blobA: string
    blobB: string
    blobC: string
    iconBox: string
    badge: string
    ring: string
  }
> = {
  management: {
    bg: 'bg-gradient-to-br from-[#1e1b4b] via-[#27276b] to-[#0f172a]',
    blobA: 'bg-amber-400/25',
    blobB: 'bg-sky-500/25',
    blobC: 'bg-indigo-400/20',
    iconBox: 'bg-gradient-to-br from-indigo-600 to-indigo-900 text-amber-200 ring-amber-300/40',
    badge: 'bg-indigo-100/90 text-indigo-800 ring-indigo-200',
    ring: 'ring-white/25',
  },
  student: {
    bg: 'bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500',
    blobA: 'bg-yellow-300/40',
    blobB: 'bg-white/30',
    blobC: 'bg-emerald-300/40',
    iconBox: 'bg-gradient-to-br from-sky-500 to-emerald-600 text-white ring-white/50',
    badge: 'bg-emerald-100/90 text-emerald-800 ring-emerald-200',
    ring: 'ring-white/40',
  },
  parent: {
    bg: 'bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400',
    blobA: 'bg-yellow-200/50',
    blobB: 'bg-white/30',
    blobC: 'bg-rose-300/40',
    iconBox: 'bg-gradient-to-br from-orange-500 to-rose-500 text-white ring-white/50',
    badge: 'bg-orange-100/90 text-orange-700 ring-orange-200',
    ring: 'ring-white/40',
  },
}

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
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-[430px]">
        {/* TẤM KÍNH MỜ */}
        <div
          className={`rounded-[2rem] border border-white/50 bg-white/75 p-7 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.45)] backdrop-blur-2xl ring-1 sm:p-8 ${t.ring}`}
        >
          <div className="text-center">
            <span
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg ring-2 ${t.iconBox}`}
            >
              <Icon className="h-8 w-8" aria-hidden="true" />
            </span>
            <span
              className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ring-1 ${t.badge}`}
              style={{ backdropFilter: 'blur(8px)' }}
            >
              {badge}
            </span>
            <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>
          </div>

          <div className="mt-7">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center">{footer}</div>}
      </div>
    </main>
  )
}
