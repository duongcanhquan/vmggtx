import Link from 'next/link'
import { CalendarClock, Mail, Phone } from 'lucide-react'

// ============================================================
// Trang chặn khi LICENSE cơ sở hết hạn / bị tạm ngưng (044).
// Dữ liệu vẫn còn nguyên - gia hạn là mở lại ngay.
// ============================================================

export default function LicenseExpiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/50 to-amber-50/40 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
          <CalendarClock className="h-8 w-8 text-amber-600" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-heading text-2xl font-semibold text-slate-900">
          Gói dịch vụ đã hết hạn hoặc tạm ngưng
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Cơ sở của bạn hiện không thể truy cập hệ thống vì gói dịch vụ đã hết hạn hoặc đang
          tạm ngưng. <strong>Toàn bộ dữ liệu vẫn được lưu giữ an toàn</strong> - ngay khi gia
          hạn, mọi thứ sẽ hoạt động trở lại như cũ.
        </p>
        <div className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-left text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Để gia hạn, vui lòng liên hệ quản trị hệ thống:</p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            Gửi email cho bộ phận hỗ trợ của đơn vị cung cấp
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            Hoặc gọi hotline đã được cung cấp khi ký hợp đồng
          </p>
        </div>
        <Link
          href="/login"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Về trang đăng nhập
        </Link>
      </div>
    </main>
  )
}
