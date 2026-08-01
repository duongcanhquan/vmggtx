'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Search,
  Users,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  assignClassesToTeacher,
  getAssignableClasses,
  getTeacherDirectory,
  updateTeacherProfile,
  type AssignableClass,
  type TeacherRow,
} from './actions'

// ============================================================
// HỒ SƠ GIẢNG VIÊN (/teachers)
// - Danh bạ giảng viên trong phạm vi quản lý: liên hệ, cơ sở,
//   các lớp đang phụ trách.
// - "Gán lớp": tick/bỏ tick lớp cho giảng viên ngay trong modal.
// ============================================================

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [assignFor, setAssignFor] = useState<TeacherRow | null>(null)
  const [editFor, setEditFor] = useState<TeacherRow | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getTeacherDirectory()
    if (result.error !== undefined) {
      setLoadError(result.error)
      setLoading(false)
      return
    }
    setTeachers(result.teachers)
    setLoadError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return teachers
    return teachers.filter(
      (t) =>
        t.full_name.toLowerCase().includes(term) ||
        (t.email ?? '').toLowerCase().includes(term) ||
        t.org_name.toLowerCase().includes(term)
    )
  }, [teachers, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <GraduationCap className="h-7 w-7 text-primary" aria-hidden="true" />
            Hồ sơ Giảng viên
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh bạ giảng viên và phân công lớp phụ trách.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên, email, cơ sở…"
            aria-label="Tìm giảng viên"
            className="min-h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {loading && <FunLoader label="Đang tải danh bạ giảng viên…" />}

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {!loading && !loadError && visible.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {teachers.length === 0
              ? 'Chưa có giảng viên nào. Tạo tài khoản giáo viên trong "Tài khoản & Nhân viên".'
              : 'Không có giảng viên nào khớp tìm kiếm.'}
          </p>
        </div>
      )}

      {!loading && !loadError && visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((teacher) => (
            <article
              key={teacher.id}
              className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-base font-bold text-foreground">
                    {teacher.full_name}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{teacher.org_name}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  {teacher.classes.length} lớp
                </span>
              </div>

              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <dd className="truncate">{teacher.email ?? '—'}</dd>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <dd>{teacher.phone ?? '—'}</dd>
                </div>
              </dl>

              <div className="mt-3 flex-1">
                {teacher.classes.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {teacher.classes.map((cls) => (
                      <li
                        key={cls.id}
                        className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
                      >
                        {cls.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Chưa phụ trách lớp nào.</p>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAssignFor(teacher)}
                  className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Gán lớp
                </button>
                <button
                  type="button"
                  onClick={() => setEditFor(teacher)}
                  aria-label={`Sửa hồ sơ ${teacher.full_name}`}
                  className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3.5 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Sửa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {assignFor && (
        <AssignClassesModal
          teacher={assignFor}
          onClose={() => setAssignFor(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setAssignFor(null)
            void load()
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {editFor && (
        <EditTeacherModal
          teacher={editFor}
          onClose={() => setEditFor(null)}
          onSaved={(message) => {
            setToast({ type: 'success', message })
            setEditFor(null)
            void load()
          }}
          onError={(message) => setToast({ type: 'error', message })}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

// ---------- Modal Sửa hồ sơ giảng viên ----------
function EditTeacherModal({
  teacher,
  onClose,
  onSaved,
  onError,
}: {
  teacher: TeacherRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [fullName, setFullName] = useState(teacher.full_name)
  const [phone, setPhone] = useState(teacher.phone ?? '')
  const [email, setEmail] = useState(teacher.email ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = await updateTeacherProfile(teacher.id, { fullName, phone, email })
    setSaving(false)
    if (result.error) {
      onError(result.error)
      return
    }
    onSaved(`Đã cập nhật hồ sơ của ${fullName.trim()}.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-teacher-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-teacher-title" className="font-heading text-xl font-bold">
              Sửa hồ sơ giảng viên
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{teacher.org_name}</p>
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

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Họ và tên *</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Số điện thoại</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Email liên hệ</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Chỉ đổi email hiển thị/liên hệ. Email ĐĂNG NHẬP đổi ở &quot;Tài khoản &amp; Nhân
              viên&quot;.
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
              <Pencil className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------- Modal Gán lớp cho giảng viên ----------
function AssignClassesModal({
  teacher,
  onClose,
  onSaved,
  onError,
}: {
  teacher: TeacherRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [classes, setClasses] = useState<AssignableClass[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    getAssignableClasses().then((result) => {
      if (cancelled) return
      if (result.error !== undefined) {
        onError(result.error)
        onClose()
        return
      }
      setClasses(result.classes)
      setSelected(
        new Set(
          result.classes.filter((c) => c.teacher_id === teacher.id).map((c) => c.id)
        )
      )
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher.id])

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return classes
    return classes.filter(
      (c) => c.name.toLowerCase().includes(term) || c.org_name.toLowerCase().includes(term)
    )
  }, [classes, filter])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    const original = new Set(
      classes.filter((c) => c.teacher_id === teacher.id).map((c) => c.id)
    )
    const addIds = [...selected].filter((id) => !original.has(id))
    const removeIds = [...original].filter((id) => !selected.has(id))
    if (addIds.length === 0 && removeIds.length === 0) {
      onClose()
      return
    }
    setSaving(true)
    const result = await assignClassesToTeacher(teacher.id, addIds, removeIds)
    setSaving(false)
    if (result.error) {
      onError(result.error)
      return
    }
    onSaved(
      `Đã cập nhật phân công cho ${teacher.full_name}: +${addIds.length} lớp, gỡ ${removeIds.length} lớp.`
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-classes-title"
    >
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-black/50"
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl bg-surface p-6 shadow-xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="assign-classes-title" className="font-heading text-xl font-bold">
              Gán lớp cho giảng viên
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{teacher.full_name}</span>
              {' — '}
              {teacher.org_name}
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
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Lọc theo tên lớp / cơ sở…"
              aria-label="Lọc lớp"
              className="mb-3 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {visible.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  Không có lớp nào.
                </li>
              )}
              {visible.map((cls) => {
                const takenByOther =
                  cls.teacher_id !== null && cls.teacher_id !== teacher.id
                return (
                  <li key={cls.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-indigo-50/50">
                      <input
                        type="checkbox"
                        checked={selected.has(cls.id)}
                        onChange={() => toggle(cls.id)}
                        className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-indigo-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {cls.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {cls.org_name} · {cls.student_count} học viên
                          {takenByOther && cls.teacher_name && (
                            <span className="text-amber-600">
                              {' '}
                              · đang do {cls.teacher_name} phụ trách
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Đã chọn <strong>{selected.size}</strong> lớp. Tick lớp của giảng viên khác =
                CHUYỂN lớp đó sang giảng viên này.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-indigo-50 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving}
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                  )}
                  {saving ? 'Đang lưu…' : 'Lưu phân công'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
