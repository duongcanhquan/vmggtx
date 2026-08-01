import { Inbox } from 'lucide-react'
import { getMyLearnData } from './actions'
import { LearnClient } from './LearnClient'

export const dynamic = 'force-dynamic'

// Học online: bài giảng, nộp bài tập, kiểm tra trắc nghiệm.
export default async function LearnPage() {
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
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Bạn chưa ghi danh lớp nào.</p>
      </div>
    )
  }

  return <LearnClient data={result} />
}
