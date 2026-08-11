'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CalendarClock,
  Flame,
  Loader2,
  MessageSquarePlus,
  Phone,
  Save,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react'
import { leadActivitySchema, leadSchema } from '@/lib/validation/schemas'
import {
  addLeadActivity,
  claimLead,
  getLeadActivities,
  getLeadById,
  getLeadPaymentInfo,
  softDeleteLead,
  updateLead,
  type LeadActivityRow,
  type LeadCard,
  type LeadPaymentInfo,
  type Option,
} from './actions'
import { SOURCE_LABELS } from './constants'
import { LeadTimeline } from './LeadTimeline'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputErrorClass = 'border-destructive focus-visible:ring-destructive'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">
      {message}
    </p>
  )
}

const activityFormSchema = leadActivitySchema.omit({ leadId: true })
type ActivityInput = z.input<typeof activityFormSchema>
type ActivityOutput = z.output<typeof activityFormSchema>
type LeadFormInput = z.input<typeof leadSchema>
type LeadFormOutput = z.output<typeof leadSchema>

const PRIORITY_LABELS: Record<string, string> = {
  hot: 'Nóng',
  warm: 'Ấm',
  cold: 'Lạnh',
}

const POTENTIAL_LABELS: Record<string, string> = {
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
  unknown: 'Chưa rõ',
}

const POTENTIAL_OPTIONS = [
  { value: 'high', label: 'Cao' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'low', label: 'Thấp' },
  { value: 'unknown', label: 'Chưa rõ' },
] as const

const GENDER_LABELS: Record<string, string> = {
  male: 'Nam',
  female: 'Nữ',
  other: 'Khác',
}

const RELATION_LABELS: Record<string, string> = {
  father: 'Bố',
  mother: 'Mẹ',
  guardian: 'Người giám hộ',
  other: 'Khác',
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  const text =
    value === null || value === undefined || String(value).trim() === ''
      ? '—'
      : String(value)
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-foreground">
        {text}
      </p>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-heading text-sm font-bold text-foreground">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function leadToEditValues(lead: LeadCard): LeadFormInput {
  return {
    fullName: lead.full_name,
    phone: lead.phone,
    email: lead.email ?? '',
    interestedSubjectId: lead.interested_subject_id ?? '',
    source: lead.source ?? '',
    priority: lead.priority || 'warm',
    dateOfBirth: lead.date_of_birth ?? '',
    gender: (lead.gender as '' | 'male' | 'female' | 'other') || '',
    cccd: lead.cccd ?? '',
    address: lead.address ?? '',
    currentSchool: lead.current_school ?? '',
    educationLevel: lead.education_level ?? '',
    careerInterest: lead.career_interest ?? '',
    interests: lead.interests ?? '',
    preferredSchedule: lead.preferred_schedule ?? '',
    callSummary: lead.call_summary ?? '',
    strengths: lead.strengths ?? '',
    weaknesses: lead.weaknesses ?? '',
    needs: lead.needs ?? '',
    potentialRating:
      (lead.potential_rating as '' | 'high' | 'medium' | 'low' | 'unknown') || '',
    depositAmount:
      lead.deposit_amount != null ? String(lead.deposit_amount) : '',
    paymentNotes: lead.payment_notes ?? '',
    parentName: lead.parent_name ?? '',
    parentPhone: lead.parent_phone ?? '',
    parentRelation:
      (lead.parent_relation as '' | 'father' | 'mother' | 'guardian' | 'other') ||
      '',
    parentEmail: lead.parent_email ?? '',
    parent2Name: lead.parent2_name ?? '',
    parent2Phone: lead.parent2_phone ?? '',
    parent2Relation:
      (lead.parent2_relation as
        | ''
        | 'father'
        | 'mother'
        | 'guardian'
        | 'other') || '',
    nextFollowUpAt: toLocalInput(lead.next_follow_up_at),
    appointmentAt: toLocalInput(lead.appointment_at),
    notes: lead.notes ?? '',
  }
}

export function LeadDetailDrawer({
  lead: leadProp,
  subjects,
  sources,
  priorities,
  activityTypes,
  onClose,
  onChanged,
  onToast,
}: {
  lead: LeadCard
  subjects: Option[]
  sources: { id: string; label: string }[]
  priorities: { id: string; label: string }[]
  activityTypes: { id: string; label: string }[]
  onClose: () => void
  onChanged: () => void
  onToast: (type: 'success' | 'error', message: string) => void
}) {
  const [tab, setTab] = useState<'profile' | 'care' | 'edit' | 'payment'>('profile')
  const [detail, setDetail] = useState<LeadCard>(leadProp)
  const lead = detail
  const [activities, setActivities] = useState<LeadActivityRow[]>([])
  const [loadingActs, setLoadingActs] = useState(true)
  const [payment, setPayment] = useState<LeadPaymentInfo | null>(null)
  const [loadingPay, setLoadingPay] = useState(false)
  const [busy, setBusy] = useState(false)
  const readonly = lead.status === 'enrolled'

  const activityForm = useForm<ActivityInput, unknown, ActivityOutput>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      activityType: 'call',
      description: '',
      nextFollowUpAt: '',
    },
  })

  const editForm = useForm<LeadFormInput, unknown, LeadFormOutput>({
    resolver: zodResolver(leadSchema),
    defaultValues: leadToEditValues(leadProp),
  })

  useEffect(() => {
    setDetail(leadProp)
    setTab('profile')
    editForm.reset(leadToEditValues(leadProp))
    activityForm.reset({ activityType: 'call', description: '', nextFollowUpAt: '' })
    let cancelled = false
    ;(async () => {
      const res = await getLeadById(leadProp.id)
      if (cancelled || !res.data) return
      setDetail(res.data)
      editForm.reset(leadToEditValues(res.data))
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form khi đổi lead
  }, [leadProp.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingActs(true)
      const res = await getLeadActivities(leadProp.id)
      if (cancelled) return
      setActivities(res.data)
      setLoadingActs(false)
      if (res.error) onToast('error', res.error)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chi reload khi doi lead
  }, [leadProp.id])

  useEffect(() => {
    if (tab !== 'payment') return
    let cancelled = false
    ;(async () => {
      setLoadingPay(true)
      const res = await getLeadPaymentInfo(leadProp.id)
      if (cancelled) return
      setPayment(res.data)
      setLoadingPay(false)
      if (res.error) onToast('error', res.error)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, leadProp.id])

  async function loadActs() {
    setLoadingActs(true)
    const res = await getLeadActivities(lead.id)
    setActivities(res.data)
    setLoadingActs(false)
    if (res.error) onToast('error', res.error)
  }

  async function onAddActivity(values: ActivityOutput) {
    setBusy(true)
    const fd = new FormData()
    fd.set('leadId', lead.id)
    fd.set('activityType', values.activityType)
    fd.set('description', values.description)
    fd.set('nextFollowUpAt', values.nextFollowUpAt || '')
    const result = await addLeadActivity(fd)
    setBusy(false)
    if (result.error) {
      onToast('error', result.error)
      return
    }
    activityForm.reset({ activityType: 'call', description: '', nextFollowUpAt: '' })
    onToast('success', 'Đã ghi nhật ký chăm sóc.')
    await loadActs()
    onChanged()
  }

  async function onSaveEdit(values: LeadFormOutput) {
    setBusy(true)
    const fd = new FormData()
    fd.set('leadId', lead.id)
    fd.set('fullName', values.fullName)
    fd.set('phone', values.phone)
    fd.set('email', values.email ?? '')
    fd.set('interestedSubjectId', values.interestedSubjectId ?? '')
    fd.set('source', values.source || '')
    fd.set('priority', values.priority || 'warm')
    fd.set('dateOfBirth', values.dateOfBirth || '')
    fd.set('gender', values.gender || '')
    fd.set('cccd', values.cccd ?? '')
    fd.set('address', values.address ?? '')
    fd.set('currentSchool', values.currentSchool ?? '')
    fd.set('educationLevel', values.educationLevel ?? '')
    fd.set('careerInterest', values.careerInterest ?? '')
    fd.set('interests', values.interests ?? '')
    fd.set('preferredSchedule', values.preferredSchedule ?? '')
    fd.set('callSummary', values.callSummary ?? '')
    fd.set('strengths', values.strengths ?? '')
    fd.set('weaknesses', values.weaknesses ?? '')
    fd.set('needs', values.needs ?? '')
    fd.set('potentialRating', values.potentialRating || '')
    fd.set('depositAmount', values.depositAmount ?? '')
    fd.set('paymentNotes', values.paymentNotes ?? '')
    fd.set('parentName', values.parentName ?? '')
    fd.set('parentPhone', values.parentPhone ?? '')
    fd.set('parentRelation', values.parentRelation || '')
    fd.set('parentEmail', values.parentEmail ?? '')
    fd.set('parent2Name', values.parent2Name ?? '')
    fd.set('parent2Phone', values.parent2Phone ?? '')
    fd.set('parent2Relation', values.parent2Relation || '')
    fd.set('nextFollowUpAt', values.nextFollowUpAt || '')
    fd.set('appointmentAt', values.appointmentAt || '')
    fd.set('notes', values.notes ?? '')
    const result = await updateLead(fd)
    setBusy(false)
    if (result.error) {
      onToast('error', result.error)
      return
    }
    onToast('success', 'Đã cập nhật lead.')
    await loadActs()
    const refreshed = await getLeadById(lead.id)
    if (refreshed.data) setDetail(refreshed.data)
    onChanged()
  }

  async function onClaim() {
    setBusy(true)
    const result = await claimLead(lead.id)
    setBusy(false)
    if (result.error) {
      onToast('error', result.error)
      return
    }
    onToast('success', 'Đã nhận lead về phụ trách.')
    await loadActs()
    const refreshed = await getLeadById(lead.id)
    if (refreshed.data) setDetail(refreshed.data)
    onChanged()
  }

  async function onDelete() {
    if (!window.confirm(`Ẩn lead "${lead.full_name}" khỏi pipeline?`)) return
    setBusy(true)
    const result = await softDeleteLead(lead.id)
    setBusy(false)
    if (result.error) {
      onToast('error', result.error)
      return
    }
    onToast('success', 'Đã ẩn lead (soft-delete).')
    onClose()
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-foreground/30"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-6xl flex-col border-l border-border bg-surface shadow-2xl lg:flex-row">
        {/* ===== Cột trái: thao tác tư vấn viên ===== */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg font-bold">{lead.full_name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {lead.phone}
              </span>
              {lead.source && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {SOURCE_LABELS[lead.source] || lead.source}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {PRIORITY_LABELS[lead.priority] || lead.priority}
              </span>
              {lead.is_overdue && (
                <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                  Quá hạn follow-up
                </span>
              )}
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                Hồ sơ {lead.profile_completeness}%
              </span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-2 [scrollbar-width:none]">
          {(
            [
              ['profile', 'Tổng quan'],
              ['care', 'Chăm sóc'],
              ['edit', 'Chỉnh sửa'],
              ['payment', 'Đóng tiền'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-10 shrink-0 cursor-pointer rounded-t-lg px-3 text-sm font-semibold ${
                tab === key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'profile' && (
            <div className="space-y-5">
              <Section title="Hồ sơ cá nhân">
                <Field label="Họ tên" value={lead.full_name} />
                <Field label="SĐT" value={lead.phone} />
                <Field label="Email" value={lead.email} />
                <Field label="Ngày sinh" value={lead.date_of_birth} />
                <Field
                  label="Giới tính"
                  value={lead.gender ? GENDER_LABELS[lead.gender] ?? lead.gender : null}
                />
                <Field label="CCCD/CMND" value={lead.cccd} />
                <Field label="Địa chỉ" value={lead.address} />
                <Field label="Trường đang học" value={lead.current_school} />
                <Field label="Trình độ" value={lead.education_level} />
              </Section>
              <Section title="Gia đình">
                <Field label="Phụ huynh 1" value={lead.parent_name} />
                <Field label="SĐT PH 1" value={lead.parent_phone} />
                <Field
                  label="Quan hệ PH 1"
                  value={
                    lead.parent_relation
                      ? RELATION_LABELS[lead.parent_relation] ?? lead.parent_relation
                      : null
                  }
                />
                <Field label="Email PH 1" value={lead.parent_email} />
                <Field label="Phụ huynh 2" value={lead.parent2_name} />
                <Field label="SĐT PH 2" value={lead.parent2_phone} />
                <Field
                  label="Quan hệ PH 2"
                  value={
                    lead.parent2_relation
                      ? RELATION_LABELS[lead.parent2_relation] ??
                        lead.parent2_relation
                      : null
                  }
                />
              </Section>
              <Section title="Nguyện vọng">
                <Field label="Môn quan tâm" value={lead.subject_name} />
                <Field label="Ngành / chương trình" value={lead.career_interest} />
                <Field label="Sở thích / tính cách" value={lead.interests} />
                <Field label="Lịch học mong muốn" value={lead.preferred_schedule} />
                <Field
                  label="Nguồn"
                  value={lead.source ? SOURCE_LABELS[lead.source] : null}
                />
                <Field
                  label="Độ nóng"
                  value={PRIORITY_LABELS[lead.priority] ?? lead.priority}
                />
              </Section>
              <Section title="Tư vấn (gọi điện / đánh giá)">
                <Field label="Tóm tắt cuộc gọi" value={lead.call_summary} />
                <Field label="Điểm mạnh" value={lead.strengths} />
                <Field label="Điểm yếu" value={lead.weaknesses} />
                <Field label="Nhu cầu" value={lead.needs} />
                <Field
                  label="Tiềm năng"
                  value={
                    lead.potential_rating
                      ? POTENTIAL_LABELS[lead.potential_rating] ??
                        lead.potential_rating
                      : null
                  }
                />
                <Field label="Ghi chú chung" value={lead.notes} />
                <Field label="TV phụ trách" value={lead.counselor_name} />
                <Field label="Số tương tác" value={lead.activity_count} />
              </Section>
              <Section title="Đóng tiền (tóm tắt)">
                <Field
                  label="Đặt cọc"
                  value={
                    lead.deposit_amount != null
                      ? lead.deposit_amount.toLocaleString('vi-VN') + ' ₫'
                      : null
                  }
                />
                <Field label="Ghi chú tiền" value={lead.payment_notes} />
              </Section>
              <button
                type="button"
                onClick={() => setTab('edit')}
                className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-muted"
              >
                Chỉnh sửa hồ sơ
              </button>
            </div>
          )}

          {tab === 'care' && (
            <div className="space-y-5">
              {(lead.next_follow_up_at || lead.appointment_at) && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                  {lead.next_follow_up_at && (
                    <p className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                      Follow-up:{' '}
                      <strong>
                        {new Date(lead.next_follow_up_at).toLocaleString('vi-VN')}
                      </strong>
                    </p>
                  )}
                  {lead.appointment_at && (
                    <p className="mt-1 flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                      Hẹn test/gặp:{' '}
                      <strong>
                        {new Date(lead.appointment_at).toLocaleString('vi-VN')}
                      </strong>
                    </p>
                  )}
                </div>
              )}

              {lead.lost_reason && (
                <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
                  Lý do mất: <strong>{lead.lost_reason}</strong>
                </p>
              )}

              {!readonly && (
                <form
                  onSubmit={activityForm.handleSubmit(onAddActivity)}
                  className="space-y-3 rounded-xl border border-border p-3"
                  noValidate
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquarePlus className="h-4 w-4 text-primary" aria-hidden="true" />
                    Ghi nhật ký chăm sóc
                  </p>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="act-type">
                      Loại
                    </label>
                    <select
                      id="act-type"
                      className={`${inputClass} cursor-pointer`}
                      {...activityForm.register('activityType')}
                    >
                      {activityTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="act-desc">
                      Nội dung <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      id="act-desc"
                      rows={3}
                      className={`${inputClass} min-h-20 py-2 ${activityForm.formState.errors.description ? inputErrorClass : ''}`}
                      {...activityForm.register('description')}
                    />
                    <FieldError
                      message={activityForm.formState.errors.description?.message}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="act-follow">
                      Hẹn follow-up tiếp
                    </label>
                    <input
                      id="act-follow"
                      type="datetime-local"
                      className={inputClass}
                      {...activityForm.register('nextFollowUpAt')}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    )}
                    Lưu nhật ký
                  </button>
                </form>
              )}

            </div>
          )}

          {tab === 'edit' && (
            <form
              onSubmit={editForm.handleSubmit(onSaveEdit)}
              className="space-y-3"
              noValidate
            >
              <fieldset disabled={readonly} className="space-y-3 disabled:opacity-70">
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-name">
                    Họ tên
                  </label>
                  <input
                    id="edit-name"
                    className={inputClass}
                    {...editForm.register('fullName')}
                  />
                  <FieldError message={editForm.formState.errors.fullName?.message} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-phone">
                      SĐT
                    </label>
                    <input
                      id="edit-phone"
                      className={inputClass}
                      {...editForm.register('phone')}
                    />
                    <FieldError message={editForm.formState.errors.phone?.message} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-email">
                      Email
                    </label>
                    <input
                      id="edit-email"
                      type="email"
                      className={inputClass}
                      {...editForm.register('email')}
                    />
                    <FieldError message={editForm.formState.errors.email?.message} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-source">
                      Nguồn
                    </label>
                    <select
                      id="edit-source"
                      className={`${inputClass} cursor-pointer`}
                      {...editForm.register('source')}
                    >
                      <option value="">— Chọn —</option>
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-prio">
                      Độ nóng
                    </label>
                    <select
                      id="edit-prio"
                      className={`${inputClass} cursor-pointer`}
                      {...editForm.register('priority')}
                    >
                      {priorities.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-subject">
                    Môn quan tâm
                  </label>
                  <select
                    id="edit-subject"
                    className={`${inputClass} cursor-pointer`}
                    {...editForm.register('interestedSubjectId')}
                  >
                    <option value="">— Chưa rõ —</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-pname">
                      Phụ huynh
                    </label>
                    <input
                      id="edit-pname"
                      className={inputClass}
                      {...editForm.register('parentName')}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-pphone">
                      SĐT PH
                    </label>
                    <input
                      id="edit-pphone"
                      className={inputClass}
                      {...editForm.register('parentPhone')}
                    />
                    <FieldError message={editForm.formState.errors.parentPhone?.message} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-prel">
                      Quan hệ PH
                    </label>
                    <select id="edit-prel" className={`${inputClass} cursor-pointer`} {...editForm.register('parentRelation')}>
                      <option value="">—</option>
                      <option value="father">Bố</option>
                      <option value="mother">Mẹ</option>
                      <option value="guardian">Người giám hộ</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-pemail">
                      Email PH
                    </label>
                    <input id="edit-pemail" type="email" className={inputClass} {...editForm.register('parentEmail')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-dob">
                      Ngày sinh
                    </label>
                    <input id="edit-dob" type="date" className={inputClass} {...editForm.register('dateOfBirth')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-gender">
                      Giới tính
                    </label>
                    <select id="edit-gender" className={`${inputClass} cursor-pointer`} {...editForm.register('gender')}>
                      <option value="">—</option>
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-cccd">
                      CCCD/CMND
                    </label>
                    <input id="edit-cccd" className={inputClass} {...editForm.register('cccd')} />
                    <FieldError message={editForm.formState.errors.cccd?.message} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-school">
                      Trường đang học
                    </label>
                    <input id="edit-school" className={inputClass} {...editForm.register('currentSchool')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-addr">
                      Địa chỉ
                    </label>
                    <input id="edit-addr" className={inputClass} {...editForm.register('address')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-career">
                      Ngành nghề quan tâm
                    </label>
                    <input id="edit-career" className={inputClass} {...editForm.register('careerInterest')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-edu">
                      Trình độ
                    </label>
                    <input id="edit-edu" className={inputClass} {...editForm.register('educationLevel')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-interests">
                      Sở thích / tính cách
                    </label>
                    <textarea id="edit-interests" rows={2} className={`${inputClass} min-h-16 py-2`} {...editForm.register('interests')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-sched">
                      Lịch học mong muốn
                    </label>
                    <input id="edit-sched" className={inputClass} {...editForm.register('preferredSchedule')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-p2name">
                      Phụ huynh 2
                    </label>
                    <input id="edit-p2name" className={inputClass} {...editForm.register('parent2Name')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-call">
                      Tóm tắt cuộc gọi
                    </label>
                    <textarea id="edit-call" rows={2} className={`${inputClass} min-h-16 py-2`} {...editForm.register('callSummary')} />
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tư vấn / đánh giá</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-strengths">
                      Điểm mạnh
                    </label>
                    <textarea id="edit-strengths" rows={2} className={`${inputClass} min-h-16 py-2`} {...editForm.register('strengths')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-weaknesses">
                      Điểm yếu
                    </label>
                    <textarea id="edit-weaknesses" rows={2} className={`${inputClass} min-h-16 py-2`} {...editForm.register('weaknesses')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-needs">
                      Nhu cầu
                    </label>
                    <textarea id="edit-needs" rows={2} className={`${inputClass} min-h-16 py-2`} {...editForm.register('needs')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-potential">
                      Tiềm năng
                    </label>
                    <select id="edit-potential" className={inputClass} {...editForm.register('potentialRating')}>
                      <option value="">— Chưa đánh giá —</option>
                      {POTENTIAL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-deposit">
                      Đặt cọc (VND)
                    </label>
                    <input id="edit-deposit" type="number" min={0} className={inputClass} {...editForm.register('depositAmount')} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-paynotes">
                      Ghi chú đóng tiền
                    </label>
                    <textarea id="edit-paynotes" rows={2} className={`${inputClass} min-h-16 py-2`} {...editForm.register('paymentNotes')} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-follow">
                      Follow-up
                    </label>
                    <input
                      id="edit-follow"
                      type="datetime-local"
                      className={inputClass}
                      {...editForm.register('nextFollowUpAt')}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-appt">
                      Hẹn test/gặp
                    </label>
                    <input
                      id="edit-appt"
                      type="datetime-local"
                      className={inputClass}
                      {...editForm.register('appointmentAt')}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="edit-notes">
                    Ghi chú
                  </label>
                  <textarea
                    id="edit-notes"
                    rows={3}
                    className={`${inputClass} min-h-20 py-2`}
                    {...editForm.register('notes')}
                  />
                </div>
              </fieldset>

              {!readonly && (
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  Lưu hồ sơ
                </button>
              )}
            </form>
          )}

          {tab === 'payment' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Thông tin đặt cọc / ghi chú</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Đặt cọc</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {lead.deposit_amount != null && lead.deposit_amount > 0
                        ? `${lead.deposit_amount.toLocaleString('vi-VN')} ₫`
                        : '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Ghi chú đóng tiền</dt>
                    <dd className="whitespace-pre-wrap text-sm">{lead.payment_notes?.trim() || '—'}</dd>
                  </div>
                </dl>
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => setTab('edit')}
                    className="mt-3 text-sm font-medium text-primary hover:underline"
                  >
                    Chỉnh sửa trong tab Sửa
                  </button>
                )}
              </section>

              {lead.converted_student_id ? (
                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">Hoá đơn học viên đã chuyển đổi</h3>
                  {loadingPay ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Đang tải…
                    </p>
                  ) : payment?.invoices.length ? (
                    <ul className="space-y-2">
                      {payment.invoices.map((inv) => (
                        <li
                          key={inv.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">{inv.note?.trim() || 'Hóa đơn'}</p>
                            <p className="text-xs text-muted-foreground">
                              {inv.due_date ? `Hạn: ${inv.due_date}` : 'Không có hạn'}
                              {inv.paid > 0
                                ? ` · Đã thu: ${inv.paid.toLocaleString('vi-VN')} ₫`
                                : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold tabular-nums">{inv.amount.toLocaleString('vi-VN')} ₫</p>
                            <p className="text-xs text-muted-foreground">{inv.status}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Chưa có hóa đơn liên kết.</p>
                  )}
                </section>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Lead chưa chuyển thành học viên — chỉ có thông tin đặt cọc / ghi chú phía trên. Sau khi chuyển đổi, hóa đơn học phí sẽ hiện tại đây.
                </p>
              )}
            </div>
          )}

        </div>

        <footer className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
          {!lead.counselor_id && !readonly && (
            <button
              type="button"
              disabled={busy}
              onClick={onClaim}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              Nhận lead
            </button>
          )}
          {!readonly && lead.status !== 'lost' && (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-destructive/30 px-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Ẩn lead
            </button>
          )}
        </footer>
        </div>

        {/* ===== Cột phải: dòng thời gian (desktop cạnh trái; mobile dưới) ===== */}
        <div className="flex h-[42vh] min-h-[280px] w-full shrink-0 flex-col border-t border-border lg:h-full lg:w-[380px] lg:border-t-0 xl:w-[400px]">
          <LeadTimeline
            activities={activities}
            loading={loadingActs}
            leadCreatedAt={lead.created_at}
            leadName={lead.full_name}
          />
        </div>
      </div>
    </div>
  )
}
