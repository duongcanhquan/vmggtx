'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BadgeCheck,
  Blocks,
  Building2,
  CalendarClock,
  Contact,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  School,
  ShieldAlert,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { campusPortalPath } from '@/lib/utils/orgSlug'
import { ORG_TYPE_LABELS } from '@/lib/utils/org-tree'
import { MODULE_CATALOG } from '@/lib/licensing/moduleCatalog'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  createUnitAdmin,
  deleteUnitAdmin,
  getUnitAdmins,
  getUnitProfile,
  saveUnitContact,
  updateUnitAdmin,
  type UnitAdminRow,
  type UnitContact,
  type UnitProfile,
} from '../actions'

// ============================================================
// HỒ SƠ ĐƠN VỊ [ORG_MODEL.md G2]
// Super Admin bấm vào 1 Đơn vị để nắm ngay tình hình: bao nhiêu
// admin / nhân viên / giảng viên / học viên (GỘP CẢ CÂY), module
// nào đang hoạt động, license còn hạn không, các Cơ sở bên trong.
// CHỈ XEM con số tổng — chi tiết nghiệp vụ thuộc Admin Đơn vị.
// ============================================================

type LoadedProfile = Exclude<UnitProfile, { error: string }>

export default function UnitProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const setCurrentOrgId = useOrgStore((s) => s.setCurrentOrgId)
  const [profile, setProfile] = useState<LoadedProfile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getUnitProfile(params.id)
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setProfile(result)
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <FunLoader label="Đang tải hồ sơ Đơn vị…" />
  if (loadError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      </div>
    )
  }
  if (!profile) return null

  const { org, counts, children, license, offModules } = profile
  const licenseExpired =
    license.validUntil !== null &&
    license.validUntil < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

  /** Trạng thái từng module với Đơn vị này */
  function moduleState(key: string): 'active' | 'off' | 'not_in_package' {
    if (license.moduleKeys !== null && !license.moduleKeys.includes(key)) {
      return 'not_in_package'
    }
    if (offModules.includes(key)) return 'off'
    return 'active'
  }
  const activeCount = MODULE_CATALOG.filter((m) => moduleState(m.key) === 'active').length

  const stats = [
    { label: 'Quản lý (Admin)', value: counts.admins, icon: UserCog, tone: 'text-indigo-600' },
    { label: 'Nhân viên', value: counts.staff, icon: Users, tone: 'text-sky-600' },
    { label: 'Giảng viên', value: counts.teachers, icon: GraduationCap, tone: 'text-emerald-600' },
    { label: 'Học viên', value: counts.students, icon: School, tone: 'text-amber-600' },
    { label: 'Lớp học', value: counts.classes, icon: Building2, tone: 'text-violet-600' },
  ]

  return (
    <div className="space-y-6">
      <BackLink />

      {/* ===== Header ===== */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground">
            <Building2 className="h-6 w-6 shrink-0 text-indigo-600" aria-hidden="true" />
            <span className="truncate">{org.name}</span>
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {ORG_TYPE_LABELS[org.type]}
            </span>
            {org.slug && (
              <a
                href={campusPortalPath(org.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
              >
                /coso/{org.slug}/login
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
            <span className="text-xs text-muted-foreground">
              Số liệu tính GỘP toàn cây — con người thuộc Đơn vị, cơ sở chỉ là nơi học/làm.
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCurrentOrgId(org.id)
              router.push('/campus-admin/users')
            }}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Quản lý Admin & nhân sự
          </button>
          <Link
            href="/admin/modules"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Blocks className="h-4 w-4" aria-hidden="true" />
            Trung tâm Module
          </Link>
        </div>
      </div>

      {/* ===== Số liệu nhân sự / học viên (gộp cả cây) ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <stat.icon className={`h-4 w-4 ${stat.tone}`} aria-hidden="true" />
            <p className={`mt-1 font-heading text-2xl font-bold ${stat.tone}`}>
              {stat.value.toLocaleString('vi-VN')}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ===== Admin Đơn vị + Người liên hệ (Super Admin thêm/sửa/xóa) ===== */}
      <UnitAdminsSection orgId={org.id} orgName={org.name} />


      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== License + Module đang hoạt động ===== */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              Gói module — {activeCount}/{MODULE_CATALOG.length} đang hoạt động
            </h2>
            {license.status === 'suspended' || licenseExpired ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {license.status === 'suspended' ? 'Đang tạm ngưng' : 'Hết hạn'}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                Đang hiệu lực
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground">
            <span>
              Gói: <strong>{license.planName}</strong>
            </span>
            <span>
              Giới hạn học viên:{' '}
              <strong>
                {license.maxStudents === null
                  ? 'Không giới hạn'
                  : `${counts.students.toLocaleString('vi-VN')} / ${license.maxStudents.toLocaleString('vi-VN')}`}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Hạn dùng: <strong>{license.validUntil ?? 'Vĩnh viễn'}</strong>
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {MODULE_CATALOG.map((mod) => {
              const state = moduleState(mod.key)
              return (
                <span
                  key={mod.key}
                  title={
                    state === 'active'
                      ? `${mod.label}: đang hoạt động`
                      : state === 'off'
                        ? `${mod.label}: có trong gói nhưng đang bị TẮT`
                        : `${mod.label}: chưa ghép vào gói`
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    state === 'active'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : state === 'off'
                        ? 'border-rose-200 bg-rose-50 text-rose-600 line-through'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  {mod.label}
                </span>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Xanh = đang hoạt động · Đỏ gạch = trong gói nhưng bị tắt · Xám = chưa ghép vào gói.
            Ghép/gỡ và bật/tắt tại Trung tâm Module.
          </p>
        </div>

        {/* ===== Cơ sở / Trung tâm bên trong ===== */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Cơ sở / Trung tâm bên trong ({children.length})
          </h2>
          {children.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Chưa có cơ sở nào — Admin Đơn vị sẽ tự tạo Cơ sở/Trung tâm bên trong.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{child.name}</p>
                    <p className="text-xs text-muted-foreground">{ORG_TYPE_LABELS[child.type]}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <School className="h-3.5 w-3.5" aria-hidden="true" />
                      {child.students} HV
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                      {child.teachers} GV
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/admin/organizations"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Về danh sách Đơn vị
    </Link>
  )
}

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

/**
 * QUẢN LÝ ADMIN ĐƠN VỊ — Super Admin thêm / sửa (kèm đặt lại mật khẩu) /
 * xóa tài khoản campus_admin của Đơn vị khách hàng, và cập nhật
 * NGƯỜI LIÊN HỆ (tên, email, điện thoại) của Đơn vị.
 */
function UnitAdminsSection({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [admins, setAdmins] = useState<UnitAdminRow[]>([])
  const [contact, setContact] = useState<UnitContact | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editRow, setEditRow] = useState<UnitAdminRow | null>(null)
  const [contactOpen, setContactOpen] = useState(false)

  const load = useCallback(async () => {
    const result = await getUnitAdmins(orgId)
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setAdmins(result.admins)
    setContact(result.contact)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await createUnitAdmin(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo Admin Đơn vị mới.' })
    setCreateOpen(false)
    void load()
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await updateUnitAdmin(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã cập nhật Admin.' })
    setEditRow(null)
    void load()
  }

  async function handleDelete(row: UnitAdminRow) {
    const ok = window.confirm(
      `Xóa Admin "${row.fullName}" (${row.email})?\nTài khoản sẽ bị khóa đăng nhập ngay lập tức.`
    )
    if (!ok) return
    setDeletingId(row.id)
    const result = await deleteUnitAdmin(row.id)
    setDeletingId(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa Admin "${row.fullName}".` })
    void load()
  }

  async function handleSaveContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const result = await saveUnitContact(new FormData(event.currentTarget))
    setSaving(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã lưu người liên hệ.' })
    setContactOpen(false)
    void load()
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <UserCog className="h-4 w-4" aria-hidden="true" />
          Admin Đơn vị ({admins.length}) &amp; Người liên hệ
        </h2>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm Admin
        </button>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải danh sách Admin…
        </p>
      ) : loadError ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {loadError}
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,320px]">
          {/* --- Danh sách Admin --- */}
          <div className="space-y-2">
            {admins.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Chưa có Admin nào — bấm &quot;Thêm Admin&quot; để tạo người quản lý cho Đơn vị.
              </p>
            ) : (
              admins.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {row.fullName}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        {row.email}
                      </span>
                      {row.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" aria-hidden="true" />
                          {row.phone}
                        </span>
                      )}
                      {row.orgName && row.orgId !== orgId && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" aria-hidden="true" />
                          Phụ trách: {row.orgName}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditRow(row)}
                      title="Sửa thông tin / đặt lại mật khẩu"
                      aria-label={`Sửa Admin ${row.fullName}`}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-amber-100 hover:text-amber-700"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row)}
                      disabled={deletingId === row.id}
                      title="Xóa Admin (khóa đăng nhập)"
                      aria-label={`Xóa Admin ${row.fullName}`}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      {deletingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* --- Người liên hệ của Đơn vị --- */}
          <div className="self-start rounded-xl border border-dashed border-border bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Contact className="h-3.5 w-3.5" aria-hidden="true" />
                Người liên hệ
              </p>
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline"
              >
                {contact ? 'Sửa' : 'Thêm'}
              </button>
            </div>
            {contact ? (
              <div className="mt-2 space-y-1 text-sm text-foreground">
                <p className="font-semibold">{contact.name || '—'}</p>
                {contact.email && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" aria-hidden="true" />
                    {contact.email}
                  </p>
                )}
                {contact.phone && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    {contact.phone}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Chưa có thông tin liên hệ — thêm tên, email, điện thoại của người đại diện
                Đơn vị.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== Modal THÊM ADMIN ===== */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-slate-900">
                Thêm Admin — {orgName}
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Đóng"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="orgId" value={orgId} />
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Họ tên
                <input name="fullName" required className={fieldClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email đăng nhập
                <input name="email" type="email" required className={fieldClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Số điện thoại (tùy chọn)
                <input name="phone" placeholder="VD: 0912345678" className={fieldClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Mật khẩu khởi tạo (tối thiểu 8 ký tự)
                <input name="password" type="text" required minLength={8} className={fieldClass} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Tạo Admin
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Modal SỬA ADMIN (kèm đặt lại mật khẩu) ===== */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleUpdate}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-slate-900">
                Sửa Admin — {editRow.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                aria-label="Đóng"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="userId" value={editRow.id} />
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Họ tên
                <input
                  name="fullName"
                  defaultValue={editRow.fullName}
                  required
                  className={fieldClass}
                />
              </label>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Email đăng nhập: <span className="font-mono font-semibold">{editRow.email}</span>{' '}
                (không đổi được — cần email khác thì tạo Admin mới rồi xóa tài khoản cũ).
              </p>
              <label className="block text-sm font-medium text-slate-700">
                Số điện thoại
                <input
                  name="phone"
                  defaultValue={editRow.phone ?? ''}
                  placeholder="VD: 0912345678"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Đặt lại mật khẩu (để trống = giữ nguyên)
                </span>
                <input
                  name="newPassword"
                  type="text"
                  placeholder="Mật khẩu mới, tối thiểu 8 ký tự"
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Modal NGƯỜI LIÊN HỆ ===== */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSaveContact}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-slate-900">
                Người liên hệ — {orgName}
              </h3>
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                aria-label="Đóng"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <input type="hidden" name="orgId" value={orgId} />
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Họ tên người liên hệ
                <input
                  name="contactName"
                  defaultValue={contact?.name ?? ''}
                  required
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  name="contactEmail"
                  type="email"
                  defaultValue={contact?.email ?? ''}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Số điện thoại
                <input
                  name="contactPhone"
                  defaultValue={contact?.phone ?? ''}
                  placeholder="VD: 0912345678"
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setContactOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Lưu liên hệ
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
