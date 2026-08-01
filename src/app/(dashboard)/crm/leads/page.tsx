'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  GraduationCap,
  Inbox,
  Loader2,
  Megaphone,
  Phone,
  Plus,
  Save,
  UserRound,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { convertLeadSchema, leadSchema } from '@/lib/validation/schemas'
import {
  convertLeadToStudent,
  createLead,
  getCrmOptions,
  getLeads,
  updateLeadStatus,
  type LeadCard,
  type LeadStatus,
  type Option,
} from './actions'

// ============================================================
// CRM Tuyển sinh - Kanban Board (/crm/leads)
// - KHÔNG dùng Table: board kéo thả kiểu Trello bằng HTML5
//   Drag and Drop API (draggable / onDragOver / onDrop) + Tailwind.
// - Kéo lead vào cột "Đã nhập học" -> mở Modal chuyển hóa thành
//   Student chính thức (profiles + enrollments + invoice đầu tiên).
// ============================================================

const COLUMNS: {
  status: LeadStatus
  label: string
  accent: string
  headerClass: string
}[] = [
  { status: 'new', label: 'Mới (New)', accent: 'border-t-sky-400', headerClass: 'text-sky-700 bg-sky-50' },
  { status: 'contacted', label: 'Đã liên hệ', accent: 'border-t-indigo-400', headerClass: 'text-indigo-700 bg-indigo-50' },
  { status: 'test_scheduled', label: 'Hẹn test đầu vào', accent: 'border-t-amber-400', headerClass: 'text-amber-700 bg-amber-50' },
  { status: 'enrolled', label: 'Đã nhập học', accent: 'border-t-emerald-400', headerClass: 'text-emerald-700 bg-emerald-50' },
  { status: 'lost', label: 'Mất lead', accent: 'border-t-slate-300', headerClass: 'text-slate-500 bg-slate-100' },
]

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputErrorClass = 'border-red-400 focus-visible:ring-red-400'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

// ============================================================
// Modal tạo Lead mới
// ============================================================
type LeadFormInput = z.input<typeof leadSchema>
type LeadFormOutput = z.output<typeof leadSchema>

function NewLeadModal({
  orgId,
  subjects,
  onClose,
  onSaved,
}: {
  orgId: string
  subjects: Option[]
  onClose: () => void
  onSaved: () => void
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
    defaultValues: { fullName: '', phone: '', interestedSubjectId: '', notes: '' },
  })

  async function onValid(values: LeadFormOutput) {
    setSubmitting(true)
    setServerError(null)

    const formData = new FormData()
    formData.set('orgId', orgId)
    formData.set('fullName', values.fullName)
    formData.set('phone', values.phone)
    formData.set('interestedSubjectId', values.interestedSubjectId ?? '')
    formData.set('notes', values.notes ?? '')

    const result = await createLead(formData)
    setSubmitting(false)
    if (result.error) {
      setServerError(result.error)
      return
    }
    onSaved()
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
        className="absolute inset-0 h-full w-full cursor-pointer bg-slate-900/40"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-lead-title" className="font-heading text-lg font-bold">
            Thêm Lead mới
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-indigo-50 hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
          <div>
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
            <FieldError message={errors.interestedSubjectId?.message} />
          </div>
          <div>
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

          {serverError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
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

// ============================================================
// Modal chuyển hóa Lead -> Student (khi kéo vào cột Enrolled)
// ============================================================
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
    onSaved(`Đã chuyển hóa "${lead.full_name}" thành học sinh chính thức + tạo hóa đơn học phí.`)
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
        className="absolute inset-0 h-full w-full cursor-pointer bg-slate-900/40"
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 id="convert-lead-title" className="flex items-center gap-2 font-heading text-lg font-bold">
            <GraduationCap className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            Chuyển hóa thành Học sinh
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-indigo-50 hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          <strong>{lead.full_name}</strong> ({lead.phone}) — tạo tài khoản, ghi danh
          và xuất hóa đơn học phí đầu tiên.
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
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-indigo-50"
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

// ============================================================
// Trang Kanban chính
// ============================================================
export default function CrmLeadsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [leads, setLeads] = useState<LeadCard[]>([])
  const [subjects, setSubjects] = useState<Option[]>([])
  const [classes, setClasses] = useState<Option[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [convertLead, setConvertLead] = useState<LeadCard | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const [leadResult, options] = await Promise.all([
      getLeads(currentOrgId),
      getCrmOptions(currentOrgId),
    ])
    setLeads(leadResult.data)
    setIsDemo(leadResult.demo)
    setSubjects(options.subjects)
    setClasses(options.classes)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ===== HTML5 Drag and Drop =====
  function handleDragStart(event: React.DragEvent, leadId: string) {
    event.dataTransfer.setData('text/plain', leadId)
    event.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(event: React.DragEvent, targetStatus: LeadStatus) {
    event.preventDefault()
    setDragOverColumn(null)

    const leadId = event.dataTransfer.getData('text/plain')
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.status === targetStatus) return

    // Kéo vào "Đã nhập học" -> BẮT BUỘC qua modal chuyển hóa
    if (targetStatus === 'enrolled') {
      if (lead.converted_student_id) {
        setToast({ type: 'error', message: 'Lead này đã được chuyển hóa trước đó.' })
        return
      }
      setConvertLead(lead)
      return
    }

    // Optimistic update các cột còn lại
    const previous = leads
    setLeads((current) =>
      current.map((l) => (l.id === leadId ? { ...l, status: targetStatus } : l))
    )
    const result = await updateLeadStatus(leadId, targetStatus)
    if (result.error) {
      setLeads(previous) // revert
      setToast({ type: 'error', message: result.error })
    }
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Megaphone className="h-7 w-7 text-primary" aria-hidden="true" />
            Tuyển sinh (CRM)
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setNewLeadOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm Lead
        </button>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải pipeline tuyển sinh…
        </div>
      ) : (
        /* ===== Kanban Board ===== */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const columnLeads = leads.filter((lead) => lead.status === column.status)
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
                  isOver ? 'border-primary bg-indigo-50/60' : 'border-border'
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
                      className="cursor-grab rounded-xl border border-border bg-background p-3 shadow-sm transition-shadow duration-150 hover:shadow-md active:cursor-grabbing"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        {lead.full_name}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {lead.phone}
                      </p>
                      {lead.subject_name && (
                        <span className="mt-2 inline-flex rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                          {lead.subject_name}
                        </span>
                      )}
                      {lead.notes && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {lead.notes}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {lead.counselor_name
                          ? `TVV: ${lead.counselor_name}`
                          : 'Chưa có người phụ trách'}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* ===== Modals ===== */}
      {newLeadOpen && currentOrgId && (
        <NewLeadModal
          orgId={currentOrgId}
          subjects={subjects}
          onClose={() => setNewLeadOpen(false)}
          onSaved={() => {
            setNewLeadOpen(false)
            setToast({ type: 'success', message: 'Đã thêm lead mới vào cột "Mới".' })
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

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
