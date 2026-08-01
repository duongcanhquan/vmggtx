'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import {
  BadgeDollarSign,
  Calculator,
  FileSignature,
  Loader2,
  Save,
  Settings2,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { SmartTable, sortableHeader } from '@/components/shared/SmartTable'
import { contractSchema } from '@/lib/validation/schemas'
import {
  getContracts,
  getTeachersInScope,
  getViewerPermissions,
  upsertTeacherContract,
  type ContractRow,
  type ContractType,
  type TeacherOption,
} from './actions'
import {
  calculateMonthlyPayroll,
  type PayrollResultRow,
} from '../payroll/actions'

// ============================================================
// Quản lý Hợp đồng Giáo viên (/hr/contracts) - Campus Admin
// - SmartTable: danh sách GIÁO VIÊN thuộc currentOrgId (Zustand)
//   kèm trạng thái hợp đồng (Có/Không, loại hợp đồng).
// - "Cấu hình Hợp đồng" mở Sheet trượt từ phải với form RHF + zod.
//   UI logic: full_time hiện lương cơ bản/BHXH/tiết nghĩa vụ/%BH;
//   visiting|hourly ẩn khối lương, hiện đơn giá tiết + % thuế (mặc định 10).
// - Panel "Tính lương tháng" gọi calculateMonthlyPayroll.
// ============================================================

const CONTRACT_TYPE_META: Record<
  ContractType,
  { label: string; className: string }
> = {
  full_time: { label: 'Biên chế', className: 'bg-emerald-50 text-emerald-700' },
  visiting: { label: 'Thỉnh giảng', className: 'bg-sky-50 text-sky-700' },
  hourly: { label: 'Khoán giờ', className: 'bg-violet-50 text-violet-700' },
  probation: { label: 'Thử việc', className: 'bg-amber-50 text-amber-700' },
}

/** Loại hợp đồng trả lương theo tiết (không có lương cứng, không BHXH) */
const PER_HOUR_TYPES: ContractType[] = ['visiting', 'hourly']

const CURRENCY = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const inputErrorClass = 'border-red-400 focus-visible:ring-red-400'
/** Input tiền bị khóa khi user không có quyền tài chính: disable + che mờ */
const maskedInputClass = 'cursor-not-allowed opacity-40 blur-[3px] select-none'

/** Hiển thị số tiền: null (bị Secure View che) -> chuỗi Masked */
const MASKED_LABEL = '--- (Masked) ---'
function formatMoney(value: number | null, suffix = '') {
  if (value === null) return MASKED_LABEL
  return `${CURRENCY.format(value)}${suffix}`
}

/** Thông báo lỗi đỏ hiển thị NGAY dưới ô input sai */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

type FormInput = z.input<typeof contractSchema>
type FormOutput = z.output<typeof contractSchema>

/** 1 dòng của SmartTable: giáo viên + hợp đồng active hiện tại (nếu có) */
type TeacherContractRow = {
  teacher_id: string
  teacher_name: string
  contract: ContractRow | null
}

// ============================================================
// Sheet trượt từ phải: form Cấu hình Hợp đồng cho 1 giáo viên
// ============================================================
function ContractSheet({
  row,
  orgId,
  canViewFinancials,
  onClose,
  onSaved,
}: {
  row: TeacherContractRow
  orgId: string
  canViewFinancials: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    // đợi 1 frame để transition translate-x chạy
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const existing = row.contract
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(contractSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: existing
      ? {
          teacherId: row.teacher_id,
          contractType: existing.contract_type,
          // Số tiền null = bị Secure View che -> hiển thị 0 (input đã disabled)
          baseSalary: existing.base_salary ?? 0,
          insuranceSalary: existing.insurance_salary ?? 0,
          baseHourlyRate: existing.base_hourly_rate ?? 0,
          requiredHoursPerMonth: existing.required_hours_per_month,
          insurancePercentage: existing.insurance_percentage,
          taxPercentage: existing.tax_percentage,
          startDate: existing.start_date ?? '',
          endDate: existing.end_date ?? '',
        }
      : {
          teacherId: row.teacher_id,
          contractType: 'full_time',
          baseSalary: 0,
          insuranceSalary: 0,
          baseHourlyRate: 0,
          requiredHoursPerMonth: 0,
          insurancePercentage: 0,
          taxPercentage: 0,
          startDate: '',
          endDate: '',
        },
  })

  const contractType = watch('contractType') as ContractType
  const isPerHour = PER_HOUR_TYPES.includes(contractType)

  // ===== UI LOGIC QUAN TRỌNG: đổi loại hợp đồng → reset khối tương ứng =====
  function handleTypeChange(nextType: ContractType) {
    setValue('contractType', nextType, { shouldValidate: true })
    if (PER_HOUR_TYPES.includes(nextType)) {
      // Thỉnh giảng/khoán giờ: không lương cứng, không BHXH
      setValue('baseSalary', 0)
      setValue('insuranceSalary', 0)
      setValue('requiredHoursPerMonth', 0)
      setValue('insurancePercentage', 0)
      // Mặc định khấu trừ thuế 10% nếu chưa cấu hình
      if (!Number(watch('taxPercentage'))) setValue('taxPercentage', 10)
    }
  }

  async function onValid(values: FormOutput) {
    setSubmitting(true)
    setServerError(null)

    const formData = new FormData()
    // org_id của cơ sở đang chọn - server double-check bằng is_authorized
    formData.set('orgId', orgId)
    formData.set('teacherId', values.teacherId)
    formData.set('contractType', values.contractType)
    formData.set('baseSalary', String(values.baseSalary))
    formData.set('insuranceSalary', String(values.insuranceSalary))
    formData.set('baseHourlyRate', String(values.baseHourlyRate))
    formData.set('requiredHoursPerMonth', String(values.requiredHoursPerMonth))
    formData.set('insurancePercentage', String(values.insurancePercentage))
    formData.set('taxPercentage', String(values.taxPercentage))
    formData.set('startDate', values.startDate ?? '')
    formData.set('endDate', values.endDate ?? '')

    const result = await upsertTeacherContract(formData)
    setSubmitting(false)

    if (result.error) {
      setServerError(result.error)
      return
    }

    onSaved(`Đã lưu hợp đồng cho ${row.teacher_name}.`)
    handleClose()
  }

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contract-sheet-title"
    >
      {/* Overlay */}
      <button
        type="button"
        aria-label="Đóng"
        onClick={handleClose}
        className={`absolute inset-0 h-full w-full cursor-pointer bg-slate-900/40 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panel trượt từ phải */}
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-md transform flex-col bg-surface shadow-2xl transition-transform duration-300 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="contract-sheet-title" className="font-heading text-lg font-bold">
              Cấu hình Hợp đồng
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{row.teacher_name}</p>
          </div>
          <button
            type="button"
            aria-label="Đóng panel"
            onClick={handleClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <form
          onSubmit={handleSubmit(onValid)}
          noValidate
          className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
        >
          {existing && (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-xs text-sky-800">
              Giáo viên đang có hợp đồng{' '}
              <strong>{CONTRACT_TYPE_META[existing.contract_type].label}</strong> hiệu lực.
              Lưu bản mới sẽ tự động ngưng hợp đồng cũ.
            </p>
          )}

          {!canViewFinancials && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              <strong>Chưa có quyền xem tài chính</strong> — các ô lương bị khóa,
              không thể lưu hợp đồng.
            </p>
          )}

          {/* ===== Loại hợp đồng ===== */}
          <div>
            <label htmlFor="ct-type" className="mb-1.5 block text-sm font-medium">
              Loại hợp đồng <span className="text-destructive">*</span>
            </label>
            <select
              id="ct-type"
              aria-invalid={!!errors.contractType}
              className={`${inputClass} cursor-pointer ${errors.contractType ? inputErrorClass : ''}`}
              {...register('contractType', {
                onChange: (e) => handleTypeChange(e.target.value as ContractType),
              })}
            >
              <option value="full_time">Biên chế (full_time)</option>
              <option value="visiting">Thỉnh giảng (visiting)</option>
              <option value="hourly">Khoán giờ (hourly)</option>
              <option value="probation">Thử việc (probation)</option>
            </select>
            <FieldError message={errors.contractType?.message} />
          </div>

          {/* ===== KHỐI BIÊN CHẾ: chỉ hiện khi full_time/probation ===== */}
          {!isPerHour && (
            <fieldset className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Lương biên chế
              </legend>
              <div>
                <label htmlFor="ct-base" className="mb-1.5 block text-sm font-medium">
                  Lương cơ bản (VND) <span className="text-destructive">*</span>
                </label>
                <input
                  id="ct-base"
                  type="number"
                  step={100_000}
                  disabled={!canViewFinancials}
                  aria-invalid={!!errors.baseSalary}
                  className={`${inputClass} ${errors.baseSalary ? inputErrorClass : ''} ${
                    !canViewFinancials ? maskedInputClass : ''
                  }`}
                  {...register('baseSalary', { valueAsNumber: true })}
                />
                <FieldError message={errors.baseSalary?.message} />
              </div>
              <div>
                <label htmlFor="ct-insurance-salary" className="mb-1.5 block text-sm font-medium">
                  Lương đóng bảo hiểm (VND)
                </label>
                <input
                  id="ct-insurance-salary"
                  type="number"
                  step={100_000}
                  disabled={!canViewFinancials}
                  aria-invalid={!!errors.insuranceSalary}
                  className={`${inputClass} ${errors.insuranceSalary ? inputErrorClass : ''} ${
                    !canViewFinancials ? maskedInputClass : ''
                  }`}
                  {...register('insuranceSalary', { valueAsNumber: true })}
                />
                <FieldError message={errors.insuranceSalary?.message} />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Để 0 nếu đóng BHXH trên lương cơ bản.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ct-hours" className="mb-1.5 block text-sm font-medium">
                    Số tiết nghĩa vụ / tháng
                  </label>
                  <input
                    id="ct-hours"
                    type="number"
                    step={1}
                    aria-invalid={!!errors.requiredHoursPerMonth}
                    className={`${inputClass} ${errors.requiredHoursPerMonth ? inputErrorClass : ''}`}
                    {...register('requiredHoursPerMonth', { valueAsNumber: true })}
                  />
                  <FieldError message={errors.requiredHoursPerMonth?.message} />
                </div>
                <div>
                  <label htmlFor="ct-insurance" className="mb-1.5 block text-sm font-medium">
                    % Trích bảo hiểm
                  </label>
                  <input
                    id="ct-insurance"
                    type="number"
                    step={0.5}
                    aria-invalid={!!errors.insurancePercentage}
                    className={`${inputClass} ${errors.insurancePercentage ? inputErrorClass : ''}`}
                    {...register('insurancePercentage', { valueAsNumber: true })}
                  />
                  <FieldError message={errors.insurancePercentage?.message} />
                </div>
              </div>
            </fieldset>
          )}

          {/* ===== Đơn giá tiết + thuế ===== */}
          <fieldset className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
              {isPerHour ? 'Trả lương theo tiết' : 'Tiết vượt giờ & thuế'}
            </legend>
            <div>
              <label htmlFor="ct-rate" className="mb-1.5 block text-sm font-medium">
                Đơn giá 1 tiết (VND)
                {isPerHour && <span className="text-destructive"> *</span>}
              </label>
              <input
                id="ct-rate"
                type="number"
                step={10_000}
                disabled={!canViewFinancials}
                aria-invalid={!!errors.baseHourlyRate}
                className={`${inputClass} ${errors.baseHourlyRate ? inputErrorClass : ''} ${
                  !canViewFinancials ? maskedInputClass : ''
                }`}
                {...register('baseHourlyRate', { valueAsNumber: true })}
              />
              <FieldError message={errors.baseHourlyRate?.message} />
              {!isPerHour && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Dùng để tính tiền tiết VƯỢT nghĩa vụ.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="ct-tax" className="mb-1.5 block text-sm font-medium">
                % Khấu trừ thuế TNCN
              </label>
              <input
                id="ct-tax"
                type="number"
                step={0.5}
                aria-invalid={!!errors.taxPercentage}
                className={`${inputClass} ${errors.taxPercentage ? inputErrorClass : ''}`}
                {...register('taxPercentage', { valueAsNumber: true })}
              />
              <FieldError message={errors.taxPercentage?.message} />
              {isPerHour && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Thỉnh giảng/khoán giờ thường khấu trừ 10% trước khi chi trả.
                </p>
              )}
            </div>
          </fieldset>

          {/* ===== Hiệu lực ===== */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ct-start" className="mb-1.5 block text-sm font-medium">
                Ngày hiệu lực
              </label>
              <input
                id="ct-start"
                type="date"
                aria-invalid={!!errors.startDate}
                className={`${inputClass} ${errors.startDate ? inputErrorClass : ''}`}
                {...register('startDate')}
              />
              <FieldError message={errors.startDate?.message} />
            </div>
            <div>
              <label htmlFor="ct-end" className="mb-1.5 block text-sm font-medium">
                Ngày kết thúc
              </label>
              <input
                id="ct-end"
                type="date"
                aria-invalid={!!errors.endDate}
                className={`${inputClass} ${errors.endDate ? inputErrorClass : ''}`}
                {...register('endDate')}
              />
              <FieldError message={errors.endDate?.message} />
            </div>
          </div>

          {serverError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {serverError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !canViewFinancials}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {submitting ? 'Đang lưu…' : 'Lưu hợp đồng'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

// ============================================================
// Trang chính
// ============================================================
export default function HrContractsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [canViewFinancials, setCanViewFinancials] = useState(true)
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  const [sheetRow, setSheetRow] = useState<TeacherContractRow | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Panel tính lương
  const now = new Date()
  const [payMonth, setPayMonth] = useState(now.getMonth() + 1)
  const [payYear, setPayYear] = useState(now.getFullYear())
  const [calculating, setCalculating] = useState(false)
  const [payrollRows, setPayrollRows] = useState<PayrollResultRow[]>([])
  const [payrollWarnings, setPayrollWarnings] = useState<string[]>([])

  const loadData = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const [teacherResult, contractResult, permissions] = await Promise.all([
      getTeachersInScope(currentOrgId),
      getContracts(currentOrgId),
      getViewerPermissions(),
    ])
    setTeachers(teacherResult.data)
    setContracts(contractResult.data)
    setCanViewFinancials(permissions.canViewFinancials)
    setIsDemo(teacherResult.demo)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ===== Merge: mỗi giáo viên 1 dòng + hợp đồng ACTIVE hiện tại (nếu có) =====
  const rows = useMemo<TeacherContractRow[]>(() => {
    const activeByTeacher = new Map<string, ContractRow>()
    for (const contract of contracts) {
      // contracts đã sort created_at desc → bản active mới nhất thắng
      if (contract.is_active && !activeByTeacher.has(contract.teacher_id)) {
        activeByTeacher.set(contract.teacher_id, contract)
      }
    }
    return teachers.map((teacher) => ({
      teacher_id: teacher.id,
      teacher_name: teacher.full_name,
      contract: activeByTeacher.get(teacher.id) ?? null,
    }))
  }, [teachers, contracts])

  const columns = useMemo<ColumnDef<TeacherContractRow>[]>(
    () => [
      {
        accessorKey: 'teacher_name',
        header: sortableHeader<TeacherContractRow>('Giáo viên'),
        meta: { label: 'Giáo viên' },
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.teacher_name}</span>
        ),
      },
      {
        id: 'has_contract',
        accessorFn: (row) => (row.contract ? 'Có' : 'Không'),
        header: 'Hợp đồng',
        meta: { label: 'Hợp đồng' },
        cell: ({ row }) =>
          row.original.contract ? (
            <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Có
            </span>
          ) : (
            <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              Không
            </span>
          ),
      },
      {
        id: 'contract_type',
        accessorFn: (row) =>
          row.contract ? CONTRACT_TYPE_META[row.contract.contract_type].label : '',
        header: 'Loại hợp đồng',
        meta: { label: 'Loại hợp đồng' },
        cell: ({ row }) => {
          const contract = row.original.contract
          if (!contract) return <span className="text-muted-foreground">—</span>
          const meta = CONTRACT_TYPE_META[contract.contract_type]
          return (
            <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
              {meta.label}
            </span>
          )
        },
      },
      {
        id: 'pay_summary',
        header: 'Lương / Đơn giá',
        meta: { label: 'Lương / Đơn giá' },
        cell: ({ row }) => {
          const contract = row.original.contract
          if (!contract) return <span className="text-muted-foreground">—</span>
          // Secure View (015) trả NULL khi user không có can_view_financials
          const isPerHour = PER_HOUR_TYPES.includes(contract.contract_type)
          const amount = isPerHour ? contract.base_hourly_rate : contract.base_salary
          if (contract.financials_masked || amount === null) {
            return (
              <span className="font-mono text-xs tracking-wider text-muted-foreground">
                {MASKED_LABEL}
              </span>
            )
          }
          return <span>{formatMoney(amount, isPerHour ? '/tiết' : '/tháng')}</span>
        },
      },
      {
        id: 'validity',
        header: 'Hiệu lực',
        meta: { label: 'Hiệu lực' },
        cell: ({ row }) => {
          const contract = row.original.contract
          if (!contract) return <span className="text-muted-foreground">—</span>
          const from = contract.start_date ?? '…'
          const to = contract.end_date ?? 'không thời hạn'
          return (
            <span className="text-xs text-muted-foreground">
              {from} → {to}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSheetRow(row.original)}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              Cấu hình Hợp đồng
            </button>
          </div>
        ),
      },
    ],
    []
  )

  async function handleCalculatePayroll() {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cấp quản lý ở góc trên bên phải.' })
      return
    }
    setCalculating(true)
    setPayrollRows([])
    setPayrollWarnings([])

    const result = await calculateMonthlyPayroll(currentOrgId, payMonth, payYear)
    setCalculating(false)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }

    setPayrollRows(result.rows)
    setPayrollWarnings(result.warnings)
    setToast({
      type: 'success',
      message: `Đã tính lương tháng ${payMonth}/${payYear} cho ${result.rows.length} giáo viên (lưu dạng draft).`,
    })
  }

  const inputSelectClass = `${inputClass} w-28 cursor-pointer`

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Hợp đồng Giáo viên
        </h1>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {!isDemo && !canViewFinancials && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Lương/đơn giá đang bị <strong>che (Masked)</strong> — tài khoản chưa có quyền{' '}
          <code>can_view_financials</code>.
        </p>
      )}

      {/* ===== SmartTable: giáo viên + trạng thái hợp đồng ===== */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-bold">
          <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" />
          Giáo viên thuộc cơ sở đang chọn
        </h2>
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải danh sách giáo viên…
          </div>
        ) : (
          <SmartTable
            columns={columns}
            data={rows}
            searchKey="teacher_name"
            searchPlaceholder="Tìm giáo viên…"
            emptyMessage="Không có giáo viên nào trong cơ sở này."
          />
        )}
      </section>

      {/* ===== Panel tính lương tháng ===== */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
          Tính lương tháng
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kết quả lưu dạng <strong>draft</strong> — bảng lương đã duyệt/đã chi không bị
          ghi đè.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="pay-month" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tháng
            </label>
            <select
              id="pay-month"
              value={payMonth}
              onChange={(e) => setPayMonth(Number(e.target.value))}
              className={inputSelectClass}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pay-year" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Năm
            </label>
            <select
              id="pay-year"
              value={payYear}
              onChange={(e) => setPayYear(Number(e.target.value))}
              className={inputSelectClass}
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleCalculatePayroll}
            disabled={calculating}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {calculating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <BadgeDollarSign className="h-4 w-4" aria-hidden="true" />
            )}
            {calculating ? 'Đang tính lương…' : 'Chạy tính lương'}
          </button>
        </div>

        {payrollWarnings.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {payrollWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        {payrollRows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2.5 font-semibold">Giáo viên</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Loại HĐ</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Giờ dạy</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lương chính</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Tiền dạy</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Bảo hiểm</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Thuế</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Thực lãnh</th>
                </tr>
              </thead>
              <tbody>
                {payrollRows.map((row) => (
                  <tr
                    key={row.teacher_id}
                    className={`border-b border-border last:border-b-0 ${
                      row.skipped ? 'bg-slate-50 text-muted-foreground' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {row.teacher_name}
                      {row.skipped && (
                        <span className="ml-2 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                          đã chốt
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold ${CONTRACT_TYPE_META[row.contract_type].className}`}
                      >
                        {CONTRACT_TYPE_META[row.contract_type].label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{row.total_hours_taught}</td>
                    <td className="px-3 py-2.5 text-right">{CURRENCY.format(row.regular_pay)}</td>
                    <td className="px-3 py-2.5 text-right">{CURRENCY.format(row.teaching_pay)}</td>
                    <td className="px-3 py-2.5 text-right text-rose-600">
                      -{CURRENCY.format(row.insurance_deduction)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-rose-600">
                      -{CURRENCY.format(row.tax_deduction)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-primary">
                      {CURRENCY.format(row.net_pay)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Sheet cấu hình hợp đồng ===== */}
      {sheetRow && currentOrgId && (
        <ContractSheet
          row={sheetRow}
          orgId={currentOrgId}
          canViewFinancials={canViewFinancials}
          onClose={() => setSheetRow(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            loadData()
          }}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
