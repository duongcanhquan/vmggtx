'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BellRing,
  GraduationCap,
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
  getAnnouncementTargetOptions,
  getAnnouncements,
  type AnnouncementRow,
  type AnnouncementTargetOption,
  type Audience,
  type TargetScope,
} from './actions'
import { AiDraftButton } from '@/components/ai/AiDraftButton'
import { parseAnnouncementDraft } from '@/lib/ai/draftAssist'

const AUDIENCE_META: Record<Audience, { label: string; icon: typeof Users }> = {
  all: { label: 'Tất cả', icon: Users },
  parents: { label: 'Phụ huynh', icon: BellRing },
  students: { label: 'Học viên', icon: GraduationCap },
  teachers: { label: 'Giáo viên', icon: Presentation },
}

const SCOPE_META: Record<TargetScope, string> = {
  all: 'Toàn bộ nhóm',
  class: 'Theo lớp',
  individual: 'Cá nhân',
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

function scopeLabel(item: AnnouncementRow): string {
  if (item.audience === 'all' || item.targetScope === 'all') return 'Toàn bộ'
  if (item.targetScope === 'class') {
    return `Theo lớp (${item.targetClassIds.length})`
  }
  return `Cá nhân (${item.targetUserIds.length})`
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
  const [targetScope, setTargetScope] = useState<TargetScope>('all')
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [classes, setClasses] = useState<AnnouncementTargetOption[]>([])
  const [people, setPeople] = useState<AnnouncementTargetOption[]>([])
  const [pinned, setPinned] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [personQ, setPersonQ] = useState('')

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

  useEffect(() => {
    if (!currentOrgId || audience === 'all') {
      setClasses([])
      setPeople([])
      setTargetScope('all')
      setSelectedClassIds([])
      setSelectedUserIds([])
      return
    }
    void getAnnouncementTargetOptions(currentOrgId, audience).then((res) => {
      if (res.error) {
        setToast({ type: 'error', message: res.error })
        return
      }
      setClasses(res.classes)
      setPeople(res.people)
    })
  }, [currentOrgId, audience])

  const handleSubmit = async () => {
    if (!currentOrgId || submitting) return
    setSubmitting(true)
    const result = await createAnnouncement({
      orgId: currentOrgId,
      title,
      body,
      audience,
      pinned,
      targetScope: audience === 'all' ? 'all' : targetScope,
      targetClassIds: selectedClassIds,
      targetUserIds: selectedUserIds,
    })
    setSubmitting(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã đăng thông báo — các cổng sẽ thấy ngay.' })
    setTitle('')
    setBody('')
    setPinned(false)
    setSelectedClassIds([])
    setSelectedUserIds([])
    setTargetScope('all')
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

  const toggleId = (list: string[], id: string, set: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const filteredPeople = people.filter((p) => {
    const q = personQ.trim().toLowerCase()
    if (!q) return true
    return (
      p.label.toLowerCase().includes(q) ||
      (p.hint ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight sm:text-xl">
          <Send className="h-5 w-5 text-primary" aria-hidden="true" />
          Gửi thông báo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gửi tới phụ huynh, học viên hoặc giáo viên — toàn bộ nhóm, theo lớp, hoặc cá nhân.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
        <section className="h-fit rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Soạn thông báo</p>
            <AiDraftButton
              orgId={currentOrgId}
              draftMode="announcement"
              label="AI soạn"
              contextHint={`Nhóm nhận: ${AUDIENCE_META[audience].label}. Phạm vi: ${SCOPE_META[targetScope]}. ${title ? `Gợi ý tiêu đề: ${title}` : ''} ${body ? `Gợi ý nội dung: ${body.slice(0, 200)}` : ''}`}
              onDraft={(text) => {
                const parsed = parseAnnouncementDraft(text)
                setTitle(parsed.title)
                setBody(parsed.body)
                setToast({ type: 'success', message: 'Đã điền tiêu đề & nội dung từ AI — hãy kiểm tra trước khi gửi.' })
              }}
              onError={(message) => setToast({ type: 'error', message })}
            />
          </div>
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
              placeholder="VD: Trung tâm nghỉ từ 01/09 đến hết 02/09..."
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="mt-3">
            <span className="text-sm font-medium">Nhóm nhận</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(Object.keys(AUDIENCE_META) as Audience[]).map((key) => {
                const meta = AUDIENCE_META[key]
                const Icon = meta.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setAudience(key)
                      setTargetScope('all')
                      setSelectedClassIds([])
                      setSelectedUserIds([])
                    }}
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

          {audience !== 'all' && (
            <div className="mt-3">
              <span className="text-sm font-medium">Phạm vi trong nhóm</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(Object.keys(SCOPE_META) as TargetScope[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTargetScope(key)
                      setSelectedClassIds([])
                      setSelectedUserIds([])
                    }}
                    aria-pressed={targetScope === key}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      targetScope === key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {SCOPE_META[key]}
                  </button>
                ))}
              </div>

              {targetScope === 'class' && (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                  {classes.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">Chưa có lớp.</p>
                  ) : (
                    classes.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          checked={selectedClassIds.includes(c.id)}
                          onChange={() =>
                            toggleId(selectedClassIds, c.id, setSelectedClassIds)
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        {c.label}
                      </label>
                    ))
                  )}
                </div>
              )}

              {targetScope === 'individual' && (
                <div className="mt-2 space-y-2">
                  <input
                    type="search"
                    value={personQ}
                    onChange={(e) => setPersonQ(e.target.value)}
                    placeholder={
                      audience === 'teachers'
                        ? 'Tìm giáo viên…'
                        : 'Tìm học viên (PH nhận theo HV)…'
                    }
                    className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  />
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {filteredPeople.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">Không có kết quả.</p>
                    ) : (
                      filteredPeople.slice(0, 80).map((p) => (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(p.id)}
                            onChange={() =>
                              toggleId(selectedUserIds, p.id, setSelectedUserIds)
                            }
                            className="mt-0.5 h-4 w-4 rounded border-border"
                          />
                          <span>
                            {p.label}
                            {p.hint && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                · {p.hint}
                              </span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {meta.label} · {scopeLabel(item)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        title="Gỡ thông báo"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                    {item.body}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
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
