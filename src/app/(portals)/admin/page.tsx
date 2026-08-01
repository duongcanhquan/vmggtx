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
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Admin Portal
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">
          Welcome to Admin Portal
        </h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => {
          const Icon = link.icon
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
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
