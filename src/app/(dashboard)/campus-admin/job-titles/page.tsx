'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  Check,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import { OrgStaffTabs } from '@/components/campus-admin/OrgStaffTabs'
import { MENU_SECTIONS, defaultKeysForRole, type MenuKey } from '@/lib/auth/menuRegistry'
import {
  createJobTitle,
  deleteJobTitle,
  listJobTitleOrgs,
  listJobTitles,
  updateJobTitle,
  type JobTitleRow,
  type ManagedOrgOption,
} from './actions'

const ROLE_HINTS = [
  { value: '', label: '— Không gắn gợi ý —' },
  { value: 'academic_staff', label: 'Giáo vụ (academic_staff)' },
  { value: 'admission_staff', label: 'Tuyển sinh (admission_staff)' },
  { value: 'accountant', label: 'Kế toán (accountant)' },
  { value: 'teacher', label: 'Giáo viên (teacher)' },
  { value: 'campus_admin', label: 'Quản lý cơ sở (campus_admin)' },
]

const PRESETS = [
  { id: 'academic_staff', label: 'Mẫu Giáo vụ' },
  { id: 'admission_staff', label: 'Mẫu Tuyển sinh' },
  { id: 'accountant', label: 'Mẫu Kế toán' },
  { id: 'hr_head', label: 'Mẫu Trưởng phòng NS' },
] as const

const GRANTABLE_SECTIONS = MENU_SECTIONS.filter((s) => s.key !== 'settings_global')

function presetMenuKeysForRole(role: string): MenuKey[] {
  if (role === 'hr_head') {
    return (['staff_users', 'hr_personnel', 'payroll_contracts', 'hr_leave'] as MenuKey[]).filter(
      (k) => GRANTABLE_SECTIONS.some((s) => s.key === k)
    )
  }
  if (
    role !== 'academic_staff' &&
    role !== 'admission_staff' &&
    role !== 'accountant' &&
    role !== 'teacher' &&
    role !== 'campus_admin'
  ) {
    return []
  }
  return defaultKeysForRole(role).filter((k) => k !== 'settings_global')
}

type FormState = {
  id?: string
  orgId: string
  name: string
  description: string
  suggestedRole: string
  menuKeys: Set<MenuKey>
}

function emptyForm(orgId: string): FormState {
  return {
    orgId,
    name: '',
    description: '',
    suggestedRole: '',
    menuKeys: new Set(),
  }
}

export default function JobTitlesPage() {
  const [orgs, setOrgs] = useState<ManagedOrgOption[]>([])
  const [rows, setRows] = useState<JobTitleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [orgFilter, setOrgFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<ToastData | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    const [orgRes, titleRes] = await Promise.all([
      listJobTitleOrgs(),
      listJobTitles(orgFilter || undefined),
    ])
    if (orgRes.error) setToast({ type: 'error', message: orgRes.error })
    if (titleRes.error) setToast({ type: 'error', message: titleRes.error })
    setOrgs(orgRes.data)
    setRows(titleRes.data)
    setLoading(false)
  }, [orgFilter])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.org_name.toLowerCase().includes(q)
    )
  }, [rows, search])

  function openCreate() {
    setForm(emptyForm(orgFilter || orgs[0]?.id || ''))
  }

  function openEdit(row: JobTitleRow) {
    setForm({
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      description: row.description ?? '',
      suggestedRole: row.suggested_role ?? '',
      menuKeys: new Set(row.menu_keys),
    })
  }

  function toggleKey(key: MenuKey) {
    setForm((prev) => {
      if (!prev) return prev
      const next = new Set(prev.menuKeys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, menuKeys: next }
    })
  }

  function applyPreset(role: string) {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        suggestedRole: role,
        menuKeys: new Set(presetMenuKeysForRole(role)),
      }
    })
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.orgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn chi nhánh.' })
      return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      description: form.description,
      suggestedRole: form.suggestedRole || null,
      menuKeys: [...form.menuKeys],
    }
    const result = form.id
      ? await updateJobTitle({ id: form.id, ...payload })
      : await createJobTitle({ orgId: form.orgId, ...payload })
    setSaving(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: form.id
        ? `Đã cập nhật chức danh «${form.name}».`
        : `Đã tạo chức danh «${form.name}».`,
    })
    setForm(null)
    void load()
  }

  async function handleDelete(row: JobTitleRow) {
    if (
      !window.confirm(
        `Xóa chức danh «${row.name}»? Nhân sự đang gắn sẽ được gỡ chức danh (quyền kiêm nhiệm riêng vẫn giữ).`
      )
    ) {
      return
    }
    setDeletingId(row.id)
    const result = await deleteJobTitle(row.id)
    setDeletingId(null)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa chức danh «${row.name}».` })
    void load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Tổ chức nhân sự
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Quản lý cơ sở setup quyền truy cập cao nhất trong cơ sở. Đặt tên chức danh theo cơ sở
              (VD: Phó giám đốc, Thư ký). Mỗi chức danh là một mẫu menu; gán cho nhân sự tại tab
              «Tài khoản & Nhân viên». Vai trò kỹ thuật (cổng/RLS) giữ nguyên. Ngành / môn dạy giáo
              viên gán tại Hồ sơ Giảng viên, không gắn vào chức danh.
            </p>
          </div>
          <OrgStaffTabs />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-foreground">Chức danh</h2>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chức danh
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label htmlFor="jt-org" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Chi nhánh
          </label>
          <select
            id="jt-org"
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Tất cả chi nhánh</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jt-search" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Tìm kiếm
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="jt-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tên chức danh…"
              className="min-h-11 w-full rounded-xl border border-border bg-background py-2 pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-end">
          <p className="text-sm text-muted-foreground">
            <span className="font-heading text-lg font-bold tabular-nums text-foreground">
              {filtered.length}
            </span>{' '}
            chức danh
          </p>
        </div>
      </div>

      {loading ? (
        <FunLoader label="Đang tải chức danh…" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-16 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <p className="mt-3 font-heading text-lg font-semibold text-foreground">
            Chưa có chức danh
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo mẫu quyền theo tên gọi nội bộ của cơ sở, rồi gán cho nhân sự.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chức danh đầu tiên
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Chức danh</th>
                <th className="px-4 py-3 font-semibold">Chi nhánh</th>
                <th className="px-4 py-3 font-semibold">Quyền mẫu</th>
                <th className="px-4 py-3 font-semibold">Nhân sự</th>
                <th className="px-4 py-3 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{row.name}</p>
                    {row.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {row.description}
                      </p>
                    )}
                    {row.suggested_role && (
                      <p className="mt-1 text-[11px] text-violet-700">
                        Gợi ý role: {row.suggested_role}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.org_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold tabular-nums text-indigo-700">
                      {row.menu_keys.length} hạng mục
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.staff_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex min-h-10 cursor-pointer items-center rounded-xl px-3 text-sm font-medium text-primary hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === row.id}
                        onClick={() => void handleDelete(row)}
                        aria-label={`Xóa ${row.name}`}
                        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-destructive hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        {deletingId === row.id ? (
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

      {form && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jt-form-title"
        >
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setForm(null)}
            className="absolute inset-0 cursor-pointer bg-black/50"
          />
          <div className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="jt-form-title" className="font-heading text-xl font-bold">
                  {form.id ? 'Sửa chức danh' : 'Thêm chức danh'}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tick hạng mục = mẫu quyền khi gán nhân sự (cộng với kiêm nhiệm từng người).
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setForm(null)}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
              {!form.id && (
                <div>
                  <label htmlFor="jt-f-org" className="mb-1.5 block text-sm font-medium">
                    Chi nhánh <span className="text-destructive">*</span>
                  </label>
                  <select
                    id="jt-f-org"
                    required
                    value={form.orgId}
                    onChange={(e) => setForm({ ...form, orgId: e.target.value })}
                    className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="" disabled>
                      — Chọn chi nhánh —
                    </option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="jt-f-name" className="mb-1.5 block text-sm font-medium">
                  Tên chức danh <span className="text-destructive">*</span>
                </label>
                <input
                  id="jt-f-name"
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Phó giám đốc, Thư ký học vụ…"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label htmlFor="jt-f-desc" className="mb-1.5 block text-sm font-medium">
                  Mô tả
                </label>
                <textarea
                  id="jt-f-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div>
                <label htmlFor="jt-f-role" className="mb-1.5 block text-sm font-medium">
                  Gợi ý vai trò kỹ thuật
                </label>
                <select
                  id="jt-f-role"
                  value={form.suggestedRole}
                  onChange={(e) => setForm({ ...form, suggestedRole: e.target.value })}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ROLE_HINTS.map((r) => (
                    <option key={r.value || 'none'} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Chỉ là gợi ý khi tạo tài khoản — không thay role thật trên hồ sơ.
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Áp mẫu nhanh</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Ma trận quyền ({form.menuKeys.size} đã chọn)
                  </p>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, menuKeys: new Set() })}
                    className="text-xs font-medium text-muted-foreground hover:text-primary"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
                <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-border p-2">
                  {GRANTABLE_SECTIONS.map((section) => {
                    const checked = form.menuKeys.has(section.key)
                    return (
                      <li key={section.key}>
                        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-indigo-50/60">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKey(section.key)}
                            className="h-[18px] w-[18px] accent-primary"
                          />
                          <span className="flex-1 font-medium">{section.label}</span>
                          {checked && (
                            <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim() || (!form.id && !form.orgId)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  {saving ? 'Đang lưu…' : 'Lưu chức danh'}
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
