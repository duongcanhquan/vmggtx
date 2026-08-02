'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Flame,
  GraduationCap,
  Inbox,
  Loader2,
  Megaphone,
  Phone,
  Plus,
  Save,
  Search,
  UserRound,
  UserRoundCog,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { convertLeadSchema, leadSchema } from '@/lib/validation/schemas'
import {
  assignLeadCounselor,
  convertLeadToStudent,
  createLead,
  getCrmOptions,
  getLeadFunnelStats,
  getLeads,
  updateLeadStatus,
  type LeadCard,
  type LeadFunnelStats,
  type LeadStatus,
  type Option,
  SOURCE_LABELS,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { LeadDetailDrawer } from './LeadDetailDrawer'

const COLUMNS: {
  status: LeadStatus
  label: string
  accent: string
  headerClass: string
}[] = [
  {
    status: 'new',
    label: 'Mới',
    accent: 'border-t-sky-400',
    headerClass: 'text-sky-700 bg-sky-50',
  },
  {
    status: 'contacted',
    label: 'Đã liên hệ',
    accent: 'border-t-primary',
    headerClass: 'text-primary bg-primary/10',
  },
  {
    status: 'test_scheduled',
    label: 'Hẹn test',
    accent: 'border-t-amber-400',
    headerClass: 'text-amber-700 bg-amber-50',
  },
  {
    status: 'enrolled',
    label: 'Đã nhập học',
    accent: 'border-t-emerald-400',
    headerClass: 'text-emerald-700 bg-emerald-50',
  },
  {
    status: 'lost',
    label: 'Mất lead',
    accent: 'border-t-muted-foreground/40',
    headerClass: 'text-muted-foreground bg-muted',
  },
]

const PRIORITY_BADGE: Record<string, string> = {
  hot: 'bg-destructive/10 text-destructive',
  warm: 'bg-amber-50 text-amber-700',
  cold: 'bg-muted text-muted-foreground',
}

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

type LeadFormInput = z.input<typeof leadSchema>
type LeadFormOutput = z.output<typeof leadSchema>

function NewLeadModal({
  orgId,
  subjects,
  sources,
  priorities,
  onClose,
  onSaved,
}: {
  orgId: string
  subjects: Option[]
  sources: { id: string; label: string }[]
  priorities: { id: string; label: string }[]
  onClose: () => void
  onSaved: (warning?: string) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFormInput, unknown, LeadFormOutput>({
    resolver: zodResolver(leadSchema),
    mode: 'onBlur',
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      interestedSubjectId: '',
      source: 'hotline',
      priority: 'warm',
      dateOfBirth: '',
      gender: '',
      cccd: '',
      address: '',
      currentSchool: '',
      educationLevel: '',
      careerInterest: '',
      interests: '',
      preferredSchedule: '',
      callSummary: '',
      parentName: '',
      parentPhone: '',
      parentRelation: '',
      parentEmail: '',
      parent2Name: '',
      parent2Phone: '',
      parent2Relation: '',
      nextFollowUpAt: '',
      appointmentAt: '',
      notes: '',
    },
  })

  async function onValid(values: LeadFormOutput) {
    setSubmitting(true)
    setServerError(null)
    const formData = new FormData()
    formData.set('orgId', orgId)
    formData.set('fullName', values.fullName)
    formData.set('phone', values.phone)
    formData.set('email', values.email ?? '')
    formData.set('interestedSubjectId', values.interestedSubjectId ?? '')
    formData.set('source', values.source || 'other')
    formData.set('priority', values.priority || 'warm')
    formData.set('dateOfBirth', values.dateOfBirth || '')
    formData.set('gender', values.gender || '')
    formData.set('cccd', values.cccd ?? '')
    formData.set('address', values.address ?? '')
    formData.set('currentSchool', values.currentSchool ?? '')
    formData.set('educationLevel', values.educationLevel ?? '')
    formData.set('careerInterest', values.careerInterest ?? '')
    formData.set('interests', values.interests ?? '')
    formData.set('preferredSchedule', values.preferredSchedule ?? '')
    formData.set('callSummary', values.callSummary ?? '')
    formData.set('parentName', values.parentName ?? '')
    formData.set('parentPhone', values.parentPhone ?? '')
    formData.set('parentRelation', values.parentRelation || '')
    formData.set('parentEmail', values.parentEmail ?? '')
    formData.set('parent2Name', values.parent2Name ?? '')
    formData.set('parent2Phone', values.parent2Phone ?? '')
    formData.set('parent2Relation', values.parent2Relation || '')
    formData.set('nextFollowUpAt', values.nextFollowUpAt || '')
    formData.set('appointmentAt', values.appointmentAt || '')
    formData.set('notes', values.notes ?? '')

    const result = await createLead(formData)
    setSubmitting(false)
    if (result.error) {
      setServerError(result.error)
      return
    }
    onSaved('warning' in result ? result.warning : undefined)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-lead-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-pointer bg-foreground/40"
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-lead-title" className="font-heading text-lg font-bold">
            Thêm Lead mới
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium">
                Họ tên <span className="text-destructive">*</span>
              </label>
              <input
                id="lead-name"
                className={`${inputClass} ${errors.fullName ? inputErrorClass : ''}`}
                {...register('fullName')}
              />
              <FieldError message={errors.fullName?.message} />
            </div>
            <div>
              <label htmlFor="lead-phone" className="mb-1.5 block text-sm font-medium">
                Số điện thoại <span className="text-destructive">*</span>
              </label>
              <input
                id="lead-phone"
                type="tel"
                inputMode="numeric"
                placeholder="0xxxxxxxxx"
                className={`${inputClass} ${errors.phone ? inputErrorClass : ''}`}
                {...register('phone')}
              />
              <FieldError message={errors.phone?.message} />
            </div>
            <div>
              <label htmlFor="lead-email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="lead-email"
                type="email"
                className={`${inputClass} ${errors.email ? inputErrorClass : ''}`}
                {...register('email')}
              />
              <FieldError message={errors.email?.message} />
            </div>
            <div>
              <label htmlFor="lead-source" className="mb-1.5 block text-sm font-medium">
                Nguồn
              </label>
              <select
                id="lead-source"
                className={`${inputClass} cursor-pointer`}
                {...register('source')}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lead-prio" className="mb-1.5 block text-sm font-medium">
                Độ nóng
              </label>
              <select
                id="lead-prio"
                className={`${inputClass} cursor-pointer`}
                {...register('priority')}
              >
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="lead-subject" className="mb-1.5 block text-sm font-medium">
                Môn quan tâm
              </label>
              <select
                id="lead-subject"
                className={`${inputClass} cursor-pointer`}
                {...register('interestedSubjectId')}
              >
                <option value="">— Chưa rõ —</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lead-pname" className="mb-1.5 block text-sm font-medium">
                Tên phụ huynh <span className="text-destructive">*</span>
              </label>
              <input id="lead-pname" className={inputClass} {...register('parentName')} />
            </div>
            <div>
              <label htmlFor="lead-pphone" className="mb-1.5 block text-sm font-medium">
                SĐT phụ huynh <span className="text-destructive">*</span>
              </label>
              <input
                id="lead-pphone"
                className={`${inputClass} ${errors.parentPhone ? inputErrorClass : ''}`}
                {...register('parentPhone')}
              />
              <FieldError message={errors.parentPhone?.message} />
            </div>
            <div>
              <label htmlFor="lead-prel" className="mb-1.5 block text-sm font-medium">
                Quan hệ PH
              </label>
              <select
                id="lead-prel"
                className={`${inputClass} cursor-pointer`}
                {...register('parentRelation')}
              >
                <option value="">—</option>
                <option value="father">Bố</option>
                <option value="mother">Mẹ</option>
                <option value="guardian">Người giám hộ</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div>
              <label htmlFor="lead-cccd" className="mb-1.5 block text-sm font-medium">
                CCCD/CMND
              </label>
              <input
                id="lead-cccd"
                className={`${inputClass} ${errors.cccd ? inputErrorClass : ''}`}
                {...register('cccd')}
              />
              <FieldError message={errors.cccd?.message} />
            </div>
            <div>
              <label htmlFor="lead-career" className="mb-1.5 block text-sm font-medium">
                Ngành nghề / CT quan tâm
              </label>
              <input id="lead-career" className={inputClass} {...register('careerInterest')} />
            </div>
            <div>
              <label htmlFor="lead-school" className="mb-1.5 block text-sm font-medium">
                Trường đang học
              </label>
              <input id="lead-school" className={inputClass} {...register('currentSchool')} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="lead-interests" className="mb-1.5 block text-sm font-medium">
                Sở thích / tính cách
              </label>
              <input id="lead-interests" className={inputClass} {...register('interests')} />
            </div>
            <div>
              <label htmlFor="lead-follow" className="mb-1.5 block text-sm font-medium">
                Hẹn follow-up
              </label>
              <input
                id="lead-follow"
                type="datetime-local"
                className={inputClass}
                {...register('nextFollowUpAt')}
              />
            </div>
            <div>
              <label htmlFor="lead-appt" className="mb-1.5 block text-sm font-medium">
                Hẹn test/gặp
              </label>
              <input
                id="lead-appt"
                type="datetime-local"
                className={inputClass}
                {...register('appointmentAt')}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="lead-notes" className="mb-1.5 block text-sm font-medium">
                Ghi chú
              </label>
              <textarea
                id="lead-notes"
                rows={3}
                className={`${inputClass} min-h-20 py-2 ${errors.notes ? inputErrorClass : ''}`}
                {...register('notes')}
              />
              <FieldError message={errors.notes?.message} />
            </div>
          </div>

          {serverError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? 'Đang lưu…' : 'Lưu Lead'}
          </button>
        </form>
      </div>
    </div>
  )
}

const convertFormSchema = convertLeadSchema.omit({ leadId: true })
type ConvertFormInput = z.input<typeof convertFormSchema>
type ConvertFormOutput = z.output<typeof convertFormSchema>

function ConvertLeadModal({
  lead,
  classes,
  onClose,
  onSaved,
}: {
  lead: LeadCard
  classes: Option[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConvertFormInput, unknown, ConvertFormOutput>({
    resolver: zodResolver(convertFormSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
      classId: '',
      tuitionAmount: 0,
      dueDate: '',
    },
  })

  async function onValid(values: ConvertFormOutput) {
    setSubmitting(true)
    setServerError(null)
    const formData = new FormData()
    formData.set('leadId', lead.id)
    formData.set('email', String(values.email))
    formData.set('password', String(values.password))
    formData.set('classId', String(values.classId))
    formData.set('tuitionAmount', String(values.tuitionAmount))
    formData.set('dueDate', String(values.dueDate ?? ''))

    const result = await convertLeadToStudent(formData)
    setSubmitting(false)
    if (result.error) {
      setServerError(result.error)
      return
    }
    const warning = 'warning' in result ? result.warning : undefined
    onSaved(
      warning ||
        `Đã chuyển hóa "${lead.full_name}" thành học sinh chính thức + tạo hóa đơn học phí.`
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="convert-lead-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-pointer bg-foreground/40"
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2
            id="convert-lead-title"
            className="flex items-center gap-2 font-heading text-lg font-bold"
          >
            <GraduationCap className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Chuyển hóa thành Học sinh
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          <strong>{lead.full_name}</strong> ({lead.phone}) — tạo tài khoản, ghi danh và xuất
          hóa đơn học phí đầu tiên.
        </p>

        <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
          <div>
            <label htmlFor="cv-email" className="mb-1.5 block text-sm font-medium">
              Email đăng nhập <span className="text-destructive">*</span>
            </label>
            <input
              id="cv-email"
              type="email"
              className={`${inputClass} ${errors.email ? inputErrorClass : ''}`}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <label htmlFor="cv-password" className="mb-1.5 block text-sm font-medium">
              Mật khẩu khởi tạo <span className="text-destructive">*</span>
            </label>
            <input
              id="cv-password"
              type="password"
              className={`${inputClass} ${errors.password ? inputErrorClass : ''}`}
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <div>
            <label htmlFor="cv-class" className="mb-1.5 block text-sm font-medium">
              Ghi danh vào lớp <span className="text-destructive">*</span>
            </label>
            <select
              id="cv-class"
              className={`${inputClass} cursor-pointer ${errors.classId ? inputErrorClass : ''}`}
              {...register('classId')}
            >
              <option value="">— Chọn lớp —</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.classId?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cv-tuition" className="mb-1.5 block text-sm font-medium">
                Học phí đầu tiên (VND) <span className="text-destructive">*</span>
              </label>
              <input
                id="cv-tuition"
                type="number"
                step={100_000}
                className={`${inputClass} ${errors.tuitionAmount ? inputErrorClass : ''}`}
                {...register('tuitionAmount')}
              />
              <FieldError message={errors.tuitionAmount?.message} />
            </div>
            <div>
              <label htmlFor="cv-due" className="mb-1.5 block text-sm font-medium">
                Hạn thanh toán
              </label>
              <input
                id="cv-due"
                type="date"
                className={`${inputClass} ${errors.dueDate ? inputErrorClass : ''}`}
                {...register('dueDate')}
              />
              <FieldError message={errors.dueDate?.message} />
            </div>
          </div>

          {serverError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
            >
              {serverError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
              )}
              {submitting ? 'Đang chuyển hóa…' : 'Xác nhận nhập học'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LostReasonModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: LeadCard
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do mất lead.')
      return
    }
    setSubmitting(true)
    setError(null)
    await onConfirm(reason.trim())
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <h2 className="font-heading text-lg font-bold">Lý do mất lead</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Đánh dấu <strong>{lead.full_name}</strong> là mất lead — bắt buộc ghi lý do để báo
          cáo.
        </p>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="VD: Chọn trung tâm khác, học phí cao, không liên lạc được…"
          className={`${inputClass} mt-3 min-h-20 py-2`}
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  )
}

function AppointmentModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: LeadCard
  onClose: () => void
  onConfirm: (appointmentAt: string) => Promise<void>
}) {
  const [appointmentAt, setAppointmentAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    await onConfirm(appointmentAt)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
          Hẹn test / tư vấn
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chuyển <strong>{lead.full_name}</strong> sang cột Hẹn test. Có thể bỏ trống lịch nếu
          chưa chốt giờ.
        </p>
        <input
          type="datetime-local"
          value={appointmentAt}
          onChange={(e) => setAppointmentAt(e.target.value)}
          className={`${inputClass} mt-3`}
        />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-semibold hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CrmLeadsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [leads, setLeads] = useState<LeadCard[]>([])
  const [subjects, setSubjects] = useState<Option[]>([])
  const [classes, setClasses] = useState<Option[]>([])
  const [counselors, setCounselors] = useState<Option[]>([])
  const [sources, setSources] = useState<{ id: string; label: string }[]>([])
  const [priorities, setPriorities] = useState<{ id: string; label: string }[]>([])
  const [activityTypes, setActivityTypes] = useState<{ id: string; label: string }[]>([])
  const [funnel, setFunnel] = useState<LeadFunnelStats | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [convertLead, setConvertLead] = useState<LeadCard | null>(null)
  const [detailLead, setDetailLead] = useState<LeadCard | null>(null)
  const [lostLead, setLostLead] = useState<LeadCard | null>(null)
  const [apptLead, setApptLead] = useState<LeadCard | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const [searchText, setSearchText] = useState('')
  const [counselorFilter, setCounselorFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const loadData = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [leadResult, options, funnelResult] = await Promise.all([
      getLeads(currentOrgId),
      getCrmOptions(currentOrgId),
      getLeadFunnelStats(currentOrgId),
    ])
    setLeads(leadResult.data)
    setLoadError(leadResult.error || options.error || funnelResult.error || null)
    setSubjects(options.subjects)
    setClasses(options.classes)
    setCounselors(options.counselors)
    setSources(options.sources)
    setPriorities(options.priorities)
    setActivityTypes(options.activityTypes)
    setFunnel(funnelResult.data)
    setLoading(false)

    // Keep detail drawer in sync
    setDetailLead((prev) =>
      prev ? leadResult.data.find((l) => l.id === prev.id) || null : null
    )
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredLeads = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    return leads.filter((lead) => {
      if (counselorFilter === 'none' && lead.counselor_id) return false
      if (
        counselorFilter !== 'all' &&
        counselorFilter !== 'none' &&
        lead.counselor_id !== counselorFilter
      )
        return false
      if (sourceFilter !== 'all' && (lead.source || 'unknown') !== sourceFilter) return false
      if (priorityFilter !== 'all' && lead.priority !== priorityFilter) return false
      if (overdueOnly && !lead.is_overdue) return false
      if (!keyword) return true
      return (
        lead.full_name.toLowerCase().includes(keyword) ||
        lead.phone.includes(keyword) ||
        (lead.email ?? '').toLowerCase().includes(keyword) ||
        (lead.notes ?? '').toLowerCase().includes(keyword) ||
        (lead.parent_name ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [leads, searchText, counselorFilter, sourceFilter, priorityFilter, overdueOnly])

  async function handleAssignCounselor(leadId: string, counselorId: string) {
    const previous = leads
    const nextId = counselorId || null
    const nextName = counselors.find((c) => c.id === counselorId)?.name ?? null
    setLeads((current) =>
      current.map((l) =>
        l.id === leadId ? { ...l, counselor_id: nextId, counselor_name: nextName } : l
      )
    )
    const result = await assignLeadCounselor(leadId, nextId)
    if (result.error) {
      setLeads(previous)
      setToast({ type: 'error', message: result.error })
    }
  }

  function handleDragStart(event: React.DragEvent, leadId: string) {
    event.dataTransfer.setData('text/plain', leadId)
    event.dataTransfer.effectAllowed = 'move'
  }

  async function applyStatus(
    lead: LeadCard,
    targetStatus: LeadStatus,
    extras?: { lostReason?: string; appointmentAt?: string }
  ) {
    const previous = leads
    setLeads((current) =>
      current.map((l) =>
        l.id === lead.id
          ? {
              ...l,
              status: targetStatus,
              lost_reason: extras?.lostReason ?? l.lost_reason,
              appointment_at: extras?.appointmentAt || l.appointment_at,
            }
          : l
      )
    )
    const result = await updateLeadStatus(lead.id, targetStatus, extras)
    if (result.error) {
      setLeads(previous)
      setToast({ type: 'error', message: result.error })
      return false
    }
    await loadData()
    return true
  }

  async function handleDrop(event: React.DragEvent, targetStatus: LeadStatus) {
    event.preventDefault()
    setDragOverColumn(null)

    const leadId = event.dataTransfer.getData('text/plain')
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.status === targetStatus) return

    if (targetStatus === 'enrolled') {
      if (lead.converted_student_id) {
        setToast({ type: 'error', message: 'Lead này đã được chuyển hóa trước đó.' })
        return
      }
      setConvertLead(lead)
      return
    }

    if (targetStatus === 'lost') {
      setLostLead(lead)
      return
    }

    if (targetStatus === 'test_scheduled') {
      setApptLead(lead)
      return
    }

    await applyStatus(lead, targetStatus)
  }

  const overdueCount = leads.filter((l) => l.is_overdue).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Megaphone className="h-7 w-7 text-primary" aria-hidden="true" />
            Tuyển sinh (CRM)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pipeline lead → chăm sóc → hẹn test → nhập học. Bấm thẻ để mở nhật ký.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReport((prev) => !prev)}
            aria-pressed={showReport}
            className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              showReport
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-surface text-foreground hover:bg-muted'
            }`}
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Báo cáo
          </button>
          <button
            type="button"
            onClick={() => setNewLeadOpen(true)}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm Lead
          </button>
        </div>
      </div>

      {loadError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {loadError}
        </p>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm tên, SĐT, email, phụ huynh, ghi chú…"
            aria-label="Tìm kiếm lead"
            className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="relative sm:w-52">
          <UserRoundCog
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <select
            value={counselorFilter}
            onChange={(e) => setCounselorFilter(e.target.value)}
            aria-label="Lọc theo người tuyển sinh"
            className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">Tất cả phụ trách</option>
            <option value="none">Chưa phân công</option>
            {counselors.map((counselor) => (
              <option key={counselor.id} value={counselor.id}>
                {counselor.name}
              </option>
            ))}
          </select>
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Lọc nguồn"
          className="min-h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm sm:w-40"
        >
          <option value="all">Mọi nguồn</option>
          <option value="unknown">Chưa ghi nguồn</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Lọc độ nóng"
          className="min-h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm sm:w-36"
        >
          <option value="all">Mọi độ nóng</option>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
            overdueOnly
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border bg-surface hover:bg-muted'
          }`}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Quá hạn{overdueCount > 0 ? ` (${overdueCount})` : ''}
        </button>
      </div>

      {showReport && !loading && funnel && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="bento-card-dark p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary-foreground/70">
              Tổng quan pipeline
            </p>
            <p className="mt-3 font-heading text-4xl font-bold tabular-nums">
              {funnel.total}
              <span className="ml-2 text-base font-medium text-muted-foreground">lead</span>
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Đã nhập học</span>
                <span className="font-bold tabular-nums text-primary-foreground">
                  {funnel.byStatus.enrolled}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Mất lead</span>
                <span className="font-bold tabular-nums">{funnel.byStatus.lost}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Tỷ lệ chốt (closed)</span>
                <span className="font-bold tabular-nums">{funnel.conversionRate}%</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Follow-up quá hạn</span>
                <span className="font-bold tabular-nums text-destructive">
                  {funnel.overdueFollowUps}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Hẹn 7 ngày tới</span>
                <span className="font-bold tabular-nums">{funnel.upcomingAppointments}</span>
              </p>
            </div>
          </div>

          <div className="bento-card overflow-x-auto p-5">
            <h2 className="font-heading text-base font-bold">Theo nguồn</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {funnel.bySource
                .filter((s) => s.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((s) => (
                  <li key={s.source} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </li>
                ))}
              {funnel.bySource.every((s) => s.count === 0) && (
                <li className="text-muted-foreground">Chưa có dữ liệu nguồn.</li>
              )}
            </ul>
          </div>

          <div className="bento-card overflow-x-auto p-5 lg:col-span-1 xl:col-span-1">
            <h2 className="font-heading text-base font-bold">Theo người tuyển sinh</h2>
            <table className="mt-3 w-full min-w-[280px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold">Người</th>
                  <th className="py-2 pr-2 text-right font-semibold">Tổng</th>
                  <th className="py-2 pr-2 text-right font-semibold">Chốt</th>
                  <th className="py-2 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {funnel.byCounselor.map((row) => (
                  <tr
                    key={row.counselorId ?? '__none__'}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2 pr-2 font-medium">{row.counselorName}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{row.total}</td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums text-emerald-700">
                      {row.enrolled}
                    </td>
                    <td className="py-2 text-right tabular-nums">{row.conversionRate}%</td>
                  </tr>
                ))}
                {funnel.byCounselor.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      Chưa có lead nào để tổng kết.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <FunLoader label="Đang tải pipeline tuyển sinh…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const columnLeads = filteredLeads.filter((lead) => lead.status === column.status)
            const isOver = dragOverColumn === column.status
            return (
              <section
                key={column.status}
                aria-label={`Cột ${column.label}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverColumn(column.status)
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, column.status)}
                className={`flex min-h-64 flex-col rounded-2xl border border-t-4 bg-surface transition-colors duration-150 ${column.accent} ${
                  isOver ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <header className="flex items-center justify-between px-4 pb-2 pt-3">
                  <span
                    className={`rounded-lg px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${column.headerClass}`}
                  >
                    {column.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {columnLeads.length}
                  </span>
                </header>

                <div className="flex flex-1 flex-col gap-2.5 px-3 pb-3">
                  {columnLeads.length === 0 && (
                    <div className="mt-6 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border p-4 text-center">
                      <Inbox
                        className="h-5 w-5 text-muted-foreground/60"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-muted-foreground">
                        Chưa có lead — kéo thẻ vào đây
                      </p>
                    </div>
                  )}
                  {columnLeads.map((lead) => (
                    <article
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={() => setDetailLead(lead)}
                      className="cursor-grab rounded-xl border border-border bg-background p-3 shadow-sm transition-shadow duration-150 hover:shadow-md active:cursor-grabbing"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <UserRound
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {lead.full_name}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {lead.phone}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.subject_name && (
                          <span className="inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            {lead.subject_name}
                          </span>
                        )}
                        {lead.source && (
                          <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {SOURCE_LABELS[lead.source] || lead.source}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[lead.priority] || PRIORITY_BADGE.warm}`}
                        >
                          <Flame className="h-3 w-3" aria-hidden="true" />
                          {lead.priority === 'hot'
                            ? 'Nóng'
                            : lead.priority === 'cold'
                              ? 'Lạnh'
                              : 'Ấm'}
                        </span>
                        {lead.is_overdue && (
                          <span className="inline-flex rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                            Quá hạn
                          </span>
                        )}
                      </div>
                      {lead.notes && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {lead.notes}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Hồ sơ {lead.profile_completeness}%
                        {lead.activity_count > 0
                          ? ` · ${lead.activity_count} lần chăm sóc`
                          : ''}
                        {lead.career_interest ? ` · ${lead.career_interest}` : ''}
                      </p>
                      <select
                        value={lead.counselor_id ?? ''}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleAssignCounselor(lead.id, e.target.value)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Người phụ trách lead ${lead.full_name}`}
                        className="mt-2 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">— Chưa phân công —</option>
                        {counselors.map((counselor) => (
                          <option key={counselor.id} value={counselor.id}>
                            {counselor.name}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {newLeadOpen && currentOrgId && (
        <NewLeadModal
          orgId={currentOrgId}
          subjects={subjects}
          sources={sources}
          priorities={priorities}
          onClose={() => setNewLeadOpen(false)}
          onSaved={(warning) => {
            setNewLeadOpen(false)
            setToast({
              type: 'success',
              message: warning
                ? `Đã tạo lead. ${warning}`
                : 'Đã thêm lead mới vào cột "Mới".',
            })
            loadData()
          }}
        />
      )}

      {convertLead && (
        <ConvertLeadModal
          lead={convertLead}
          classes={classes}
          onClose={() => setConvertLead(null)}
          onSaved={(message) => {
            setConvertLead(null)
            setToast({ type: 'success', message })
            loadData()
          }}
        />
      )}

      {lostLead && (
        <LostReasonModal
          lead={lostLead}
          onClose={() => setLostLead(null)}
          onConfirm={async (reason) => {
            const ok = await applyStatus(lostLead, 'lost', { lostReason: reason })
            if (ok) setLostLead(null)
          }}
        />
      )}

      {apptLead && (
        <AppointmentModal
          lead={apptLead}
          onClose={() => setApptLead(null)}
          onConfirm={async (appointmentAt) => {
            const ok = await applyStatus(apptLead, 'test_scheduled', { appointmentAt })
            if (ok) setApptLead(null)
          }}
        />
      )}

      {detailLead && (
        <LeadDetailDrawer
          key={detailLead.id}
          lead={detailLead}
          subjects={subjects}
          sources={sources}
          priorities={priorities}
          activityTypes={activityTypes}
          onClose={() => setDetailLead(null)}
          onChanged={loadData}
          onToast={(type, message) => setToast({ type, message })}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
