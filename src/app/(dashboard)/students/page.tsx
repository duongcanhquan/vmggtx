'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Eye, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
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
import {
  enrollStudentToClass,
  getEnrollmentPanel,
  type EnrollmentPanel,
} from './[id]/enrollment-actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { PageHeader } from '@/components/shared/PageHeader'

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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<StudentRow | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [enrollFor, setEnrollFor] = useState<StudentRow | null>(null)
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
    setLoadError(studentsResult.loadError ?? null)
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
                label: 'Gán lớp (ghi danh)',
                icon: BookOpen,
                onClick: () => setEnrollFor(row.original),
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
    <div className="space-y-3">
      <PageHeader
        title="Học sinh"
        actions={
          <>
            <SectionTabs
              tabs={[
                { label: 'Danh sách', href: '/students' },
                { label: 'Import', href: '/students/import' },
              ]}
            />
            <Link
              href="/students/import"
              className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Import
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Thêm
            </button>
          </>
        }
      />

      {loadError && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Không tải được danh sách: {loadError}
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

      {/* ===== Modal Gán lớp nhanh (ghi danh) ===== */}
      {enrollFor && (
        <QuickEnrollModal
          student={enrollFor}
          onClose={() => setEnrollFor(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setEnrollFor(null)
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

// ---------- Modal Gán lớp nhanh ngay từ danh sách học sinh ----------
function QuickEnrollModal({
  student,
  onClose,
  onSaved,
  onError,
}: {
  student: StudentRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [panel, setPanel] = useState<EnrollmentPanel | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState('')

  useEffect(() => {
    let cancelled = false
    getEnrollmentPanel(student.id).then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        onError(result.error)
        onClose()
        return
      }
      setPanel(result.panel)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  const activeClassIds = useMemo(
    () =>
      new Set(
        (panel?.enrollments ?? [])
          .filter((e) => e.status === 'active')
          .map((e) => e.classId)
      ),
    [panel]
  )

  async function submit() {
    if (!selectedClassId) {
      onError('Vui lòng chọn lớp để ghi danh.')
      return
    }
    setSaving(true)
    const result = await enrollStudentToClass(student.id, selectedClassId)
    setSaving(false)
    if (result.error !== undefined) {
      onError(result.error)
      return
    }
    const className =
      panel?.classes.find((c) => c.id === selectedClassId)?.name ?? 'lớp đã chọn'
    onSaved(`Đã ghi danh ${student.full_name} vào ${className}.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-enroll-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <div className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="quick-enroll-title" className="font-heading text-xl font-bold">
              Gán lớp (ghi danh)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{student.full_name}</span>
              {' — '}
              {student.org_name}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <FunLoader label="Đang tải danh sách lớp…" />
        ) : (
          <>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {(panel?.classes ?? []).length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  Cơ sở này chưa có lớp nào.
                </li>
              )}
              {(panel?.classes ?? []).map((cls) => {
                const already = activeClassIds.has(cls.id)
                const full =
                  cls.maxStudents !== null && cls.activeCount >= cls.maxStudents
                return (
                  <li key={cls.id}>
                    <label
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                        already || full
                          ? 'cursor-not-allowed opacity-55'
                          : 'cursor-pointer hover:bg-indigo-50/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="quick-enroll-class"
                        checked={selectedClassId === cls.id}
                        disabled={already || full}
                        onChange={() => setSelectedClassId(cls.id)}
                        className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-indigo-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {cls.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {cls.activeCount}
                          {cls.maxStudents !== null && `/${cls.maxStudents}`} học viên
                          {already && ' · ĐANG HỌC lớp này'}
                          {!already && full && ' · lớp đã đầy'}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving || !selectedClassId}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? 'Đang ghi danh…' : 'Ghi danh vào lớp'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
