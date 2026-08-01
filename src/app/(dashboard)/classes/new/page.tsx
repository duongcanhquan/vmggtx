'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { ArrowLeft, Loader2, Building2, Plus } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { findOrgNode } from '@/lib/utils/org-tree'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { classFormSchema } from '@/lib/validation/schemas'
import { createClass, getActiveSubjects, getTeachersInOrg } from '../actions'

// Mock cho demo khi DB chưa có dữ liệu
const MOCK_SUBJECTS = [
  { id: 'sub-toan', name: 'Toán' },
  { id: 'sub-van', name: 'Ngữ văn' },
  { id: 'sub-anh', name: 'Tiếng Anh' },
]
const MOCK_TEACHERS = [
  { id: 'gv-001', full_name: 'Nguyễn Thị Hoa' },
  { id: 'gv-002', full_name: 'Phạm Văn Long' },
]

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base text-foreground shadow-sm transition-colors duration-200 placeholder:text-slate-400 hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm'
const inputErrorClass =
  'border-red-400 hover:border-red-500 focus-visible:ring-red-400'

/** Thông báo lỗi đỏ hiển thị NGAY dưới ô input sai */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

type FormInput = z.input<typeof classFormSchema>
type FormOutput = z.output<typeof classFormSchema>

export default function NewClassPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const orgTree = useOrgStore((state) => state.orgTree)
  const currentOrg = currentOrgId ? findOrgNode(orgTree, currentOrgId) : null

  const [subjects, setSubjects] = useState(MOCK_SUBJECTS)
  const [teachers, setTeachers] = useState(MOCK_TEACHERS)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [isPending, startTransition] = useTransition()

  // react-hook-form + zodResolver: lỗi hiện ngay khi blur, TRƯỚC KHI bấm Submit
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(classFormSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      subjectId: '',
      teacherId: '',
      startDate: '',
      endDate: '',
      maxStudents: '',
    },
  })

  // Nạp môn học active + giáo viên thuộc subtree của org đang chọn
  useEffect(() => {
    let cancelled = false
    getActiveSubjects().then((result) => {
      if (!cancelled && result.data.length > 0) setSubjects(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentOrgId) return
    let cancelled = false
    getTeachersInOrg(currentOrgId).then((result) => {
      if (!cancelled && result.data.length > 0) setTeachers(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [currentOrgId])

  // Chỉ chạy khi client-side đã pass toàn bộ Zod
  const onValid = (values: FormOutput) => {
    setToast(null)
    const formData = new FormData()
    formData.set('name', values.name)
    formData.set('subjectId', values.subjectId)
    formData.set('teacherId', values.teacherId ?? '')
    formData.set('startDate', values.startDate ?? '')
    formData.set('endDate', values.endDate ?? '')
    formData.set('maxStudents', values.maxStudents ?? '')
    // orgId nhúng ngầm từ Zustand store - user KHÔNG chọn org trong form
    formData.set('orgId', currentOrgId ?? '')

    startTransition(async () => {
      const result = await createClass(formData)
      if (result?.error) {
        setToast({ type: 'error', message: result.error })
      }
      // Thành công: Server Action tự revalidatePath + redirect về /classes
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/classes"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại danh sách
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Tạo lớp mới
        </h1>
      </div>

      {!currentOrgId && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <Building2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            Chưa chọn cấp quản lý — hãy chọn ở góc trên bên phải.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onValid)}
        noValidate
        className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        {currentOrg && (
          <p className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-sm text-primary">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Lớp sẽ thuộc đơn vị:{' '}
            <span className="font-semibold">{currentOrg.name}</span>
          </p>
        )}

        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Tên lớp <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            type="text"
            placeholder="VD: Toán 12A - Ca tối"
            aria-invalid={!!errors.name}
            className={`${inputClass} ${errors.name ? inputErrorClass : ''}`}
            {...register('name')}
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div>
          <label htmlFor="subjectId" className="mb-1.5 block text-sm font-medium">
            Môn học <span className="text-destructive" aria-hidden="true">*</span>
          </label>
          <select
            id="subjectId"
            aria-invalid={!!errors.subjectId}
            className={`${inputClass} cursor-pointer ${errors.subjectId ? inputErrorClass : ''}`}
            {...register('subjectId')}
          >
            <option value="">-- Chọn môn học --</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.subjectId?.message} />
        </div>

        <div>
          <label htmlFor="teacherId" className="mb-1.5 block text-sm font-medium">
            Giáo viên
          </label>
          <select
            id="teacherId"
            className={`${inputClass} cursor-pointer`}
            {...register('teacherId')}
          >
            <option value="">-- Chưa phân công --</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="maxStudents" className="mb-1.5 block text-sm font-medium">
            Sĩ số tối đa
          </label>
          <input
            id="maxStudents"
            type="number"
            min={1}
            max={500}
            placeholder="Để trống = không giới hạn"
            aria-invalid={!!errors.maxStudents}
            className={`${inputClass} ${errors.maxStudents ? inputErrorClass : ''}`}
            {...register('maxStudents')}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Khi lớp đủ sĩ số, hệ thống tự chặn ghi danh thêm học viên.
          </p>
          <FieldError message={errors.maxStudents?.message} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className="mb-1.5 block text-sm font-medium">
              Ngày bắt đầu
            </label>
            <input
              id="startDate"
              type="date"
              aria-invalid={!!errors.startDate}
              className={`${inputClass} ${errors.startDate ? inputErrorClass : ''}`}
              {...register('startDate')}
            />
            <FieldError message={errors.startDate?.message} />
          </div>
          <div>
            <label htmlFor="endDate" className="mb-1.5 block text-sm font-medium">
              Ngày kết thúc
            </label>
            <input
              id="endDate"
              type="date"
              aria-invalid={!!errors.endDate}
              className={`${inputClass} ${errors.endDate ? inputErrorClass : ''}`}
              {...register('endDate')}
            />
            <FieldError message={errors.endDate?.message} />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || !currentOrgId}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          {isPending ? 'Đang kiểm tra & tạo lớp...' : 'Tạo lớp học'}
        </button>
      </form>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
