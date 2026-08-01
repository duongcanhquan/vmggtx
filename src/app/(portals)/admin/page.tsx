import Link from 'next/link'
import {
  Building2,
  GraduationCap,
  Settings,
  Users,
  Vote,
  Wallet,
} from 'lucide-react'

const LINKS = [
  { href: '/campus-admin/users', label: 'Nhân sự', icon: Users },
  { href: '/settings', label: 'Cài đặt cơ sở', icon: Settings },
  { href: '/academic/campaigns', label: 'Đợt khảo sát', icon: Vote },
  { href: '/finance/invoices', label: 'Học phí', icon: Wallet },
  { href: '/hr/contracts', label: 'Hợp đồng GV', icon: Building2 },
  { href: '/classes', label: 'Lớp học', icon: GraduationCap },
]

export default function AdminPortalPage() {
  return (
    <div className="space-y-6">
      {/* Hero bento tối */}
      <div className="bento-card-dark p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#e5c369]">
          Admin Portal
        </p>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Trung tâm Điều hành
        </h1>
        <div className="gold-hairline mt-3 w-40" aria-hidden="true" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.href}
              href={link.href}
              className="bento-card flex items-center gap-3 p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="bento-icon bg-stone-100 text-stone-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-heading text-sm font-bold">{link.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
