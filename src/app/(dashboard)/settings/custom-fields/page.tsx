'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  Inbox,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { RoleGuard } from '@/components/shared/RoleGuard'
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  ENTITY_LABELS,
  FIELD_TYPE_LABELS,
  type CustomFieldDef,
  type CustomFieldEntity,
} from '@/lib/customFields'
import {
  customFieldSchema,
  type CustomFieldFormInput,
  type CustomFieldFormValues,
} from '@/lib/validation/schemas'
import { deleteCustomField, getCustomFields, saveCustomField } from './actions'

// ============================================================
// Cấu hình Trường dữ liệu động (/settings/custom-fields)
// Campus Admin tự định nghĩa thuộc tính riêng cho Học sinh /
// Giáo viên / Lớp học của cơ sở mình - không hardcode schema.
// ============================================================

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
      {message}
    </p>
  )
}

export default function CustomFieldsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [activeEntity, setActiveEntity] = useState<CustomFieldEntity>('student')
  const [fields, setFields] = useState<CustomFieldDef[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomFieldDef | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CustomFieldFormInput, unknown, CustomFieldFormValues>({
    resolver: zodResolver(customFieldSchema),
    defaultValues: {
      entityType: 'student',
      fieldName: '',
      fieldLabel: '',
      fieldType: 'text',
      optionsText: '',
      isRequired: false,
    },
  })

  const watchedType = watch('fieldType')

  const loadData = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const result = await getCustomFields(currentOrgId)
    setFields(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function openCreate() {
    setEditing(null)
    reset({
      entityType: activeEntity,
      fieldName: '',
      fieldLabel: '',
      fieldType: 'text',
      optionsText: '',
      isRequired: false,
    })
    setModalOpen(true)
  }

  function openEdit(field: CustomFieldDef) {
    setEditing(field)
    reset({
      entityType: field.entityType,
      fieldName: field.fieldName,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
      optionsText: field.options.join(', '),
      isRequired: field.isRequired,
    })
    setModalOpen(true)
  }

  async function onSubmit(values: CustomFieldFormValues) {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cơ sở ở góc trên bên phải.' })
      return
    }
    setSaving(true)
    const result = await saveCustomField(currentOrgId, editing?.id ?? null, values)
    setSaving(false)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: editing ? 'Đã cập nhật trường động.' : 'Đã thêm trường động mới.',
    })
    setModalOpen(false)
    loadData()
  }

  async function handleDelete(field: CustomFieldDef) {
    // [UX] Confirm trước khi xóa + disable nút trong lúc gửi
    const confirmed = window.confirm(
      `Xóa trường "${field.fieldLabel}"? Dữ liệu đã nhập trong custom_metadata sẽ không hiển thị trên form nữa.`
    )
    if (!confirmed) return

    setDeletingId(field.id)
    const result = await deleteCustomField(field.id)
    setDeletingId(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa trường "${field.fieldLabel}".` })
    loadData()
  }

  const entityFields = fields.filter((f) => f.entityType === activeEntity)

  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Campus Admin / Super Admin được cấu hình trường dữ liệu động.
        </p>
      }
    >
      <div className="space-y-6">
        {/* ===== Header ===== */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/settings"
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Quay lại Cài đặt Cơ sở
            </Link>
            <h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              <ListPlus className="h-7 w-7 text-primary" aria-hidden="true" />
              Trường dữ liệu động
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Thuộc tính riêng của cơ sở (VD: Cỡ giày, Nhóm máu...).
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm trường mới
          </button>
        </div>

        {isDemo && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Đang ở chế độ demo (chưa đăng nhập hoặc database trống).
          </p>
        )}

        {/* ===== Tabs entity ===== */}
        <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1.5">
          {CUSTOM_FIELD_ENTITIES.map((entity) => {
            const isActive = activeEntity === entity
            const count = fields.filter((f) => f.entityType === entity).length
            return (
              <button
                key={entity}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveEntity(entity)}
                className={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-indigo-50 hover:text-primary'
                }`}
              >
                {ENTITY_LABELS[entity]}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    isActive ? 'bg-white/20' : 'bg-indigo-50 text-primary'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* ===== Danh sách trường ===== */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải…
          </div>
        ) : entityFields.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Chưa có trường động nào cho {ENTITY_LABELS[activeEntity]}.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {entityFields.map((field) => (
              <li
                key={field.id}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {field.fieldLabel}
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                      {field.fieldName}
                    </code>
                    {field.isRequired && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                        Bắt buộc
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {FIELD_TYPE_LABELS[field.fieldType]}
                    {field.fieldType === 'select' && field.options.length > 0 && (
                      <> · Lựa chọn: {field.options.join(' / ')}</>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Sửa trường ${field.fieldLabel}`}
                    onClick={() => openEdit(field)}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Xóa trường ${field.fieldLabel}`}
                    onClick={() => handleDelete(field)}
                    disabled={deletingId === field.id}
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-rose-500 transition-colors duration-150 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === field.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ===== Modal thêm/sửa ===== */}
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Sửa trường động' : 'Thêm trường động'}
          >
            <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold">
                  {editing ? `Sửa trường "${editing.fieldLabel}"` : 'Thêm trường động mới'}
                </h2>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => setModalOpen(false)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="cf-entity"
                      className="mb-1.5 block text-sm font-semibold text-foreground"
                    >
                      Áp dụng cho
                    </label>
                    <select
                      id="cf-entity"
                      {...register('entityType')}
                      className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {CUSTOM_FIELD_ENTITIES.map((entity) => (
                        <option key={entity} value={entity}>
                          {ENTITY_LABELS[entity]}
                        </option>
                      ))}
                    </select>
                    <FieldError message={errors.entityType?.message} />
                  </div>
                  <div>
                    <label
                      htmlFor="cf-type"
                      className="mb-1.5 block text-sm font-semibold text-foreground"
                    >
                      Kiểu dữ liệu
                    </label>
                    <select
                      id="cf-type"
                      {...register('fieldType')}
                      className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {CUSTOM_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {FIELD_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <FieldError message={errors.fieldType?.message} />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cf-label"
                    className="mb-1.5 block text-sm font-semibold text-foreground"
                  >
                    Tên hiển thị
                  </label>
                  <input
                    id="cf-label"
                    type="text"
                    placeholder="VD: Cỡ giày"
                    {...register('fieldLabel')}
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <FieldError message={errors.fieldLabel?.message} />
                </div>

                <div>
                  <label
                    htmlFor="cf-name"
                    className="mb-1.5 block text-sm font-semibold text-foreground"
                  >
                    Tên biến (kỹ thuật)
                  </label>
                  <input
                    id="cf-name"
                    type="text"
                    placeholder="VD: shoe_size"
                    disabled={editing !== null}
                    {...register('fieldName')}
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <FieldError message={errors.fieldName?.message} />
                  {editing && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Không đổi tên biến khi sửa — dữ liệu đã lưu dùng key này.
                    </p>
                  )}
                </div>

                {watchedType === 'select' && (
                  <div>
                    <label
                      htmlFor="cf-options"
                      className="mb-1.5 block text-sm font-semibold text-foreground"
                    >
                      Danh sách lựa chọn (phân tách bằng dấu phẩy)
                    </label>
                    <input
                      id="cf-options"
                      type="text"
                      placeholder="VD: S, M, L, XL"
                      {...register('optionsText')}
                      className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <FieldError message={errors.optionsText?.message} />
                  </div>
                )}

                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background p-3.5 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    {...register('isRequired')}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-indigo-600"
                  />
                  Trường bắt buộc nhập
                </label>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : editing ? (
                      <Save className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                    {editing ? 'Cập nhật' : 'Thêm trường'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
