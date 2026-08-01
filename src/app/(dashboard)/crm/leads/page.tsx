'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BarChart3,
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
import { useMemo } from 'react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { convertLeadSchema, leadSchema } from '@/lib/validation/schemas'
import {
  assignLeadCounselor,
  convertLeadToStudent,
  createLead,
  getCrmOptions,
  getLeads,
  updateLeadStatus,
  type LeadCard,
  type LeadStatus,
  type Option,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

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
// Báo cáo tổng kết tuyển sinh (tính từ danh sách lead đã tải)
// ============================================================
type CounselorReport = {
  counselorId: string | null
  counselorName: string
  total: number
  enrolled: number
  lost: number
  inProgress: number
  conversionRate: number
}

function buildCounselorReport(leads: LeadCard[]): CounselorReport[] {
  const byCounselor = new Map<string, CounselorReport>()
  for (const lead of leads) {
    const key = lead.counselor_id ?? '__none__'
    let report = byCounselor.get(key)
    if (!report) {
      report = {
        counselorId: lead.counselor_id,
        counselorName: lead.counselor_name ?? 'Chưa phân công',
        total: 0,
        enrolled: 0,
        lost: 0,
        inProgress: 0,
        conversionRate: 0,
      }
      byCounselor.set(key, report)
    }
    report.total += 1
    if (lead.status === 'enrolled') report.enrolled += 1
    else if (lead.status === 'lost') report.lost += 1
    else report.inProgress += 1
  }
  return [...byCounselor.values()]
    .map((report) => ({
      ...report,
      conversionRate:
        report.total > 0 ? Math.round((report.enrolled / report.total) * 100) : 0,
    }))
    .sort((a, b) => b.enrolled - a.enrolled || b.total - a.total)
}

// ============================================================
// Trang Kanban chính
// ============================================================
export default function CrmLeadsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [leads, setLeads] = useState<LeadCard[]>([])
  const [subjects, setSubjects] = useState<Option[]>([])
  const [classes, setClasses] = useState<Option[]>([])
  const [counselors, setCounselors] = useState<Option[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [convertLead, setConvertLead] = useState<LeadCard | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Bộ lọc & báo cáo
  const [searchText, setSearchText] = useState('')
  const [counselorFilter, setCounselorFilter] = useState<string>('all')
  const [showReport, setShowReport] = useState(false)

  const loadData = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [leadResult, options] = await Promise.all([
      getLeads(currentOrgId),
      getCrmOptions(currentOrgId),
    ])
    setLeads(leadResult.data)
    setIsDemo(leadResult.demo)
    setSubjects(options.subjects)
    setClasses(options.classes)
    setCounselors(options.counselors)
    setLoading(false)
  }, [currentOrgId])

  // Áp bộ lọc tìm kiếm + người tuyển sinh lên board
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
      if (!keyword) return true
      return (
        lead.full_name.toLowerCase().includes(keyword) ||
        lead.phone.includes(keyword) ||
        (lead.notes ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [leads, searchText, counselorFilter])

  const report = useMemo(() => buildCounselorReport(leads), [leads])
  const totalEnrolled = leads.filter((l) => l.status === 'enrolled').length
  const totalLost = leads.filter((l) => l.status === 'lost').length
  const overallRate = leads.length > 0 ? Math.round((totalEnrolled / leads.length) * 100) : 0

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReport((prev) => !prev)}
            aria-pressed={showReport}
            className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              showReport
                ? 'border-[#5d68e8]/40 bg-[#5d68e8]/10 text-[#3c3ac0]'
                : 'border-border bg-surface text-foreground hover:bg-stone-50'
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

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {/* ===== Thanh tìm kiếm + lọc theo người tuyển sinh ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm theo tên, SĐT, ghi chú…"
            aria-label="Tìm kiếm lead"
            className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="relative sm:w-64">
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
            <option value="all">Tất cả người phụ trách</option>
            <option value="none">Chưa phân công</option>
            {counselors.map((counselor) => (
              <option key={counselor.id} value={counselor.id}>
                {counselor.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Báo cáo tổng kết tuyển sinh ===== */}
      {showReport && !loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Tổng quan pipeline */}
          <div className="bento-card-dark p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#a5b5f7]">
              Tổng quan pipeline
            </p>
            <p className="mt-3 font-heading text-4xl font-bold tabular-nums">
              {leads.length}
              <span className="ml-2 text-base font-medium text-stone-400">lead</span>
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex justify-between">
                <span className="text-stone-400">Đã nhập học</span>
                <span className="font-bold text-[#a5b5f7] tabular-nums">{totalEnrolled}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-stone-400">Mất lead</span>
                <span className="font-bold tabular-nums">{totalLost}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-stone-400">Tỷ lệ chốt toàn cơ sở</span>
                <span className="font-bold text-[#a5b5f7] tabular-nums">{overallRate}%</span>
              </p>
            </div>
          </div>

          {/* Bảng theo người tuyển sinh */}
          <div className="bento-card overflow-x-auto p-5 lg:col-span-2">
            <h2 className="font-heading text-base font-bold">
              Kết quả theo người tuyển sinh
            </h2>
            <table className="mt-3 w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Người phụ trách</th>
                  <th className="py-2 pr-3 text-right font-semibold">Tổng lead</th>
                  <th className="py-2 pr-3 text-right font-semibold">Đang chăm sóc</th>
                  <th className="py-2 pr-3 text-right font-semibold">Nhập học</th>
                  <th className="py-2 pr-3 text-right font-semibold">Mất</th>
                  <th className="py-2 text-right font-semibold">Tỷ lệ chốt</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row) => (
                  <tr
                    key={row.counselorId ?? '__none__'}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="py-2.5 pr-3 font-medium">
                      {row.counselorName}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.total}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-sky-700">
                      {row.inProgress}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-emerald-700">
                      {row.enrolled}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                      {row.lost}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                          row.conversionRate >= 50
                            ? 'bg-emerald-50 text-emerald-700'
                            : row.conversionRate >= 20
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {row.conversionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
                {report.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
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
        /* ===== Kanban Board ===== */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const columnLeads = filteredLeads.filter(
              (lead) => lead.status === column.status
            )
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
                      {/* Gán người tuyển sinh phụ trách ngay trên thẻ */}
                      <select
                        value={lead.counselor_id ?? ''}
                        onChange={(e) => handleAssignCounselor(lead.id, e.target.value)}
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
