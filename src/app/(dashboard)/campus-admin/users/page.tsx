'use client'

import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { UserPlus, Users, X, Loader2, ShieldAlert } from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { createUserSchema } from '@/lib/validation/schemas'
import {
  createUserAccount,
  getManagedOrgs,
  getUsersInScope,
  type ManagedOrg,
  type StaffRow,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Quản lý Nhân sự - khu vực Campus Admin (/campus-admin/users)
// Middleware đã chặn route này: chỉ super_admin + campus_admin vào được.
// Danh sách nhân sự do RLS cắt theo subtree của user đang đăng nhập.
// ============================================================

const ROLE_LABELS: Record<string, string> = {
  campus_admin: 'Quản lý cơ sở',
  academic_staff: 'Giáo vụ',
  admission_staff: 'Tư vấn tuyển sinh',
  teacher: 'Giáo viên',
  student: 'Học viên',
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  campus_admin: 'bg-violet-50 text-violet-700',
  academic_staff: 'bg-sky-50 text-sky-700',
  admission_staff: 'bg-fuchsia-50 text-fuchsia-700',
  teacher: 'bg-amber-50 text-amber-700',
  student: 'bg-emerald-50 text-emerald-700',
}

/** Bộ lọc Role trên bảng (theo spec: Staff / Teacher / Student) */
const FILTER_ROLES = [
  { value: '', label: 'Tất cả vai trò' },
  { value: 'academic_staff', label: 'Giáo vụ (Staff)' },
  { value: 'admission_staff', label: 'Tư vấn tuyển sinh' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'student', label: 'Học viên' },
]

/** Role được phép gán trong form - KHÔNG BAO GIỜ có super_admin */
const ASSIGNABLE_ROLE_OPTIONS = [
  { value: 'campus_admin', label: 'Quản lý cơ sở (campus_admin)' },
  { value: 'academic_staff', label: 'Giáo vụ (academic_staff)' },
  { value: 'admission_staff', label: 'Tư vấn tuyển sinh (admission_staff)' },
  { value: 'teacher', label: 'Giáo viên (teacher)' },
  { value: 'student', label: 'Học viên (student)' },
]

/** Thông báo lỗi đỏ hiển thị NGAY dưới ô input sai */
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {message}
    </p>
  )
}

const fieldErrorClass = 'border-red-400 focus-visible:ring-red-400'

type CreateUserValues = z.infer<typeof createUserSchema>

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function CampusAdminUsersPage() {
  const [users, setUsers] = useState<StaffRow[]>([])
  const [orgs, setOrgs] = useState<ManagedOrg[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  const [roleFilter, setRoleFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  // react-hook-form + zodResolver: lỗi đỏ hiện ngay khi blur, trước khi Submit
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      fullName: '',
      role: 'teacher',
      orgId: '',
    },
  })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const result = await getUsersInScope({
      role: roleFilter || undefined,
      orgId: orgFilter || undefined,
    })
    setUsers(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [roleFilter, orgFilter])

  useEffect(() => {
    getManagedOrgs().then((result) => setOrgs(result.data))
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // Chỉ chạy khi client-side đã pass toàn bộ Zod (server vẫn validate lần 2)
  async function onValid(values: CreateUserValues) {
    setSubmitting(true)

    const formData = new FormData()
    formData.set('email', values.email)
    formData.set('password', values.password)
    formData.set('fullName', values.fullName)
    formData.set('role', values.role)
    formData.set('orgId', values.orgId)

    const result = await createUserAccount(formData)
    setSubmitting(false)

    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }

    setToast({ type: 'success', message: 'Đã tạo tài khoản nhân sự mới.' })
    reset()
    setFormOpen(false)
    loadUsers()
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Quản lý Nhân sự
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Thêm nhân sự mới
        </button>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {/* ===== Bộ lọc ===== */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="role-filter"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Vai trò
          </label>
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {FILTER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label
            htmlFor="org-filter"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Tổ chức / Chi nhánh
          </label>
          <select
            id="org-filter"
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Tất cả chi nhánh thuộc quyền</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Bảng nhân sự ===== */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {loading ? (
          <FunLoader label="Đang tải danh sách nhân sự…" />
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Không có nhân sự nào khớp bộ lọc hiện tại.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">Họ tên</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Vai trò</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tổ chức</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border last:border-b-0 hover:bg-indigo-50/30"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {user.full_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.email ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          ROLE_BADGE_CLASSES[user.role] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.org_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Modal Thêm nhân sự ===== */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
        >
          <button
            type="button"
            aria-label="Đóng form"
            onClick={() => setFormOpen(false)}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 id="add-user-title" className="font-heading text-xl font-bold">
                  Thêm nhân sự mới
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Quyền được kiểm tra lại phía server.
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng form"
                onClick={() => setFormOpen(false)}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
              <div>
                <label htmlFor="new-email" className="mb-1.5 block text-sm font-medium">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  id="new-email"
                  type="email"
                  autoComplete="off"
                  placeholder="nhansu@gdtx.edu.vn"
                  aria-invalid={!!errors.email}
                  className={`min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.email ? fieldErrorClass : ''}`}
                  {...register('email')}
                />
                <FieldError message={errors.email?.message} />
              </div>

              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium">
                  Mật khẩu khởi tạo <span className="text-destructive">*</span>
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Tối thiểu 8 ký tự"
                  aria-invalid={!!errors.password}
                  className={`min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.password ? fieldErrorClass : ''}`}
                  {...register('password')}
                />
                <FieldError message={errors.password?.message} />
              </div>

              <div>
                <label htmlFor="new-fullname" className="mb-1.5 block text-sm font-medium">
                  Họ tên <span className="text-destructive">*</span>
                </label>
                <input
                  id="new-fullname"
                  type="text"
                  placeholder="Nguyễn Văn A"
                  aria-invalid={!!errors.fullName}
                  className={`min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.fullName ? fieldErrorClass : ''}`}
                  {...register('fullName')}
                />
                <FieldError message={errors.fullName?.message} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="new-role" className="mb-1.5 block text-sm font-medium">
                    Vai trò <span className="text-destructive">*</span>
                  </label>
                  {/* KHÔNG có super_admin - server cũng chặn lần 2 */}
                  <select
                    id="new-role"
                    aria-invalid={!!errors.role}
                    className={`min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.role ? fieldErrorClass : ''}`}
                    {...register('role')}
                  >
                    {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <FieldError message={errors.role?.message} />
                </div>
                <div>
                  <label htmlFor="new-org" className="mb-1.5 block text-sm font-medium">
                    Chi nhánh <span className="text-destructive">*</span>
                  </label>
                  {/* Chỉ sổ ra chi nhánh THUỘC QUYỀN (RLS đã cắt danh sách) */}
                  <select
                    id="new-org"
                    aria-invalid={!!errors.orgId}
                    className={`min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.orgId ? fieldErrorClass : ''}`}
                    {...register('orgId')}
                  >
                    <option value="" disabled>
                      — Chọn chi nhánh —
                    </option>
                    {orgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <FieldError message={errors.orgId?.message} />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
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
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {submitting ? 'Đang tạo…' : 'Tạo tài khoản'}
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
