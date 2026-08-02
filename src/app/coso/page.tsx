import Link from 'next/link'
import { ArrowRight, Building2, SearchX } from 'lucide-react'
import { listPublicCampuses } from './actions'
import { campusLoginPath } from '@/lib/utils/orgSlug'

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
        </div>

        {error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            {error}
          </div>
        ) : campuses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/80 py-14 text-slate-500">
            <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-medium">Chưa có cơ sở nào.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {campuses.map((campus) => (
              <li key={campus.id}>
                <Link
                  href={campusLoginPath(campus.slug)}
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

        <p className="mt-10 text-center text-xs text-slate-400">
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
            Đăng nhập quản trị hệ thống
          </Link>
        </p>
      </div>
    </main>
  )
}
