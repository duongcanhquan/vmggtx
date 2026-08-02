import { BookOpen, Inbox } from 'lucide-react'
import { getMyLearnData } from './actions'
import { LearnClient } from './LearnClient'

export const dynamic = 'force-dynamic'

// Học online: bài giảng, nộp bài tập, kiểm tra trắc nghiệm.
export default async function LearnPage({
  searchParams,
}: {
  searchParams?: { classId?: string }
}) {
  const result = await getMyLearnData()

  if ('error' in result) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {result.error}
      </p>
    )
  }

  if (result.classes.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-primary">
          <Inbox className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="font-heading text-xl font-bold">Học Online</h1>
        <p className="text-sm text-muted-foreground">
          Bạn chưa được ghi danh học phần nào. Liên hệ Giáo vụ để được thêm vào lớp
          hoặc lớp hành chính (cohort).
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Khi có bài giảng phát hành, chúng sẽ hiện tại đây.
        </p>
      </div>
    )
  }

  return <LearnClient data={result} initialClassId={searchParams?.classId ?? null} />
}
