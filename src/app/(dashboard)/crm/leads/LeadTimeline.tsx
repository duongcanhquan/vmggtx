'use client'

import {
  CalendarClock,
  FilePenLine,
  History,
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  RefreshCcw,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LeadActivityRow } from './actions'

type TimelineKind =
  | 'call'
  | 'email'
  | 'meeting'
  | 'zalo'
  | 'sms'
  | 'note'
  | 'status_change'
  | 'profile'
  | 'created'
  | 'other'

type Tone = {
  rail: string
  dot: string
  icon: string
  chip: string
  card: string
}

const TONES: Record<TimelineKind, Tone> = {
  call: {
    rail: 'bg-sky-300',
    dot: 'bg-sky-500 ring-sky-100',
    icon: 'bg-sky-100 text-sky-700',
    chip: 'bg-sky-50 text-sky-800',
    card: 'border-sky-100 bg-sky-50/50',
  },
  email: {
    rail: 'bg-violet-300',
    dot: 'bg-violet-500 ring-violet-100',
    icon: 'bg-violet-100 text-violet-700',
    chip: 'bg-violet-50 text-violet-800',
    card: 'border-violet-100 bg-violet-50/50',
  },
  meeting: {
    rail: 'bg-amber-300',
    dot: 'bg-amber-500 ring-amber-100',
    icon: 'bg-amber-100 text-amber-800',
    chip: 'bg-amber-50 text-amber-900',
    card: 'border-amber-100 bg-amber-50/60',
  },
  zalo: {
    rail: 'bg-emerald-300',
    dot: 'bg-emerald-500 ring-emerald-100',
    icon: 'bg-emerald-100 text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-800',
    card: 'border-emerald-100 bg-emerald-50/50',
  },
  sms: {
    rail: 'bg-teal-300',
    dot: 'bg-teal-500 ring-teal-100',
    icon: 'bg-teal-100 text-teal-700',
    chip: 'bg-teal-50 text-teal-800',
    card: 'border-teal-100 bg-teal-50/50',
  },
  note: {
    rail: 'bg-slate-300',
    dot: 'bg-slate-500 ring-slate-100',
    icon: 'bg-slate-100 text-slate-700',
    chip: 'bg-slate-100 text-slate-700',
    card: 'border-border bg-surface',
  },
  status_change: {
    rail: 'bg-indigo-300',
    dot: 'bg-indigo-500 ring-indigo-100',
    icon: 'bg-indigo-100 text-indigo-700',
    chip: 'bg-indigo-50 text-indigo-800',
    card: 'border-indigo-100 bg-indigo-50/60',
  },
  profile: {
    rail: 'bg-rose-300',
    dot: 'bg-rose-500 ring-rose-100',
    icon: 'bg-rose-100 text-rose-700',
    chip: 'bg-rose-50 text-rose-800',
    card: 'border-rose-100 bg-rose-50/50',
  },
  created: {
    rail: 'bg-secondary/50',
    dot: 'bg-secondary ring-violet-100',
    icon: 'bg-violet-100 text-secondary',
    chip: 'bg-violet-50 text-violet-800',
    card: 'border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50/80',
  },
  other: {
    rail: 'bg-slate-300',
    dot: 'bg-slate-400 ring-slate-100',
    icon: 'bg-muted text-muted-foreground',
    chip: 'bg-muted text-muted-foreground',
    card: 'border-border bg-surface',
  },
}

const ICONS: Record<TimelineKind, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  zalo: MessageCircle,
  sms: MessageSquareText,
  note: MessageSquareText,
  status_change: RefreshCcw,
  profile: FilePenLine,
  created: Sparkles,
  other: History,
}

const LABELS: Record<TimelineKind, string> = {
  call: 'Gọi điện',
  email: 'Email',
  meeting: 'Gặp mặt',
  zalo: 'Zalo',
  sms: 'SMS',
  note: 'Ghi chú',
  status_change: 'Mốc trạng thái',
  profile: 'Cập nhật hồ sơ',
  created: 'Tạo lead',
  other: 'Hoạt động',
}

function classifyActivity(
  type: string,
  description: string | null
): TimelineKind {
  // Ưu tiên loại hoạt động gốc — tránh nhầm status_change/call thành "profile"
  if (type === 'status_change') return 'status_change'
  if (type === 'created') return 'created'
  if (
    type === 'call' ||
    type === 'email' ||
    type === 'meeting' ||
    type === 'zalo' ||
    type === 'sms'
  ) {
    return type
  }

  const desc = (description || '').toLowerCase()
  if (/tạo lead|tao lead/.test(desc)) return 'created'
  if (
    /cập nhật|cap nhat|chỉnh sửa|chinh sua|soft-delete|ẩn lead|an lead/.test(desc) ||
    /nhận lead|nhan lead|gán tư vấn|gan tu van|phụ trách|phu trach/.test(desc)
  ) {
    return 'profile'
  }
  if (type === 'note') return 'note'
  if (type in TONES && type !== 'other') return type as TimelineKind
  return 'other'
}

function initials(name: string | null | undefined): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  const first = parts.at(0)?.[0] ?? ''
  const last = parts.at(-1)?.[0] ?? ''
  return `${first}${last}`.toUpperCase()
}

function actorVerb(kind: TimelineKind): string {
  if (kind === 'profile') return ' đã cập nhật hồ sơ'
  if (kind === 'status_change') return ' đã đổi trạng thái'
  if (kind === 'created') return ' · điểm bắt đầu'
  return ' đã ghi nhận'
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000
  )
  if (diffDays === 0) return 'Hôm nay'
  if (diffDays === 1) return 'Hôm qua'
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function relativeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

function prettyDescription(raw: string | null, kind: TimelineKind): string {
  if (!raw?.trim()) {
    return kind === 'created' ? 'Lead được tạo trong pipeline tuyển sinh.' : '—'
  }
  return raw
    .replace(/^Cap nhat thong tin lead\.?$/i, 'Cập nhật thông tin trên hồ sơ.')
    .replace(/^Cập nhật thông tin lead\.?$/i, 'Cập nhật thông tin trên hồ sơ.')
    .replace(/^Tao lead moi tu form tuyen sinh\.?$/i, 'Tạo lead mới từ form tuyển sinh.')
    .replace(/^Doi trang thai:/i, 'Đổi trạng thái:')
}

type TimelineItem = LeadActivityRow & { kind: TimelineKind }

export function LeadTimeline({
  activities,
  loading,
  leadCreatedAt,
  leadName,
}: {
  activities: LeadActivityRow[]
  loading: boolean
  leadCreatedAt: string
  leadName: string
}) {
  const items: TimelineItem[] = activities.map((act) => ({
    ...act,
    kind: classifyActivity(act.activity_type, act.description),
  }))

  const hasCreated = items.some((i) => i.kind === 'created')
  if (!hasCreated && leadCreatedAt) {
    items.push({
      id: `__created__${leadCreatedAt}`,
      lead_id: '',
      activity_type: 'created',
      description: `Tạo hồ sơ ứng viên «${leadName}».`,
      created_at: leadCreatedAt,
      created_by: null,
      creator_name: null,
      kind: 'created',
    })
  }

  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const groups: { key: string; label: string; items: TimelineItem[] }[] = []
  for (const item of items) {
    const key = dayKey(item.created_at)
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(item)
    else groups.push({ key, label: dayLabel(item.created_at), items: [item] })
  }

  const milestoneCount = items.filter(
    (i) => i.kind === 'status_change' || i.kind === 'created'
  ).length
  const careCount = items.filter((i) =>
    ['call', 'email', 'meeting', 'zalo', 'sms'].includes(i.kind)
  ).length
  const updateCount = items.filter((i) => i.kind === 'profile').length

  return (
    <aside
      className="flex h-full min-h-0 flex-col border-border bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_28%,#ffffff_100%)] lg:border-l"
      aria-label="Dòng thời gian lead"
    >
      <div className="shrink-0 border-b border-indigo-100/80 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-bold text-foreground">
              Dòng thời gian
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              Mốc · thao tác · cập nhật hồ sơ
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-indigo-100 bg-white/80 px-2 py-1.5 text-center">
            <p className="font-heading text-base font-bold tabular-nums text-primary">
              {milestoneCount}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mốc
            </p>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/80 px-2 py-1.5 text-center">
            <p className="font-heading text-base font-bold tabular-nums text-sky-700">
              {careCount}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Chăm sóc
            </p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-white/80 px-2 py-1.5 text-center">
            <p className="font-heading text-base font-bold tabular-nums text-rose-700">
              {updateCount}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Hồ sơ
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-indigo-100/50"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-indigo-200 bg-white/70 px-4 py-10 text-center">
            <CalendarClock className="h-8 w-8 text-indigo-300" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Chưa có mốc nào</p>
            <p className="text-xs text-muted-foreground">
              Ghi nhật ký chăm sóc hoặc cập nhật hồ sơ để hiện tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="sticky top-0 z-[1] mb-3 flex items-center gap-2 bg-[linear-gradient(180deg,rgba(238,242,255,0.95)_60%,transparent)] py-1 backdrop-blur-[2px]">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-indigo-100" aria-hidden="true" />
                </div>
                <ol className="relative space-y-0 pl-1">
                  {group.items.map((item, idx) => {
                    const tone = TONES[item.kind]
                    const Icon = ICONS[item.kind]
                    const isLast = idx === group.items.length - 1
                    const actor = item.creator_name?.trim() || 'Hệ thống'
                    return (
                      <li key={item.id} className="relative flex gap-3 pb-4">
                        {!isLast && (
                          <span
                            className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${tone.rail}`}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={`relative z-[1] mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${tone.dot} text-white shadow-sm`}
                          aria-hidden="true"
                        >
                          <span className="h-2 w-2 rounded-full bg-white" />
                        </span>
                        <article
                          className={`min-w-0 flex-1 rounded-2xl border p-3 shadow-sm transition-shadow duration-200 hover:shadow-md ${tone.card}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${tone.chip}`}
                                >
                                  {LABELS[item.kind]}
                                </span>
                                <time
                                  dateTime={item.created_at}
                                  className="text-[11px] font-medium tabular-nums text-muted-foreground"
                                  title={new Date(item.created_at).toLocaleString('vi-VN')}
                                >
                                  {timeLabel(item.created_at)} · {relativeLabel(item.created_at)}
                                </time>
                              </div>
                              <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium leading-snug text-foreground">
                                {prettyDescription(item.description, item.kind)}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <span
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground/90 text-[10px] font-bold text-white"
                                  aria-hidden="true"
                                >
                                  {item.kind === 'created' && !item.creator_name ? (
                                    <UserPlus className="h-3 w-3" />
                                  ) : (
                                    initials(actor)
                                  )}
                                </span>
                                <p className="truncate text-xs text-muted-foreground">
                                  <span className="font-semibold text-foreground/80">
                                    {actor}
                                  </span>
                                  {actorVerb(item.kind)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </article>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
