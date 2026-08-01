import Link from 'next/link'
import { ArrowRight, Building2, SearchX, Shield } from 'lucide-react'
import { listPublicCampuses } from './actions'
import { campusPortalPath } from '@/lib/utils/orgSlug'

export const dynamic = 'force-dynamic'

/**
 * Hub chọn cơ sở: edusystem.com/coso
 * Super Admin đăng nhập ở /login (gốc domain).
 * Mỗi cơ sở có cổng riêng /coso/{slug}.
 */
export default async function CampusDirectoryPage() {
  const { campuses, error } = await listPublicCampuses()

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/40 to-violet-50/30">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-16 h-64 w-64 rounded-full bg-indigo-300/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 bottom-20 h-56 w-56 rounded-full bg-violet-300/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            EDU SYSTEM
          </p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold text-slate-900 sm:text-4xl">
            Chọn cơ sở của bạn
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Mỗi cơ sở có đường dẫn riêng{' '}
            <span className="font-mono text-indigo-600">/coso/ten-co-so</span> — vào
            đó để đăng nhập Quản lý, Học viên hoặc Phụ huynh.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            {error}
          </div>
        ) : campuses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/80 py-14 text-slate-500">
            <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-medium">Chưa có cơ sở nào có đường dẫn công khai.</p>
            <p className="max-w-sm text-center text-xs">
              Super Admin tạo cơ sở (License / Quản lý Cơ sở) — hệ thống tự cấp slug và
              cổng /coso/…
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {campuses.map((campus) => (
              <li key={campus.id}>
                <Link
                  href={campusPortalPath(campus.slug)}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:hover:translate-y-0"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Building2 className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-heading text-base font-bold text-slate-900">
                      {campus.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-xs text-slate-500">
                      /coso/{campus.slug}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white/70 px-4 py-4 text-center text-sm text-slate-600">
          <p className="inline-flex items-center justify-center gap-2 font-medium text-slate-800">
            <Shield className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            Super Admin toàn hệ thống
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Đăng nhập tại gốc domain — không vào /coso
          </p>
          <Link
            href="/login"
            className="mt-3 inline-flex font-semibold text-indigo-600 hover:underline"
          >
            Đi tới /login
          </Link>
        </div>
      </div>
    </main>
  )
}
