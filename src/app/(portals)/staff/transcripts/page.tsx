'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Loader2, Lock, SearchX } from 'lucide-react'
import { getStaffClasses, type StaffClassRow } from '@/app/(dashboard)/staff/classes/actions'
import { getGradebook, type Gradebook } from '@/app/(dashboard)/teacher/grades/[class_id]/actions'

// ============================================================
// BẢNG ĐIỂM TỔNG (Staff Portal) - CHỈ ĐỌC
// Chọn lớp -> ma trận điểm mọi học viên + điểm TB có trọng số.
// Quyền xem đã được gate trong getGradebook (staff trở lên trên org lớp).
// ============================================================

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
  if (average === null) return 'text-slate-400'
  if (average < 5) return 'text-rose-600'
  if (average < 6.5) return 'text-amber-600'
  return 'text-emerald-600'
}

export default function StaffTranscriptsPage() {
  const [classes, setClasses] = useState<StaffClassRow[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [gradebook, setGradebook] = useState<Gradebook | null>(null)
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)

  useEffect(() => {
    void (async () => {
      const result = await getStaffClasses()
      setClasses(result.data)
      setLoadingClasses(false)
      if (result.data.length > 0) setSelectedClassId(result.data[0].id)
    })()
  }, [])

  const loadGradebook = useCallback(async (classId: string) => {
    if (!classId) return
    setLoadingGrades(true)
    const result = await getGradebook(classId)
    setGradebook(result)
    setLoadingGrades(false)
  }, [])

  useEffect(() => {
    void loadGradebook(selectedClassId)
  }, [selectedClassId, loadGradebook])

  // Xếp hạng theo điểm TB giảm dần
  const rankedStudents = useMemo(() => {
    if (!gradebook) return []
    return gradebook.students
      .map((student) => ({ ...student, average: weightedAverage(gradebook, student.id) }))
      .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
  }, [gradebook])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
          <BookOpenCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" />
          Bảng điểm tổng
        </h1>

        <select
          value={selectedClassId}
          onChange={(event) => setSelectedClassId(event.target.value)}
          disabled={loadingClasses || classes.length === 0}
          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          aria-label="Chọn lớp"
        >
          {classes.length === 0 ? (
            <option value="">Không có lớp nào</option>
          ) : (
            classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))
          )}
        </select>
      </div>

      {loadingClasses || loadingGrades ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Đang tải bảng điểm…
        </div>
      ) : !gradebook || classes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium">Chưa có lớp học nào trong cơ sở.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-sm font-semibold text-slate-700">
              {gradebook.className} · {gradebook.students.length} học viên ·{' '}
              {gradebook.assessments.length} bài kiểm tra
            </p>
            {gradebook.isLocked && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Đã chốt sổ
              </span>
            )}
          </div>

          {gradebook.students.length === 0 || gradebook.assessments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
              <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium">
                {gradebook.students.length === 0
                  ? 'Lớp chưa có học viên.'
                  : 'Lớp chưa có bài kiểm tra nào.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-semibold">#</th>
                    <th className="px-3 py-3 font-semibold">Học viên</th>
                    {gradebook.assessments.map((assessment) => (
                      <th key={assessment.id} className="px-3 py-3 text-center font-semibold">
                        {assessment.name}
                        <span className="block text-[10px] font-normal normal-case text-slate-300">
                          hệ số {assessment.weight}
                        </span>
                      </th>
                    ))}
                    <th className="px-5 py-3 text-center font-semibold">Điểm TB</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedStudents.map((student, index) => (
                    <tr key={student.id} className="border-b border-slate-50 hover:bg-indigo-50/30">
                      <td className="px-5 py-2.5 text-slate-400">{index + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {student.full_name}
                      </td>
                      {gradebook.assessments.map((assessment) => {
                        const score = gradebook.grades[`${assessment.id}:${student.id}`]
                        return (
                          <td key={assessment.id} className="px-3 py-2.5 text-center text-slate-600">
                            {score !== undefined ? score : <span className="text-slate-300">–</span>}
                          </td>
                        )
                      })}
                      <td className={`px-5 py-2.5 text-center font-bold ${averageTone(student.average)}`}>
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
