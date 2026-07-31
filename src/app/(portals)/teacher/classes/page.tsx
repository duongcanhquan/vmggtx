import Link from 'next/link'
import { BookOpen, Bot, Building2, Inbox, PenSquare } from 'lucide-react'
import { getMyTeachingClasses } from '../actions'

export const dynamic = 'force-dynamic'

// Các lớp giáo viên phụ trách (trên MỌI cơ sở được gán dạy).
export default async function TeacherClassesPage() {
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
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Các lớp phụ trách
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toàn bộ lớp bạn được gán dạy, gồm cả các lớp ở cơ sở khác.
        </p>
      </div>

      {result.classes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Bạn chưa được gán dạy lớp nào. Liên hệ Giáo vụ để nhận lớp.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {result.classes.map((cls) => (
            <div
              key={cls.id}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-base font-bold text-foreground">
                    {cls.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {cls.subjectName ?? 'Chưa gán môn'}
                  </p>
                  {cls.orgName && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {cls.orgName}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/teacher/grades/${cls.id}`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PenSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Sổ điểm
                </Link>
                <Link
                  href={`/classes/${cls.id}/tutor`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  Gia sư AI của lớp
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
