'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import {
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { OrgStaffTabs } from '@/components/campus-admin/OrgStaffTabs'
import { createUserSchema } from '@/lib/validation/schemas'
import { MENU_SECTIONS, type MenuKey } from '@/lib/auth/menuRegistry'
import {
  createUserAccount,
  deleteUserAccount,
  getManagedOrgs,
  getUserGrants,
  getUsersInScope,
  resetUserPassword,
  saveUserGrants,
  updateUserAccount,
  type ManagedOrg,
  type StaffRow,
  type UserGrantData,
} from './actions'
import { listJobTitlesForOrg } from '../job-titles/actions'
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
  accountant: 'Kế toán',
  teacher: 'Giáo viên',
  student: 'Học viên',
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  campus_admin: 'bg-violet-50 text-violet-700',
  academic_staff: 'bg-sky-50 text-sky-700',
  admission_staff: 'bg-fuchsia-50 text-fuchsia-700',
  accountant: 'bg-teal-50 text-teal-700',
  teacher: 'bg-amber-50 text-amber-700',
  student: 'bg-emerald-50 text-emerald-700',
}

/** Bộ lọc Role trên bảng */
const FILTER_ROLES = [
  { value: '', label: 'Tất cả vai trò' },
  { value: 'campus_admin', label: 'Quản lý cơ sở' },
  { value: 'academic_staff', label: 'Giáo vụ (Staff)' },
  { value: 'admission_staff', label: 'Tư vấn tuyển sinh' },
  { value: 'accountant', label: 'Kế toán' },
  { value: 'teacher', label: 'Giáo viên' },
]

/** Role được phép gán trong form - KHÔNG BAO GIỜ có super_admin / student */
const ASSIGNABLE_ROLE_OPTIONS = [
  { value: 'campus_admin', label: 'Quản lý cơ sở (campus_admin)' },
  { value: 'academic_staff', label: 'Giáo vụ (academic_staff)' },
  { value: 'admission_staff', label: 'Tư vấn tuyển sinh (admission_staff)' },
  { value: 'accountant', label: 'Kế toán (accountant)' },
  { value: 'teacher', label: 'Giáo viên (teacher)' },
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

// z.input: phone có .default('') nên là optional ở ĐẦU VÀO form
type CreateUserValues = z.input<typeof createUserSchema>

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
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // Debounce ô tìm kiếm 300ms để không dội query theo từng phím
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Sửa / cấp lại mật khẩu / xóa tài khoản / gán quyền kiêm nhiệm
  const [editUser, setEditUser] = useState<StaffRow | null>(null)
  const [resetUser, setResetUser] = useState<StaffRow | null>(null)
  const [grantUser, setGrantUser] = useState<StaffRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
      phone: '',
    },
  })

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const result = await getUsersInScope({
      role: roleFilter || undefined,
      orgId: orgFilter || undefined,
      search: search || undefined,
    })
    setUsers(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [roleFilter, orgFilter, search])

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
    formData.set('phone', values.phone ?? '')

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

  async function handleDeleteUser(user: StaffRow) {
    const confirmed = window.confirm(
      `Xóa tài khoản "${user.full_name}"?\nHồ sơ được XÓA MỀM và tài khoản bị KHÓA đăng nhập.`
    )
    if (!confirmed) return
    setDeletingId(user.id)
    const result = await deleteUserAccount(user.id)
    setDeletingId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa tài khoản ${user.full_name}.` })
    loadUsers()
  }

  return (
    <div className="space-y-6">
      {/* ===== Header: Tổ chức nhân sự ===== */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Tổ chức nhân sự
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Quản lý cơ sở là cấp cao nhất trong cơ sở: setup tài khoản và phân quyền truy cập
              từng phần cho thành viên. Học viên quản lý tại{' '}
              <Link
                href="/students"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Học sinh
              </Link>
              .
            </p>
          </div>
          <OrgStaffTabs />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-foreground">Tài khoản & Nhân viên</h2>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Thêm nhân sự mới
          </button>
        </div>
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
            htmlFor="user-search"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Tìm kiếm
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tên hoặc email…"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
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
                  <th scope="col" className="px-4 py-3 font-semibold">SĐT</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Vai trò</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Chức danh</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tổ chức</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Ngày tạo</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Thao tác</th>
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.phone ?? '—'}
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.job_title_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.org_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {user.role !== 'super_admin' && (
                        <div className="flex justify-end gap-1.5">
                          {user.role !== 'student' && (
                            <button
                              type="button"
                              title="Gán quyền kiêm nhiệm"
                              aria-label={`Gán quyền cho ${user.full_name}`}
                              onClick={() => setGrantUser(user)}
                              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-emerald-600 transition-colors duration-150 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Sửa tài khoản"
                            aria-label={`Sửa tài khoản ${user.full_name}`}
                            onClick={() => setEditUser(user)}
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-amber-600 transition-colors duration-150 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Cấp lại mật khẩu"
                            aria-label={`Cấp lại mật khẩu cho ${user.full_name}`}
                            onClick={() => setResetUser(user)}
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-indigo-600 transition-colors duration-150 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Xóa tài khoản (xóa mềm + khóa đăng nhập)"
                            aria-label={`Xóa tài khoản ${user.full_name}`}
                            onClick={() => void handleDeleteUser(user)}
                            disabled={deletingId === user.id}
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-rose-600 transition-colors duration-150 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === user.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      )}
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

              <div>
                <label htmlFor="new-phone" className="mb-1.5 block text-sm font-medium">
                  Số điện thoại (tùy chọn)
                </label>
                <input
                  id="new-phone"
                  type="tel"
                  placeholder="VD: 0912345678"
                  aria-invalid={!!errors.phone}
                  className={`min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${errors.phone ? fieldErrorClass : ''}`}
                  {...register('phone')}
                />
                <FieldError message={errors.phone?.message} />
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

      {/* ===== Modal Sửa tài khoản ===== */}
      {editUser && (
        <EditUserModal
          user={editUser}
          orgs={orgs}
          onClose={() => setEditUser(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setEditUser(null)
            loadUsers()
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {/* ===== Modal Cấp lại mật khẩu ===== */}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setResetUser(null)
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {/* ===== Modal Gán quyền kiêm nhiệm ===== */}
      {grantUser && (
        <GrantsModal
          user={grantUser}
          onClose={() => setGrantUser(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setGrantUser(null)
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

// ---------- Modal Sửa tài khoản ----------
function EditUserModal({
  user,
  orgs,
  onClose,
  onSaved,
  onError,
}: {
  user: StaffRow
  orgs: ManagedOrg[]
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [fullName, setFullName] = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [role, setRole] = useState(user.role)
  const [orgId, setOrgId] = useState(user.org_id ?? '')
  const [jobTitleId, setJobTitleId] = useState(user.job_title_id ?? '')
  const [canViewFinancials, setCanViewFinancials] = useState(
    user.role === 'campus_admin' || user.can_view_financials
  )
  const [titles, setTitles] = useState<
    { id: string; name: string; suggested_role: string | null }[]
  >([])
  const [titlesLoading, setTitlesLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) {
      setTitles([])
      return
    }
    let cancelled = false
    setTitlesLoading(true)
    listJobTitlesForOrg(orgId).then((res) => {
      if (cancelled) return
      setTitlesLoading(false)
      if (res.error) {
        setTitles([])
        return
      }
      setTitles(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const formData = new FormData()
    formData.set('userId', user.id)
    formData.set('fullName', fullName)
    formData.set('role', role)
    formData.set('orgId', orgId)
    formData.set('phone', phone)
    formData.set('jobTitleId', jobTitleId)
    formData.set(
      'canViewFinancials',
      role === 'campus_admin' || canViewFinancials ? 'true' : 'false'
    )
    const result = await updateUserAccount(formData)
    setSaving(false)
    if (result.error) {
      onError(result.error)
      return
    }
    onSaved(`Đã cập nhật tài khoản ${fullName}.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="edit-user-title" className="font-heading text-xl font-bold">
            Sửa tài khoản: {user.full_name}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {(role === 'teacher' || user.role === 'teacher') && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-900">
              Ngành / môn giảng dạy gán tại{' '}
              <Link
                href="/teachers"
                className="font-semibold underline underline-offset-2"
              >
                Hồ sơ Giảng viên
              </Link>
              . Chức danh chỉ là mẫu phân quyền menu.
            </div>
          )}
          <div>
            <label htmlFor="edit-fullname" className="mb-1.5 block text-sm font-medium">
              Họ tên <span className="text-destructive">*</span>
            </label>
            <input
              id="edit-fullname"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="edit-phone" className="mb-1.5 block text-sm font-medium">
              Số điện thoại
            </label>
            <input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="VD: 0912345678"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-role" className="mb-1.5 block text-sm font-medium">
                Vai trò <span className="text-destructive">*</span>
              </label>
              <select
                id="edit-role"
                value={role}
                onChange={(e) => {
                  const next = e.target.value
                  setRole(next)
                  if (next === 'campus_admin') setCanViewFinancials(true)
                }}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ASSIGNABLE_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-org" className="mb-1.5 block text-sm font-medium">
                Chi nhánh <span className="text-destructive">*</span>
              </label>
              <select
                id="edit-org"
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value)
                  setJobTitleId('')
                }}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            </div>
          </div>

          {role !== 'student' && (
            <div>
              <label htmlFor="edit-job-title" className="mb-1.5 block text-sm font-medium">
                Chức danh (mẫu quyền)
              </label>
              <select
                id="edit-job-title"
                value={jobTitleId}
                onChange={(e) => setJobTitleId(e.target.value)}
                disabled={titlesLoading}
                className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <option value="">— Không gắn chức danh —</option>
                {user.job_title_id &&
                  user.job_title_name &&
                  !titles.some((t) => t.id === user.job_title_id) && (
                    <option value={user.job_title_id}>{user.job_title_name} (hiện tại)</option>
                  )}
                {titles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.suggested_role ? ` · gợi ý ${t.suggested_role}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Tạo/sửa mẫu tại tab «Chức danh». Có thể chỉnh lệch thêm bằng «Gán
                quyền kiêm nhiệm».
              </p>
            </div>
          )}

          {role !== 'student' && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
              <input
                type="checkbox"
                checked={role === 'campus_admin' || canViewFinancials}
                disabled={role === 'campus_admin'}
                onChange={(e) => setCanViewFinancials(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Xem lương / đơn giá
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {role === 'campus_admin'
                    ? 'Quản lý cơ sở luôn được xem dữ liệu tài chính trong phạm vi của mình.'
                    : 'Bật cho kế toán hoặc nhân sự cần thao tác hợp đồng/lương.'}
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !orgId}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------- Modal Gán quyền kiêm nhiệm (049) ----------
// Tick hạng mục -> nhân sự được MỞ menu + trang + dữ liệu phần đó,
// CỘNG THÊM vào quyền vai trò sẵn có (không thay thế).
function GrantsModal({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: StaffRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [data, setData] = useState<UserGrantData | null>(null)
  const [selected, setSelected] = useState<Set<MenuKey>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUserGrants(user.id).then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        onError(result.error)
        onClose()
        return
      }
      setData(result)
      setSelected(new Set(result.grants))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  function toggle(key: MenuKey) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function submit() {
    setSaving(true)
    const result = await saveUserGrants(user.id, [...selected])
    setSaving(false)
    if (result.error) {
      onError(result.error)
      return
    }
    onSaved(
      selected.size > 0
        ? `Đã gán ${selected.size} quyền kiêm nhiệm cho ${user.full_name}. Có hiệu lực trong ~1 phút.`
        : `Đã gỡ toàn bộ quyền kiêm nhiệm của ${user.full_name}.`
    )
  }

  const roleKeySet = new Set(data?.roleKeys ?? [])
  const titleKeySet = new Set(data?.titleKeys ?? [])
  const capSet = data?.capKeys ? new Set(data.capKeys) : null
  // Ẩn mục chỉ dành cho Super Admin
  const sections = MENU_SECTIONS.filter((s) => s.key !== 'settings_global')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grants-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="grants-title" className="font-heading text-xl font-bold">
              Gán quyền kiêm nhiệm
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{user.full_name}</span>
              {' — '}
              {ROLE_LABELS[user.role] ?? user.role}
              {data?.titleName ? (
                <>
                  {' · '}
                  <span className="text-violet-700">Chức danh: {data.titleName}</span>
                </>
              ) : null}
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

        <p className="mb-4 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
          Tick hạng mục = mở menu và thao tác phần đó (cộng thêm quyền vai trò kỹ thuật + chức
          danh). Quản lý cơ sở là cấp cao nhất trong cơ sở — chỉ họ setup tài khoản, cài đặt và
          phân quyền truy cập cho thành viên.
        </p>

        {loading ? (
          <FunLoader label="Đang tải quyền hiện có…" />
        ) : (
          <>
            <ul className="space-y-1">
              {sections.map((section) => {
                const byRole = roleKeySet.has(section.key)
                const byTitle = titleKeySet.has(section.key)
                const outOfCap = capSet !== null && !capSet.has(section.key)
                const checked = byRole || byTitle || selected.has(section.key)
                const disabled = byRole || byTitle || outOfCap
                return (
                  <li key={section.key}>
                    <label
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                        disabled ? 'opacity-60' : 'cursor-pointer hover:bg-indigo-50/50'
                      }`}
                    >
                      {outOfCap && !byRole && !byTitle ? (
                        <Lock
                          className="h-[18px] w-[18px] shrink-0 text-stone-300"
                          aria-label="Ngoài quyền của bạn"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(section.key)}
                          className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
                        />
                      )}
                      <span className="flex-1 font-medium text-foreground">
                        {section.label}
                      </span>
                      {byRole && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
                          Theo vai trò
                        </span>
                      )}
                      {!byRole && byTitle && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          Theo chức danh
                        </span>
                      )}
                      {!byRole && !byTitle && selected.has(section.key) && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Kiêm nhiệm
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
                disabled={saving}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? 'Đang lưu…' : 'Lưu quyền'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- Modal Cấp lại mật khẩu ----------
function ResetPasswordModal({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: StaffRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 8) {
      onError('Mật khẩu mới phải có ít nhất 8 ký tự.')
      return
    }
    setSaving(true)
    const formData = new FormData()
    formData.set('userId', user.id)
    formData.set('password', password)
    const result = await resetUserPassword(formData)
    setSaving(false)
    if (result.error) {
      onError(result.error)
      return
    }
    onSaved(`Đã cấp lại mật khẩu cho ${user.full_name}.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-pass-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <div className="relative w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="reset-pass-title" className="font-heading text-xl font-bold">
            Cấp lại mật khẩu
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-900">
          Đặt mật khẩu mới cho <span className="font-semibold">{user.full_name}</span>
          {user.email ? ` (${user.email})` : ''}. Hãy gửi mật khẩu này cho họ qua kênh an
          toàn.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="reset-pass" className="mb-1.5 block text-sm font-medium">
              Mật khẩu mới <span className="text-destructive">*</span>
            </label>
            <input
              id="reset-pass"
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Đang đổi…' : 'Đổi mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
