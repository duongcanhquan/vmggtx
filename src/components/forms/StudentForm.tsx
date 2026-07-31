'use client'

import { useMemo } from 'react'
import { useForm, type FieldErrors, type Path, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import {
  buildCustomMetadataSchema,
  type CustomFieldDef,
  type CustomMetadata,
} from '@/lib/customFields'
import { studentCreateSchema, studentUpdateSchema } from '@/lib/validation/schemas'

// ============================================================
// StudentForm - DYNAMIC FORM GENERATION.
//
// Ngoài các trường cố định (Họ tên, Email...), form TỰ ĐỘNG SINH
// GIAO DIỆN cho các trường động mà cơ sở đã định nghĩa trong
// org_custom_fields (input/select/checkbox/date/number theo
// field_type, bắt buộc theo is_required).
//
// Khi submit, giá trị động được gom thành object `custom` -> Server
// Action lưu vào cột profiles.custom_metadata (jsonb).
// ============================================================

export type StudentFormValues = {
  fullName: string
  email?: string
  password?: string
  phone?: string
  custom: CustomMetadata
}

interface StudentFormProps {
  /** 'create' = có Email + Mật khẩu; 'edit' = chỉ sửa hồ sơ */
  mode: 'create' | 'edit'
  /** Định nghĩa trường động của org (entity 'student') */
  customFields: CustomFieldDef[]
  defaultValues?: Partial<StudentFormValues>
  submitting: boolean
  onSubmit: (values: StudentFormValues) => void
  onCancel: () => void
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
      {message}
    </p>
  )
}

const INPUT_CLASS =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function StudentForm({
  mode,
  customFields,
  defaultValues,
  submitting,
  onSubmit,
  onCancel,
}: StudentFormProps) {
  // Schema HOÀN CHỈNH = phần cố định (theo mode) + phần động sinh
  // từ định nghĩa của org. Đổi cấu hình -> luật validate tự đổi theo.
  const schema = useMemo(() => {
    const base = mode === 'create' ? studentCreateSchema : studentUpdateSchema
    return base.extend({ custom: buildCustomMetadataSchema(customFields) })
  }, [mode, customFields])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<StudentFormValues>,
    defaultValues: {
      fullName: defaultValues?.fullName ?? '',
      email: defaultValues?.email ?? '',
      password: '',
      phone: defaultValues?.phone ?? '',
      custom: defaultValues?.custom ?? {},
    },
  })

  const customErrors = (errors.custom ?? {}) as FieldErrors<Record<string, unknown>>

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values as StudentFormValues))}
      className="space-y-3.5"
      noValidate
    >
      {/* ===== Trường CỐ ĐỊNH ===== */}
      <div>
        <label htmlFor="sf-name" className="mb-1.5 block text-sm font-semibold text-foreground">
          Họ tên <span className="text-rose-500">*</span>
        </label>
        <input
          id="sf-name"
          type="text"
          placeholder="VD: Nguyễn Văn A"
          {...register('fullName')}
          className={INPUT_CLASS}
        />
        <FieldError message={errors.fullName?.message} />
      </div>

      {mode === 'create' && (
        <>
          <div>
            <label
              htmlFor="sf-email"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Email <span className="text-rose-500">*</span>
            </label>
            <input
              id="sf-email"
              type="email"
              placeholder="hocsinh@gdtx.edu.vn"
              {...register('email')}
              className={INPUT_CLASS}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <label
              htmlFor="sf-password"
              className="mb-1.5 block text-sm font-semibold text-foreground"
            >
              Mật khẩu khởi tạo <span className="text-rose-500">*</span>
            </label>
            <input
              id="sf-password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              className={INPUT_CLASS}
            />
            <FieldError message={errors.password?.message} />
          </div>
        </>
      )}

      <div>
        <label htmlFor="sf-phone" className="mb-1.5 block text-sm font-semibold text-foreground">
          Số điện thoại
        </label>
        <input
          id="sf-phone"
          type="tel"
          placeholder="0xxxxxxxxx"
          {...register('phone')}
          className={INPUT_CLASS}
        />
        <FieldError message={errors.phone?.message} />
      </div>

      {/* ===== Trường ĐỘNG - tự sinh theo org_custom_fields ===== */}
      {customFields.length > 0 && (
        <fieldset className="space-y-3.5 rounded-xl border border-dashed border-border p-3.5">
          <legend className="px-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Thông tin riêng của cơ sở
          </legend>

          {customFields.map((field) => {
            const name = `custom.${field.fieldName}` as Path<StudentFormValues>
            const inputId = `sf-cf-${field.fieldName}`
            const errorMessage = customErrors[field.fieldName]?.message as
              | string
              | undefined

            // Checkbox: layout riêng (label nằm cạnh ô tick)
            if (field.fieldType === 'boolean') {
              return (
                <div key={field.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background p-3 text-sm font-medium text-foreground">
                    <input
                      id={inputId}
                      type="checkbox"
                      {...register(name)}
                      className="h-4 w-4 cursor-pointer rounded border-border accent-indigo-600"
                    />
                    {field.fieldLabel}
                  </label>
                  <FieldError message={errorMessage} />
                </div>
              )
            }

            return (
              <div key={field.id}>
                <label
                  htmlFor={inputId}
                  className="mb-1.5 block text-sm font-semibold text-foreground"
                >
                  {field.fieldLabel}{' '}
                  {field.isRequired && <span className="text-rose-500">*</span>}
                </label>

                {field.fieldType === 'select' ? (
                  <select
                    id={inputId}
                    {...register(name)}
                    className={`${INPUT_CLASS} cursor-pointer`}
                  >
                    <option value="">-- Chọn {field.fieldLabel} --</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    type={
                      field.fieldType === 'number'
                        ? 'number'
                        : field.fieldType === 'date'
                          ? 'date'
                          : 'text'
                    }
                    step={field.fieldType === 'number' ? 'any' : undefined}
                    {...register(name)}
                    className={INPUT_CLASS}
                  />
                )}
                <FieldError message={errorMessage} />
              </div>
            )
          })}
        </fieldset>
      )}

      {/* ===== Nút hành động ===== */}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {mode === 'create' ? 'Thêm học sinh' : 'Lưu hồ sơ'}
        </button>
      </div>
    </form>
  )
}
