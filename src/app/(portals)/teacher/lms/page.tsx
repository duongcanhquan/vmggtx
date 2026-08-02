import { Inbox } from 'lucide-react'
import { listAccessibleLmsClasses } from './actions'
import { LmsManager } from './LmsManager'

export const dynamic = 'force-dynamic'

// LMS phía Giáo viên: soạn bài giảng, giao bài tập, tạo đề kiểm tra.
// Hỗ trợ ?classId= deep-link từ trang lớp.
export default async function TeacherLmsPage({
  searchParams,
}: {
  searchParams?: { classId?: string }
}) {
  const result = await listAccessibleLmsClasses(null)

  if (result.error !== undefined && result.classes.length === 0) {
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
        <p className="text-sm text-muted-foreground">
          Chưa được gán lớp nào (lead / đồng giảng). Liên hệ Giáo vụ để gán lớp.
        </p>
      </div>
    )
  }

  return (
    <LmsManager classes={result.classes} initialClassId={searchParams?.classId ?? null} />
  )
}
