'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BellRing,
  GraduationCap,
  Megaphone,
  Pin,
  Presentation,
  Send,
  Trash2,
  Users,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  type AnnouncementRow,
  type Audience,
} from './actions'

// ============================================================
// Thông báo chung (/announcements)
// Quản lý cơ sở soạn thông báo -> phát tới Sổ liên lạc phụ huynh,
// cổng học viên, cổng giáo viên (nghỉ lễ, học phí, họp PH, sự kiện).
// ============================================================

const AUDIENCE_META: Record<Audience, { label: string; icon: typeof Users }> = {
  all: { label: 'Tất cả', icon: Users },
  parents: { label: 'Phụ huynh', icon: BellRing },
  students: { label: 'Học viên', icon: GraduationCap },
  teachers: { label: 'Giáo viên', icon: Presentation },
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AnnouncementsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
  const [toast, setToast] = useState<ToastData | null>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [pinned, setPinned] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      setLoadError('Vui lòng chọn cơ sở ở thanh trên để quản lý thông báo.')
      return
    }
    setLoading(true)
    const result = await getAnnouncements(currentOrgId)
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setAnnouncements(result.announcements)
    }
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async () => {
    if (!currentOrgId || submitting) return
    setSubmitting(true)
    const result = await createAnnouncement(currentOrgId, title, body, audience, pinned)
    setSubmitting(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã đăng thông báo — các cổng sẽ thấy ngay.' })
    setTitle('')
    setBody('')
    setPinned(false)
    void load()
  }

  const handleDelete = async (id: string) => {
    const result = await deleteAnnouncement(id)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã gỡ thông báo.' })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <Megaphone className="h-6 w-6 text-primary" aria-hidden="true" />
          Thông báo chung
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gửi tới Sổ liên lạc phụ huynh, cổng học viên và cổng giáo viên của cơ sở đang chọn.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* ===== Form soạn ===== */}
        <section className="h-fit rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <label className="block text-sm font-medium">
            Tiêu đề
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="VD: Nghỉ lễ Quốc khánh 2/9"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="mt-3 block text-sm font-medium">
            Nội dung
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="VD: Trung tâm nghỉ từ 01/09 đến hết 02/09. Lịch học bù sẽ thông báo sau..."
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="mt-3">
            <span className="text-sm font-medium">Gửi tới</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(Object.keys(AUDIENCE_META) as Audience[]).map((key) => {
                const meta = AUDIENCE_META[key]
                const Icon = meta.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAudience(key)}
                    aria-pressed={audience === key}
                    className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors ${
                      audience === key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <Pin className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            Ghim lên đầu danh sách
          </label>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !currentOrgId}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {submitting ? 'Đang đăng...' : 'Đăng thông báo'}
          </button>
        </section>

        {/* ===== Danh sách ===== */}
        <section className="space-y-3">
          {loading ? (
            <FunLoader />
          ) : loadError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {loadError}
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
              Chưa có thông báo nào. Soạn thông báo đầu tiên ở khung bên trái.
            </div>
          ) : (
            announcements.map((item) => {
              const meta = AUDIENCE_META[item.audience]
              const Icon = meta.icon
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    item.pinned ? 'border-amber-200 bg-amber-50/60' : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.pinned && (
                        <Pin className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                      )}
                      <h2 className="truncate text-sm font-bold">{item.title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {meta.label}
                      </span>
                      <button
                        type="button"
                        title="Gỡ thông báo"
                        onClick={() => void handleDelete(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.body}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {item.orgName} · {item.authorName} · {formatDateTime(item.createdAt)}
                  </p>
                </article>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}
