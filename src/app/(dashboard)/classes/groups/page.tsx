'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  getActiveSubjects,
  getTeachersInOrg,
} from '@/app/(dashboard)/classes/actions'
import {
  createClassGroup,
  createSectionFromGroup,
  listClassGroups,
  softDeleteClassGroup,
  listGroupMembers,
  listStudentsForGroupPick,
  addStudentsToGroup,
  removeStudentFromGroup,
  listClassTeachers,
  upsertClassTeacher,
  removeClassTeacher,
  listSectionsInOrg,
  type ClassGroupRow,
  type ClassTeacherRow,
} from './actions'

const inputClass =
  'min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function ClassGroupsPage() {
  const orgId = useOrgStore((s) => s.currentOrgId)
  const [rows, setRows] = useState<ClassGroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [homeroomId, setHomeroomId] = useState('')
  const [teachers, setTeachers] = useState<{ id: string; full_name: string }[]>(
    []
  )

  const [sectionGroupId, setSectionGroupId] = useState('')
  const [sectionName, setSectionName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [sectionTeacherId, setSectionTeacherId] = useState('')
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([])

  const [manageGroupId, setManageGroupId] = useState('')
  const [members, setMembers] = useState<
    { id: string; student_id: string; full_name: string }[]
  >([])
  const [pickStudents, setPickStudents] = useState<
    { id: string; full_name: string }[]
  >([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])

  const [sectionForTeachers, setSectionForTeachers] = useState('')
  const [sections, setSections] = useState<{ id: string; name: string }[]>([])
  const [classTeachers, setClassTeachers] = useState<ClassTeacherRow[]>([])
  const [addTeacherId, setAddTeacherId] = useState('')
  const [addTeacherRole, setAddTeacherRole] = useState<'lead' | 'co' | 'grader'>(
    'co'
  )

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [g, t, s, sec] = await Promise.all([
      listClassGroups(orgId),
      getTeachersInOrg(orgId),
      getActiveSubjects(),
      listSectionsInOrg(orgId),
    ])
    setRows(g.data)
    setTeachers(t.data)
    setSubjects(s.data)
    setSections(sec.data)
    if (g.error) setToast({ type: 'error', message: g.error })
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!orgId || !manageGroupId) {
      setMembers([])
      return
    }
    void (async () => {
      const [m, p] = await Promise.all([
        listGroupMembers(orgId, manageGroupId),
        listStudentsForGroupPick(orgId),
      ])
      setMembers(m.data)
      setPickStudents(p.data)
      if (m.error) setToast({ type: 'error', message: m.error })
    })()
  }, [orgId, manageGroupId])

  useEffect(() => {
    if (!orgId || !sectionForTeachers) {
      setClassTeachers([])
      return
    }
    void listClassTeachers(orgId, sectionForTeachers).then((res) => {
      setClassTeachers(res.data)
      if (res.error) setToast({ type: 'error', message: res.error })
    })
  }, [orgId, sectionForTeachers])

  async function onCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    const res = await createClassGroup(orgId, {
      name,
      homeroomTeacherId: homeroomId || null,
    })
    setBusy(false)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo lớp hành chính.' })
    setName('')
    setHomeroomId('')
    void load()
  }

  async function onCreateSection(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !sectionGroupId) return
    setBusy(true)
    const res = await createSectionFromGroup(orgId, {
      groupId: sectionGroupId,
      name: sectionName,
      subjectId,
      teacherId: sectionTeacherId || undefined,
    })
    setBusy(false)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
      return
    }
    setToast({ type: 'success', message: 'Đã tạo học phần và đồng bộ roster (nếu có).' })
    setSectionName('')
    setSubjectId('')
    setSectionTeacherId('')
    void load()
  }

  async function onDelete(id: string) {
    if (!orgId) return
    if (!window.confirm('Ẩn lớp hành chính này?')) return
    setBusy(true)
    const res = await softDeleteClassGroup(orgId, id)
    setBusy(false)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
      return
    }
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/classes"
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Về học phần
          </Link>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Layers className="h-7 w-7 text-primary" aria-hidden="true" />
            Lớp hành chính
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cohort theo cơ sở — tạo học phần (môn + GV) bên dưới.
          </p>
        </div>
      </div>

      {!orgId ? (
        <p className="text-sm text-muted-foreground">Chọn đơn vị trên thanh tổ chức.</p>
      ) : (
        <>
          <form
            onSubmit={onCreateGroup}
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <p className="mb-3 text-sm font-semibold">Thêm lớp hành chính</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="cg-name">
                  Tên *
                </label>
                <input
                  id="cg-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="Lớp 10A — NH 2026"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="cg-hr">
                  Chủ nhiệm
                </label>
                <select
                  id="cg-hr"
                  value={homeroomId}
                  onChange={(e) => setHomeroomId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Chưa gán —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tạo
            </button>
          </form>

          <form
            onSubmit={onCreateSection}
            className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <p className="mb-3 text-sm font-semibold">Tạo học phần từ lớp hành chính</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sec-g">
                  Cohort *
                </label>
                <select
                  id="sec-g"
                  required
                  value={sectionGroupId}
                  onChange={(e) => setSectionGroupId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Chọn —</option>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sec-n">
                  Tên học phần *
                </label>
                <input
                  id="sec-n"
                  required
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  className={inputClass}
                  placeholder="Toán 10A"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sec-s">
                  Môn *
                </label>
                <select
                  id="sec-s"
                  required
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Chọn —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="sec-t">
                  GV lead
                </label>
                <select
                  id="sec-t"
                  value={sectionTeacherId}
                  onChange={(e) => setSectionTeacherId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Chưa gán —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tạo học phần
            </button>
          </form>

          {loading ? (
            <FunLoader label="Đang tải lớp hành chính…" />
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              Chưa có lớp hành chính.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setManageGroupId(row.id)}
                    className="text-left"
                  >
                    <p className="font-heading font-bold text-primary hover:underline">
                      {row.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {row.org_name}
                      </span>
                      <span>CN: {row.homeroom_name}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {row.member_count} HV
                      </span>
                      <span>{row.section_count} học phần</span>
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(row.id)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Ẩn
                  </button>
                </li>
              ))}
            </ul>
          )}

          {manageGroupId && (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <h2 className="mb-3 font-heading text-lg font-bold">
                Học viên cohort ·{' '}
                {rows.find((r) => r.id === manageGroupId)?.name ?? ''}
              </h2>
              <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-border p-2">
                {pickStudents.map((st) => (
                  <label
                    key={st.id}
                    className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-indigo-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(st.id)}
                      onChange={() =>
                        setSelectedStudentIds((prev) =>
                          prev.includes(st.id)
                            ? prev.filter((x) => x !== st.id)
                            : [...prev, st.id]
                        )
                      }
                      className="h-4 w-4 rounded"
                    />
                    <span className="text-sm">{st.full_name}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || selectedStudentIds.length === 0}
                onClick={() =>
                  void (async () => {
                    if (!orgId) return
                    setBusy(true)
                    const res = await addStudentsToGroup(
                      orgId,
                      manageGroupId,
                      selectedStudentIds
                    )
                    setBusy(false)
                    if (res.error) {
                      setToast({ type: 'error', message: res.error })
                      return
                    }
                    setToast({
                      type: 'success',
                      message: `Đã thêm ${res.added ?? 0} HV.`,
                    })
                    setSelectedStudentIds([])
                    const m = await listGroupMembers(orgId, manageGroupId)
                    setMembers(m.data)
                    void load()
                  })()
                }
                className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Thêm HV đã chọn
              </button>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span>{m.full_name}</span>
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() =>
                        void (async () => {
                          if (!orgId) return
                          await removeStudentFromGroup(orgId, m.id)
                          const next = await listGroupMembers(orgId, manageGroupId)
                          setMembers(next.data)
                          void load()
                        })()
                      }
                    >
                      Gỡ
                    </button>
                  </li>
                ))}
                {members.length === 0 && (
                  <li className="text-sm text-muted-foreground">Chưa có HV.</li>
                )}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-lg font-bold">
              Gán GV học phần (lead / co / grader)
            </h2>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <select
                value={sectionForTeachers}
                onChange={(e) => setSectionForTeachers(e.target.value)}
                className={inputClass}
              >
                <option value="">— Chọn học phần —</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={addTeacherId}
                onChange={(e) => setAddTeacherId(e.target.value)}
                className={inputClass}
              >
                <option value="">— GV —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
              <select
                value={addTeacherRole}
                onChange={(e) =>
                  setAddTeacherRole(e.target.value as 'lead' | 'co' | 'grader')
                }
                className={inputClass}
              >
                <option value="lead">Lead</option>
                <option value="co">Co</option>
                <option value="grader">Grader</option>
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !sectionForTeachers || !addTeacherId || !orgId}
              onClick={() =>
                void (async () => {
                  if (!orgId) return
                  setBusy(true)
                  const res = await upsertClassTeacher(
                    orgId,
                    sectionForTeachers,
                    addTeacherId,
                    addTeacherRole
                  )
                  setBusy(false)
                  if (res.error) {
                    setToast({ type: 'error', message: res.error })
                    return
                  }
                  setToast({ type: 'success', message: 'Đã gán GV.' })
                  const list = await listClassTeachers(orgId, sectionForTeachers)
                  setClassTeachers(list.data)
                })()
              }
              className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Gán GV
            </button>
            <ul className="space-y-1">
              {classTeachers.map((ct) => (
                <li
                  key={ct.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {ct.full_name}{' '}
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                      {ct.role}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-destructive hover:underline"
                    onClick={() =>
                      void (async () => {
                        if (!orgId) return
                        await removeClassTeacher(orgId, ct.id)
                        const list = await listClassTeachers(
                          orgId,
                          sectionForTeachers
                        )
                        setClassTeachers(list.data)
                      })()
                    }
                  >
                    Gỡ
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
