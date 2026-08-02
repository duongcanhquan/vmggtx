'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { getMyTeachingClasses } from '@/app/(portals)/teacher/actions'
import { saveLesson } from '@/app/(portals)/teacher/lms/actions'

// ============================================================
// Lưu giáo án AI (completion) thành bài giảng nháp LMS của 1 lớp
// ============================================================

type Props = {
  content: string
  topicHint?: string
}

export function SaveLessonDraft({ content, topicHint }: Props) {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  )

  useEffect(() => {
    void getMyTeachingClasses().then((result) => {
      if (result.error !== undefined) {
        setClasses([])
        return
      }
      const list = result.classes.map((c) => ({ id: c.id, name: c.name }))
      setClasses(list)
      if (list[0]) setClassId(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (!title && topicHint) {
      setTitle(topicHint.slice(0, 80))
    } else if (!title && content) {
      const firstLine = content.split('\n').find((l) => l.trim().length > 3)
      setTitle((firstLine ?? 'Giáo án AI').trim().slice(0, 80))
    }
  }, [content, topicHint, title])

  async function handleSave() {
    if (!classId || !content.trim()) return
    setSaving(true)
    setMessage(null)
    const res = await saveLesson({
      classId,
      title: (title || 'Giáo án AI').trim().slice(0, 200),
      description: 'Nháp từ Trợ lý AI soạn giáo án',
      content: content.slice(0, 50000),
      videoUrl: '',
      attachments: [],
      status: 'draft',
    })
    setSaving(false)
    if (res.error) {
      setMessage({ type: 'err', text: res.error })
      return
    }
    setMessage({
      type: 'ok',
      text: 'Đã lưu nháp vào LMS. Mở «LMS Online» để gửi duyệt / chỉnh sửa.',
    })
  }

  if (classes.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Chưa có lớp phụ trách — không thể lưu vào LMS.
      </p>
    )
  }

  return (
    <div className="mt-4 space-y-2 rounded-xl border border-indigo-200 bg-white/80 p-3">
      <p className="text-xs font-semibold text-indigo-900">Lưu vào bài giảng LMS (nháp)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Lớp
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Tiêu đề bài
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={saving || !content.trim()}
        onClick={() => void handleSave()}
        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? 'Đang lưu…' : 'Lưu nháp LMS'}
      </button>
      {message && (
        <p
          className={`text-xs ${
            message.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
