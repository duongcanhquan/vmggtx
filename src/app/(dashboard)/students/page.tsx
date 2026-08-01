'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useOrgStore } from '@/lib/store/useOrgStore'
import {
  RowActions,
  SmartTable,
  sortableHeader,
} from '@/components/shared/SmartTable'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { SectionTabs } from '@/components/shared/SectionTabs'
import { StudentForm, type StudentFormValues } from '@/components/forms/StudentForm'
import { getCustomFields } from '@/app/(dashboard)/settings/custom-fields/actions'
import type { CustomFieldDef, CustomMetadata } from '@/lib/customFields'
import {
  createStudent,
  deleteStudent,
  getStudents,
  updateStudent,
  type StudentRow,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Quản lý Học sinh (/students) - SmartTable + StudentForm động.
// Dữ liệu lọc theo currentOrgId (Zustand) + toàn bộ chi nhánh con.
// Form thêm/sửa TỰ SINH các ô nhập theo org_custom_fields.
// ============================================================

const STATUS_BADGE: Record<StudentRow['status'], { label: string; className: string }> = {
  active: { label: 'Đang học', className: 'bg-emerald-50 text-emerald-700' },
  paused: { label: 'Bảo lưu', className: 'bg-amber-50 text-amber-700' },
}

export default function StudentsPage() {
  const router = useRouter()
  const currentOrgId = useOrgStore((state) => state.currentOrgId)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<StudentRow | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [studentsResult, fieldsResult] = await Promise.all([
      getStudents(currentOrgId),
      currentOrgId
        ? getCustomFields(currentOrgId, 'student')
        : Promise.resolve({ data: [] as CustomFieldDef[], demo: true }),
    ])
    setStudents(studentsResult.data)
    setIsDemo(studentsResult.demo)
    setCustomFields(fieldsResult.data)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(student: StudentRow) {
    setEditing(student)
    setModalOpen(true)
  }

  async function handleSubmit(values: StudentFormValues) {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cơ sở ở góc trên bên phải.' })
      return
    }
    setSaving(true)
    const result = editing
      ? await updateStudent(editing.id, values)
      : await createStudent(currentOrgId, values)
    setSaving(false)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: editing
        ? `Đã cập nhật hồ sơ ${values.fullName}.`
        : `Đã thêm học sinh ${values.fullName}.`,
    })
    setModalOpen(false)
    loadData()
  }

  const handleDelete = useCallback(
    async (student: StudentRow) => {
      const confirmed = window.confirm(
        `Xóa hồ sơ "${student.full_name}"? Hồ sơ được XÓA MỀM (khôi phục được từ database).\nYêu cầu quyền Quản lý cơ sở.`
      )
      if (!confirmed) return
      const result = await deleteStudent(student.id)
      if (result.error !== undefined) {
        setToast({ type: 'error', message: result.error })
        return
      }
      setToast({ type: 'success', message: `Đã xóa hồ sơ ${student.full_name}.` })
      void loadData()
    },
    [loadData]
  )

  const columns = useMemo<ColumnDef<StudentRow>[]>(
    () => [
      {
        accessorKey: 'code',
        meta: { label: 'Mã HV' },
        header: sortableHeader<StudentRow>('Mã HV'),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-indigo-700">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: 'full_name',
        meta: { label: 'Họ tên' },
        header: sortableHeader<StudentRow>('Họ tên'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.full_name}</p>
            {row.original.email && (
              <p className="text-xs text-muted-foreground">{row.original.email}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'org_name',
        meta: { label: 'Cơ sở' },
        header: sortableHeader<StudentRow>('Cơ sở'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.org_name}</span>
        ),
      },
      {
        accessorKey: 'status',
        meta: { label: 'Trạng thái' },
        header: 'Trạng thái',
        cell: ({ row }) => {
          const badge = STATUS_BADGE[row.original.status]
          return (
            <span
              className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
          )
        },
      },
      {
        id: 'actions',
        enableHiding: false,
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: 'Hồ sơ 360°',
                icon: Eye,
                onClick: () => router.push(`/students/${row.original.id}`),
              },
              {
                label: 'Sửa hồ sơ',
                icon: Pencil,
                onClick: () => openEdit(row.original),
              },
              {
                label: 'Xóa (xóa mềm)',
                icon: Trash2,
                variant: 'destructive',
                onClick: () => void handleDelete(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [handleDelete, router]
  )

  return (
    <div className="space-y-6">
      {/* ===== Header + Tabs mục "Học sinh" ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Quản lý Học sinh
          </h1>
          <SectionTabs
            tabs={[
              { label: 'Danh sách học sinh', href: '/students' },
              { label: 'Import Excel/CSV', href: '/students/import' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/students/import"
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Import từ Excel
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm học sinh
          </button>
        </div>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {/* ===== SmartTable ===== */}
      {loading ? (
        <FunLoader label="Đang tải danh sách học viên…" />
      ) : (
        <SmartTable
          columns={columns}
          data={students}
          searchKey="full_name"
          searchPlaceholder="Tìm theo họ tên…"
          emptyMessage="Chưa có học viên nào trong phạm vi này."
          viewKey="students_page_view"
        />
      )}

      {/* ===== Modal Thêm/Sửa học sinh (StudentForm động) ===== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Sửa hồ sơ học sinh' : 'Thêm học sinh mới'}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold">
                  {editing ? `Sửa hồ sơ ${editing.full_name}` : 'Thêm học sinh mới'}
                </h2>
                {customFields.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Gồm {customFields.length} trường riêng của cơ sở.
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setModalOpen(false)}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <StudentForm
              key={editing?.id ?? 'create'}
              mode={editing ? 'edit' : 'create'}
              customFields={customFields}
              defaultValues={
                editing
                  ? {
                      fullName: editing.full_name,
                      phone: editing.phone ?? '',
                      custom: editing.custom_metadata as CustomMetadata,
                    }
                  : undefined
              }
              submitting={saving}
              onSubmit={handleSubmit}
              onCancel={() => setModalOpen(false)}
            />
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
