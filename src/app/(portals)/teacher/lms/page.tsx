import { Inbox } from 'lucide-react'
import { getMyTeachingClasses } from '../actions'
import { LmsManager } from './LmsManager'

export const dynamic = 'force-dynamic'

// LMS phía Giáo viên: soạn bài giảng, giao bài tập, tạo đề kiểm tra.
export default async function TeacherLmsPage() {
  const result = await getMyTeachingClasses()

  if (result.error !== undefined) {
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
        <p className="text-sm text-muted-foreground">Chưa được gán lớp nào.</p>
      </div>
    )
  }

  return (
    <LmsManager
      classes={result.classes.map((c) => ({
        id: c.id,
        name: c.name,
        orgName: c.orgName ?? null,
      }))}
    />
  )
}
