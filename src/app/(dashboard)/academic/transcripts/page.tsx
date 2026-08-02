'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpenCheck,
  Building2,
  Lock,
  Printer,
  Search,
  SearchX,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import {
  getGradebook,
  type Gradebook,
} from '@/app/(dashboard)/teacher/grades/[class_id]/actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { buildTranscriptPrintHtml } from '@/lib/exams/transcriptPrint'
import {
  getTranscriptClasses,
  type TranscriptClassRow,
} from './actions'

function weightedAverage(gradebook: Gradebook, studentId: string): number | null {
  let totalWeight = 0
  let sum = 0
  for (const assessment of gradebook.assessments) {
    const score = gradebook.grades[`${assessment.id}:${studentId}`]
    if (score === undefined) continue
    const weight = assessment.weight > 0 ? assessment.weight : 1
    sum += score * weight
    totalWeight += weight
  }
  if (totalWeight === 0) return null
  return Math.round((sum / totalWeight) * 100) / 100
}

function averageTone(average: number | null): string {
  if (average === null) return 'text-muted-foreground'
  if (average < 5) return 'text-destructive'
  if (average < 6.5) return 'text-amber-600'
  return 'text-emerald-700'
}

export default function AcademicTranscriptsPage() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)

  const [classes, setClasses] = useState<TranscriptClassRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [orgFilter, setOrgFilter] = useState<string>('all')

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [gradebook, setGradebook] = useState<Gradebook | null>(null)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')

  const loadClasses = useCallback(async () => {
    if (!currentOrgId) {
      setClasses([])
      setLoadingClasses(false)
      setLoadError('Chưa chọn đơn vị trên thanh tổ chức.')
      return
    }
    setLoadingClasses(true)
    const result = await getTranscriptClasses(currentOrgId)
    setClasses(result.data)
    setLoadError(result.error ?? null)
    setLoadingClasses(false)
  }, [currentOrgId])

  useEffect(() => {
    void loadClasses()
    setSelectedClassId(null)
    setGradebook(null)
  }, [loadClasses])

  const orgOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of classes) map.set(c.org_id, c.org_name)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'vi'))
  }, [classes])

  const filteredClasses = useMemo(() => {
    const kw = searchText.trim().toLowerCase()
    return classes.filter((c) => {
      if (orgFilter !== 'all' && c.org_id !== orgFilter) return false
      if (!kw) return true
      return (
        c.name.toLowerCase().includes(kw) ||
        c.teacher_name.toLowerCase().includes(kw) ||
        c.org_name.toLowerCase().includes(kw)
      )
    })
  }, [classes, searchText, orgFilter])

  const summary = useMemo(() => {
    const totalStudents = filteredClasses.reduce((s, c) => s + c.student_count, 0)
    const locked = filteredClasses.filter((c) => c.is_locked).length
    const emptyRoster = filteredClasses.filter((c) => c.student_count === 0).length
    return {
      classCount: filteredClasses.length,
      totalStudents,
      locked,
      emptyRoster,
    }
  }, [filteredClasses])

  async function openClass(classId: string) {
    setSelectedClassId(classId)
    setStudentSearch('')
    setLoadingGrades(true)
    const result = await getGradebook(classId)
    setGradebook(result)
    setLoadingGrades(false)
  }

  function printTranscriptPdf() {
    if (!gradebook || !selectedClassId) return
    const meta = classes.find((c) => c.id === selectedClassId)
    const students = gradebook.students.map((student) => {
      const scores: Record<string, number | null> = {}
      for (const a of gradebook.assessments) {
        const key = `${a.id}:${student.id}`
        scores[a.id] =
          gradebook.grades[key] !== undefined ? gradebook.grades[key] : null
      }
      return {
        full_name: student.full_name,
        scores,
        weighted: weightedAverage(gradebook, student.id),
      }
    })
    const html = buildTranscriptPrintHtml({
      className: gradebook.className || meta?.name || 'Lớp',
      orgLabel: meta?.org_name ?? 'GDTX ERP',
      printedAt: new Date().toLocaleString('vi-VN'),
      assessments: gradebook.assessments.map((a) => ({
        id: a.id,
        name: a.name,
        weight: a.weight,
        max_score: a.max_score,
      })),
      students,
    })
    const win = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  const rankedStudents = useMemo(() => {
    if (!gradebook) return []
    const kw = studentSearch.trim().toLowerCase()
    return gradebook.students
      .map((student) => ({
        ...student,
        average: weightedAverage(gradebook, student.id),
      }))
      .filter((s) => !kw || s.full_name.toLowerCase().includes(kw))
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
  }, [gradebook, studentSearch])

  // ----- Chi tiết 1 lớp -----
  if (selectedClassId) {
    const meta = classes.find((c) => c.id === selectedClassId)
    return (
      <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => {
                setSelectedClassId(null)
                setGradebook(null)
              }}
              className="mb-2 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Về tổng hợp
            </button>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
              <BookOpenCheck className="h-6 w-6 text-primary" aria-hidden="true" />
              {gradebook?.className ?? meta?.name ?? 'Bảng điểm lớp'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {meta?.org_name ? `${meta.org_name} · ` : ''}
              GV: {meta?.teacher_name ?? '—'}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={printTranscriptPdf}
              disabled={!gradebook || loadingGrades}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-indigo-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              In / PDF
            </button>
            <div className="relative w-full flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Tìm học viên…"
              aria-label="Tìm học viên"
              className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            </div>
          </div>
        </div>

        {loadingGrades ? (
          <FunLoader label="Đang tải bảng điểm lớp…" />
        ) : !gradebook ? (
          <p className="text-sm text-muted-foreground">Không tải được sổ điểm.</p>
        ) : (
          <div className="rounded-2xl border border-border bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <p className="text-sm font-semibold">
                {gradebook.students.length} học viên · {gradebook.assessments.length}{' '}
                bài kiểm tra
              </p>
              {gradebook.isLocked && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Đã chốt sổ
                </span>
              )}
            </div>

            {gradebook.loadError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-destructive">
                <SearchX className="h-10 w-10 opacity-40" aria-hidden="true" />
                <p className="text-sm font-medium">{gradebook.loadError}</p>
              </div>
            ) : gradebook.students.length === 0 || gradebook.assessments.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <SearchX className="h-10 w-10 opacity-40" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {gradebook.students.length === 0
                    ? 'Lớp chưa có học viên đang ghi danh — cần phân HV vào lớp trước.'
                    : 'Lớp chưa có bài kiểm tra nào.'}
                </p>
              </div>
            ) : rankedStudents.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Không có học viên khớp «{studentSearch}».
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">#</th>
                      <th className="px-3 py-3 font-semibold">Học viên</th>
                      {gradebook.assessments.map((assessment) => (
                        <th key={assessment.id} className="px-3 py-3 text-center font-semibold">
                          {assessment.name}
                          <span className="block text-[10px] font-normal normal-case text-muted-foreground">
                            hệ số {assessment.weight}
                          </span>
                        </th>
                      ))}
                      <th className="px-5 py-3 text-center font-semibold">Điểm TB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedStudents.map((student, index) => (
                      <tr
                        key={student.id}
                        className="border-b border-border/60 last:border-0 hover:bg-primary/5"
                      >
                        <td className="px-5 py-2.5 text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2.5 font-medium">{student.full_name}</td>
                        {gradebook.assessments.map((assessment) => {
                          const score =
                            gradebook.grades[`${assessment.id}:${student.id}`]
                          return (
                            <td
                              key={assessment.id}
                              className="px-3 py-2.5 text-center tabular-nums"
                            >
                              {score !== undefined ? (
                                score
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </td>
                          )
                        })}
                        <td
                          className={`px-5 py-2.5 text-center font-bold tabular-nums ${averageTone(student.average)}`}
                        >
                          {student.average !== null ? student.average.toFixed(2) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ----- Tổng hợp -----
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          <BookOpenCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          Bảng điểm tổng
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tổng hợp điểm các lớp theo đơn vị đang chọn. Bấm một lớp để xem chi tiết /
          tìm học viên.
        </p>
      </div>

      {loadError && (
        <p
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {loadError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Số lớp
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums">
            {summary.classCount}
          </p>
        </div>
        <div className="bento-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tổng HV (active)
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums">
            {summary.totalStudents}
          </p>
        </div>
        <div className="bento-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Đã chốt sổ
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums">
            {summary.locked}
          </p>
        </div>
        <div className="bento-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lớp chưa có HV
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-amber-700">
            {summary.emptyRoster}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm lớp, GV, đơn vị…"
            aria-label="Tìm lớp"
            className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {orgOptions.length > 1 && (
          <div className="relative sm:w-64">
            <Building2
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              aria-label="Lọc theo đơn vị"
              className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-border bg-surface pl-10 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả đơn vị</option>
              {orgOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loadingClasses ? (
        <FunLoader label="Đang tải danh sách lớp…" />
      ) : filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-muted-foreground">
          <SearchX className="h-10 w-10 opacity-40" aria-hidden="true" />
          <p className="text-sm font-medium">
            {classes.length === 0
              ? 'Chưa có lớp trong phạm vi đơn vị đang chọn.'
              : 'Không có lớp khớp bộ lọc.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Lớp</th>
                <th className="px-3 py-3 font-semibold">Đơn vị</th>
                <th className="px-3 py-3 font-semibold">GV chủ nhiệm</th>
                <th className="px-3 py-3 text-right font-semibold">HV</th>
                <th className="px-3 py-3 text-right font-semibold">Bài KT</th>
                <th className="px-3 py-3 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredClasses.map((cls) => (
                <tr
                  key={cls.id}
                  onClick={() => void openClass(cls.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void openClass(cls.id)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Xem bảng điểm lớp ${cls.name}`}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-primary/5 focus:outline-none focus-visible:bg-primary/10"
                >
                  <td className="px-4 py-3 font-semibold">{cls.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{cls.org_name}</td>
                  <td className="px-3 py-3">{cls.teacher_name}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span
                      className={
                        cls.student_count === 0 ? 'font-semibold text-amber-700' : ''
                      }
                    >
                      {cls.student_count}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {cls.assessment_count}
                  </td>
                  <td className="px-3 py-3">
                    {cls.is_locked ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Chốt sổ
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Đang mở</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
