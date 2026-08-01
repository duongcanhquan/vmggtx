import Link from 'next/link'
import { AlertTriangle, BookOpen, ClipboardList, Users } from 'lucide-react'

const LINKS = [
  { href: '/staff/classes', label: 'Vận hành lớp học', icon: BookOpen },
  { href: '/students', label: 'Học sinh', icon: Users },
  { href: '/attendance', label: 'Điểm danh', icon: ClipboardList },
  { href: '/academic/warnings', label: 'Cảnh báo học vụ', icon: AlertTriangle },
]

export default function StaffPortalPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
          Staff Portal
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">
          Welcome to Staff Portal
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
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
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
