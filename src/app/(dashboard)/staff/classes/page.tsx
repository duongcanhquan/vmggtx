'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen,
  CalendarPlus,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { getTeachersInOrg } from '@/app/(dashboard)/classes/actions'
import {
  createClassAsStaff,
  deleteClassAsStaff,
  getStaffClasses,
  getStaffContext,
  scheduleSession,
  updateClassAsStaff,
  type StaffClassRow,
  type StaffContext,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Vận hành - Giáo vụ (/staff/classes)
// Middleware: chỉ super_admin / campus_admin / academic_staff vào được.
// Điểm cốt lõi: trường "Chi nhánh" trên form BỊ KHÓA CỨNG theo org
// của Staff; server thậm chí không đọc org_id từ form.
// ============================================================

const MOCK_TEACHERS = [
  { id: 'mock-t1', full_name: 'Phạm Quang Huy' },
  { id: 'mock-t2', full_name: 'Lê Minh Anh' },
]

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; cls: StaffClassRow }
type ScheduleTarget = StaffClassRow | null

export default function StaffClassesPage() {
  const [context, setContext] = useState<StaffContext | null>(null)
  const [classes, setClasses] = useState<StaffClassRow[]>([])
  const [teachers, setTeachers] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' })
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadClasses = useCallback(async () => {
    setLoading(true)
    const result = await getStaffClasses()
    setClasses(result.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    getStaffContext().then(async (ctx) => {
      setContext(ctx)
      if (ctx.demo) {
        setTeachers(MOCK_TEACHERS)
      } else {
        const result = await getTeachersInOrg(ctx.orgId)
        setTeachers(result.data.length > 0 ? result.data : MOCK_TEACHERS)
      }
    })
    loadClasses()
  }, [loadClasses])

  async function handleClassSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const result =
      formMode.kind === 'edit'
        ? await updateClassAsStaff(formData)
        : await createClassAsStaff(formData)

    setSubmitting(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: formMode.kind === 'edit' ? 'Đã cập nhật lớp học.' : 'Đã tạo lớp học mới.',
    })
    setFormMode({ kind: 'closed' })
    loadClasses()
  }

  async function handleScheduleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    const result = await scheduleSession(new FormData(event.currentTarget))
    setSubmitting(false)

    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã thêm buổi học vào thời khóa biểu.' })
    setScheduleTarget(null)
    loadClasses()
  }

  async function handleDelete(cls: StaffClassRow) {
    const confirmed = window.confirm(
      `Xóa lớp "${cls.name}"? Lớp sẽ được xóa mềm (có thể khôi phục từ database).`
    )
    if (!confirmed) return

    // [UX] Chặn double-click xóa 2 lần: disable nút trong lúc gửi
    setDeletingId(cls.id)
    const result = await deleteClassAsStaff(cls.id)
    setDeletingId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa lớp "${cls.name}".` })
    loadClasses()
  }

  const editingClass = formMode.kind === 'edit' ? formMode.cls : null

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Vận hành Lớp học
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setFormMode({ kind: 'create' })}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm lớp học
        </button>
      </div>

      {/* ===== Phạm vi bị khóa theo chi nhánh của Staff ===== */}
      {context && (
        <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          <p className="text-sm text-indigo-900">
            Phạm vi thao tác:{' '}
            <span className="font-semibold">{context.orgName}</span>
            {context.demo && (
              <span className="ml-1 text-indigo-600">(dữ liệu demo)</span>
            )}
          </p>
        </div>
      )}

      {/* ===== Bảng lớp học ===== */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {loading ? (
          <FunLoader label="Đang tải danh sách lớp…" />
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Chi nhánh chưa có lớp học nào.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">Tên lớp</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Giáo viên</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Bắt đầu</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Kết thúc</th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold">Số buổi</th>
                  <th scope="col" className="px-4 py-3 text-center font-semibold">Sĩ số tối đa</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr
                    key={cls.id}
                    className="border-b border-border last:border-b-0 hover:bg-indigo-50/30"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{cls.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{cls.teacher_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(cls.start_date)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(cls.end_date)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {cls.session_count}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {cls.max_students ? (
                        <span className="inline-flex rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          {cls.max_students} HV
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Không giới hạn</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          title="Xếp thời khóa biểu"
                          aria-label={`Xếp lịch cho lớp ${cls.name}`}
                          onClick={() => setScheduleTarget(cls)}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-indigo-600 transition-colors duration-150 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          title="Sửa lớp"
                          aria-label={`Sửa lớp ${cls.name}`}
                          onClick={() => setFormMode({ kind: 'edit', cls })}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-amber-600 transition-colors duration-150 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          title="Xóa lớp (xóa mềm)"
                          aria-label={`Xóa lớp ${cls.name}`}
                          onClick={() => handleDelete(cls)}
                          disabled={deletingId === cls.id}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-rose-600 transition-colors duration-150 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === cls.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Modal Thêm/Sửa lớp ===== */}
      {formMode.kind !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="class-form-title"
        >
          <button
            type="button"
            aria-label="Đóng form"
            onClick={() => setFormMode({ kind: 'closed' })}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="class-form-title" className="font-heading text-xl font-bold">
                {editingClass ? `Sửa lớp: ${editingClass.name}` : 'Thêm lớp học mới'}
              </h2>
              <button
                type="button"
                aria-label="Đóng form"
                onClick={() => setFormMode({ kind: 'closed' })}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleClassSubmit} className="space-y-4">
              {editingClass && (
                <input type="hidden" name="classId" value={editingClass.id} />
              )}

              {/* Chi nhánh: HIỂN THỊ nhưng KHÓA - server tự lấy từ profile */}
              <div>
                <label htmlFor="cls-org" className="mb-1.5 block text-sm font-medium">
                  Chi nhánh
                </label>
                <div className="relative">
                  <input
                    id="cls-org"
                    type="text"
                    value={context?.orgName ?? 'Đang tải…'}
                    disabled
                    aria-describedby="cls-org-note"
                    className="min-h-11 w-full cursor-not-allowed rounded-xl border border-border bg-indigo-50/60 px-3 pr-10 text-sm text-muted-foreground"
                  />
                  <Lock
                    className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500"
                    aria-hidden="true"
                  />
                </div>
                <p id="cls-org-note" className="mt-1 text-xs text-muted-foreground">
                  Khóa theo chi nhánh của bạn.
                </p>
              </div>

              <div>
                <label htmlFor="cls-name" className="mb-1.5 block text-sm font-medium">
                  Tên lớp <span className="text-destructive">*</span>
                </label>
                <input
                  id="cls-name"
                  name="name"
                  type="text"
                  required
                  defaultValue={editingClass?.name ?? ''}
                  placeholder="VD: Toán 12A"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label htmlFor="cls-teacher" className="mb-1.5 block text-sm font-medium">
                  Giáo viên phụ trách
                </label>
                <select
                  id="cls-teacher"
                  name="teacherId"
                  defaultValue={editingClass?.teacher_id ?? ''}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Chưa gán —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cls-max" className="mb-1.5 block text-sm font-medium">
                  Sĩ số tối đa
                </label>
                <input
                  id="cls-max"
                  name="maxStudents"
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={editingClass?.max_students ?? ''}
                  placeholder="Để trống = không giới hạn"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Khi lớp đủ sĩ số, hệ thống tự chặn ghi danh thêm học viên.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cls-start" className="mb-1.5 block text-sm font-medium">
                    Ngày bắt đầu
                  </label>
                  <input
                    id="cls-start"
                    name="startDate"
                    type="date"
                    defaultValue={editingClass?.start_date ?? ''}
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor="cls-end" className="mb-1.5 block text-sm font-medium">
                    Ngày kết thúc
                  </label>
                  <input
                    id="cls-end"
                    name="endDate"
                    type="date"
                    defaultValue={editingClass?.end_date ?? ''}
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setFormMode({ kind: 'closed' })}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : editingClass ? (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {editingClass ? 'Lưu thay đổi' : 'Tạo lớp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal Xếp thời khóa biểu ===== */}
      {scheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-form-title"
        >
          <button
            type="button"
            aria-label="Đóng form"
            onClick={() => setScheduleTarget(null)}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="schedule-form-title" className="font-heading text-xl font-bold">
                Xếp lịch: {scheduleTarget.name}
              </h2>
              <button
                type="button"
                aria-label="Đóng form"
                onClick={() => setScheduleTarget(null)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <input type="hidden" name="classId" value={scheduleTarget.id} />

              <div>
                <label htmlFor="ss-teacher" className="mb-1.5 block text-sm font-medium">
                  Giáo viên dạy buổi này
                </label>
                <select
                  id="ss-teacher"
                  name="teacherId"
                  defaultValue={scheduleTarget.teacher_id ?? ''}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Chưa gán —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ss-date" className="mb-1.5 block text-sm font-medium">
                    Ngày học <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="ss-date"
                    name="date"
                    type="date"
                    required
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor="ss-room" className="mb-1.5 block text-sm font-medium">
                    Phòng học
                  </label>
                  <input
                    id="ss-room"
                    name="room"
                    type="text"
                    placeholder="VD: P.301"
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ss-start" className="mb-1.5 block text-sm font-medium">
                    Giờ bắt đầu <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="ss-start"
                    name="startTime"
                    type="time"
                    required
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label htmlFor="ss-end" className="mb-1.5 block text-sm font-medium">
                    Giờ kết thúc <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="ss-end"
                    name="endTime"
                    type="time"
                    required
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setScheduleTarget(null)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Thêm buổi học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
