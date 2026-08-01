import Link from 'next/link'
import { ChevronRight, Inbox, Lock, PenSquare } from 'lucide-react'
import { getMyTeachingClasses } from '../actions'

export const dynamic = 'force-dynamic'

// Chấm điểm: chọn lớp để vào Sổ điểm điện tử (/teacher/grades/[id]).
export default async function TeacherGradingPage() {
  const result = await getMyTeachingClasses()

  if (result.error !== undefined) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {result.error}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
        Chấm điểm
      </h1>

      {result.classes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Chưa có lớp nào.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {result.classes.map((cls) => (
            <li key={cls.id}>
              <Link
                href={`/teacher/grades/${cls.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <PenSquare className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {cls.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {cls.subjectName ?? 'Chưa gán môn'}
                      {cls.orgName ? ` · ${cls.orgName}` : ''}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {cls.isLocked && (
                    <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      Đã chốt sổ
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
