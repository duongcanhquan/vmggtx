'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { AcademicFlowTabs } from '@/components/academic/AcademicFlowTabs'
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
  syncGroupRosterToSections,
  enrollStudentsToSection,
  listSectionsByGroup,
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
    {
      id: string
      student_id: string
      full_name: string
      student_code: string | null
    }[]
  >([])
  const [pickStudents, setPickStudents] = useState<
    {
      id: string
      full_name: string
      student_code: string | null
      email: string | null
      phone: string | null
    }[]
  >([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [onlyNotInGroup, setOnlyNotInGroup] = useState(true)
  const [groupSections, setGroupSections] = useState<
    { id: string; name: string; teacher_name: string; enrolled_count: number }[]
  >([])
  const [mergeSectionId, setMergeSectionId] = useState('')
  const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([])

  const [sectionForTeachers, setSectionForTeachers] = useState('')
  const [sections, setSections] = useState<{ id: string; name: string }[]>([])
  const [classTeachers, setClassTeachers] = useState<ClassTeacherRow[]>([])
  const [addTeacherId, setAddTeacherId] = useState('')
  const [addTeacherRole, setAddTeacherRole] = useState<'lead' | 'co' | 'grader'>(
    'co'
  )

  const memberIdSet = useMemo(
    () => new Set(members.map((m) => m.student_id)),
    [members]
  )

  const filteredPick = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    return pickStudents.filter((st) => {
      if (onlyNotInGroup && memberIdSet.has(st.id)) return false
      if (!q) return true
      return (
        st.full_name.toLowerCase().includes(q) ||
        (st.student_code ?? '').toLowerCase().includes(q) ||
        (st.email ?? '').toLowerCase().includes(q) ||
        (st.phone ?? '').includes(q)
      )
    })
  }, [pickStudents, studentSearch, onlyNotInGroup, memberIdSet])

  const filteredMergePick = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    return pickStudents.filter((st) => {
      if (!q) return true
      return (
        st.full_name.toLowerCase().includes(q) ||
        (st.student_code ?? '').toLowerCase().includes(q) ||
        (st.email ?? '').toLowerCase().includes(q) ||
        (st.phone ?? '').includes(q)
      )
    })
  }, [pickStudents, studentSearch])

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
      setGroupSections([])
      return
    }
    void (async () => {
      const [m, p, sec] = await Promise.all([
        listGroupMembers(orgId, manageGroupId),
        listStudentsForGroupPick(orgId),
        listSectionsByGroup(orgId, manageGroupId),
      ])
      setMembers(m.data)
      setPickStudents(p.data)
      setGroupSections(sec.data)
      setSelectedStudentIds([])
      setMergeSelectedIds([])
      if (m.error) setToast({ type: 'error', message: m.error })
      if (sec.error) setToast({ type: 'error', message: sec.error })
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
    if (orgId && sectionGroupId === manageGroupId) {
      void listSectionsByGroup(orgId, sectionGroupId).then((sec) =>
        setGroupSections(sec.data)
      )
    }
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Layers className="h-7 w-7 text-primary" aria-hidden="true" />
            Lớp hành chính
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Quy trình: tạo lớp chính → thêm học viên (tìm/lọc/chọn) → tạo nhiều học phần (môn +
            GV) → ghép thêm HV vào học phần nếu cần. Sĩ số cohort tự đồng bộ sang học phần.
          </p>
        </div>
        <AcademicFlowTabs />
      </div>

      <ol className="grid gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-950 sm:grid-cols-4">
        <li>
          <span className="font-bold">1.</span> Tạo lớp hành chính
        </li>
        <li>
          <span className="font-bold">2.</span> Thêm HV (tìm &amp; chọn nhiều)
        </li>
        <li>
          <span className="font-bold">3.</span> Tạo học phần / gán GV
        </li>
        <li>
          <span className="font-bold">4.</span> Ghép HV vào học phần (tuỳ chọn)
        </li>
      </ol>

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
            <section className="space-y-5 rounded-2xl border-2 border-primary/30 bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-bold">
                    Quản lý · {rows.find((r) => r.id === manageGroupId)?.name ?? ''}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Thêm HV vào lớp chính → đồng bộ sang mọi học phần · hoặc ghép HV vào
                    một học phần cụ thể.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !orgId}
                    onClick={() =>
                      void (async () => {
                        if (!orgId) return
                        setBusy(true)
                        const res = await syncGroupRosterToSections(
                          orgId,
                          manageGroupId
                        )
                        setBusy(false)
                        if (res.error) {
                          setToast({ type: 'error', message: res.error })
                          return
                        }
                        setToast({
                          type: 'success',
                          message: `Đã đồng bộ roster → học phần (+${res.enrolled ?? 0}).`,
                        })
                        const sec = await listSectionsByGroup(orgId, manageGroupId)
                        setGroupSections(sec.data)
                      })()
                    }
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" /> Đồng bộ → học phần
                  </button>
                  <button
                    type="button"
                    onClick={() => setManageGroupId('')}
                    className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Đóng
                  </button>
                </div>
              </div>

              {/* Học phần thuộc cohort */}
              <div>
                <p className="mb-2 text-sm font-semibold">Học phần của lớp này</p>
                {groupSections.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    Chưa có học phần — dùng form «Tạo học phần từ lớp hành chính» phía trên.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {groupSections.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm"
                      >
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-muted-foreground">
                          GV: {s.teacher_name} · {s.enrolled_count} HV đã ghi danh
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link
                            href={`/classes/${s.id}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Chi tiết học phần
                          </Link>
                          <button
                            type="button"
                            className="text-xs font-semibold text-violet-700 hover:underline"
                            onClick={() => {
                              setSectionForTeachers(s.id)
                              setMergeSectionId(s.id)
                            }}
                          >
                            Gán GV / ghép HV
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Thêm HV vào cohort */}
              <div>
                <p className="mb-2 text-sm font-semibold">Thêm học viên vào lớp hành chính</p>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Tìm tên, MaSV, email, SĐT…"
                      className={`${inputClass} pl-9`}
                      aria-label="Tìm học viên"
                    />
                  </div>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={onlyNotInGroup}
                      onChange={(e) => setOnlyNotInGroup(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    Chỉ hiện chưa thuộc lớp
                  </label>
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary hover:underline"
                    onClick={() => {
                      const ids = filteredPick.map((s) => s.id)
                      setSelectedStudentIds((prev) => {
                        const set = new Set(prev)
                        const allSelected = ids.every((id) => set.has(id))
                        if (allSelected) {
                          return prev.filter((id) => !ids.includes(id))
                        }
                        return [...new Set([...prev, ...ids])]
                      })
                    }}
                  >
                    Chọn / bỏ chọn trang lọc
                  </button>
                </div>
                <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-border">
                  {filteredPick.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Không có HV khớp bộ lọc.
                    </p>
                  ) : (
                    filteredPick.map((st) => (
                      <label
                        key={st.id}
                        className="flex min-h-10 cursor-pointer items-center gap-2 border-b border-border/60 px-3 last:border-0 hover:bg-indigo-50"
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
                        <span className="flex-1 text-sm">
                          <span className="font-medium">{st.full_name}</span>
                          {st.student_code && (
                            <span className="ml-2 text-muted-foreground">
                              {st.student_code}
                            </span>
                          )}
                        </span>
                        {memberIdSet.has(st.id) && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                            Đã trong lớp
                          </span>
                        )}
                      </label>
                    ))
                  )}
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
                        selectedStudentIds,
                        { syncSections: true }
                      )
                      setBusy(false)
                      if (res.error) {
                        setToast({ type: 'error', message: res.error })
                        return
                      }
                      setToast({
                        type: 'success',
                        message: `Đã thêm ${res.added ?? 0} HV vào lớp chính và đồng bộ học phần.`,
                      })
                      setSelectedStudentIds([])
                      const [m, sec] = await Promise.all([
                        listGroupMembers(orgId, manageGroupId),
                        listSectionsByGroup(orgId, manageGroupId),
                      ])
                      setMembers(m.data)
                      setGroupSections(sec.data)
                      void load()
                    })()
                  }
                  className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Thêm {selectedStudentIds.length || ''} HV
                  đã chọn (+ sync học phần)
                </button>

                <p className="mb-2 text-sm font-semibold">
                  Sĩ số lớp chính ({members.length})
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span>
                        {m.full_name}
                        {m.student_code ? (
                          <span className="ml-2 text-muted-foreground">
                            {m.student_code}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="text-destructive hover:underline"
                        onClick={() =>
                          void (async () => {
                            if (!orgId) return
                            await removeStudentFromGroup(orgId, m.id)
                            const next = await listGroupMembers(
                              orgId,
                              manageGroupId
                            )
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
              </div>

              {/* Ghép HV vào 1 học phần */}
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <p className="mb-2 text-sm font-semibold text-violet-950">
                  Ghép học viên vào một học phần (không bắt buộc thuộc lớp chính)
                </p>
                <p className="mb-3 text-xs text-violet-900/80">
                  Dùng khi lớp học phần ghép sinh viên từ nhiều lớp hành chính / ngoài roster.
                </p>
                <select
                  value={mergeSectionId}
                  onChange={(e) => setMergeSectionId(e.target.value)}
                  className={`${inputClass} mb-3`}
                >
                  <option value="">— Chọn học phần —</option>
                  {groupSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-border bg-white">
                  {filteredMergePick.slice(0, 80).map((st) => (
                    <label
                      key={st.id}
                      className="flex min-h-9 cursor-pointer items-center gap-2 border-b border-border/50 px-3 last:border-0 hover:bg-violet-50"
                    >
                      <input
                        type="checkbox"
                        checked={mergeSelectedIds.includes(st.id)}
                        onChange={() =>
                          setMergeSelectedIds((prev) =>
                            prev.includes(st.id)
                              ? prev.filter((x) => x !== st.id)
                              : [...prev, st.id]
                          )
                        }
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">
                        {st.full_name}
                        {st.student_code ? (
                          <span className="ml-2 text-muted-foreground">
                            {st.student_code}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={
                    busy || !mergeSectionId || mergeSelectedIds.length === 0
                  }
                  onClick={() =>
                    void (async () => {
                      if (!orgId) return
                      setBusy(true)
                      const res = await enrollStudentsToSection(
                        orgId,
                        mergeSectionId,
                        mergeSelectedIds
                      )
                      setBusy(false)
                      if (res.error) {
                        setToast({ type: 'error', message: res.error })
                        return
                      }
                      setToast({
                        type: 'success',
                        message: `Đã ghép ${res.enrolled ?? 0} HV vào học phần.`,
                      })
                      setMergeSelectedIds([])
                      const sec = await listSectionsByGroup(orgId, manageGroupId)
                      setGroupSections(sec.data)
                    })()
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Ghép vào học phần đã chọn
                </button>
              </div>
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
                {(manageGroupId && groupSections.length > 0
                  ? groupSections
                  : sections
                ).map((s) => (
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
