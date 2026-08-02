'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Lock, LockOpen, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { AcademicAiAssist } from '@/components/academic/AcademicAiAssist'
import {
  createAssessment,
  getGradebook,
  lockGradebook,
  softDeleteAssessment,
  updateGrade,
  type Gradebook,
} from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Sổ điểm điện tử (/teacher/grades/[class_id])
// - Matrix: hàng = học sinh, cột = bài kiểm tra (kèm hệ số).
// - Ô input number, Tab chuyển ô, BLUR -> tự lưu ngầm (auto-save).
// - is_locked = true -> DISABLE toàn bộ ô + backend cũng chặn.
// - Thêm cột điểm qua createAssessment (GVCN / Giáo vụ).
// ============================================================

type CellStatus = 'saving' | 'saved' | 'error'

function cellKey(assessmentId: string, studentId: string) {
  return `${assessmentId}:${studentId}`
}

export default function GradebookPage({
  params,
}: {
  params: { class_id: string }
}) {
  const classId = params.class_id

  const [book, setBook] = useState<Gradebook | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({})
  const [isLocked, setIsLocked] = useState(false)
  const [locking, setLocking] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWeight, setNewWeight] = useState('1')
  const [newMax, setNewMax] = useState('10')

  // Giá trị đã lưu thành công gần nhất - để blur không lưu lại khi không đổi
  const savedValues = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    const data = await getGradebook(classId)
    setBook(data)
    setIsLocked(data.isLocked)

    const initial: Record<string, string> = {}
    for (const [key, score] of Object.entries(data.grades)) {
      initial[key] = String(score)
    }
    setValues(initial)
    savedValues.current = { ...initial }
  }, [classId])

  useEffect(() => {
    load()
  }, [load])

  const aiContext = useMemo(() => {
    if (!book || book.loadError) return ''
    const lines: string[] = [
      `Lớp: ${book.className}`,
      `Số HV ghi danh: ${book.students.length}`,
      `Số cột điểm: ${book.assessments.length}`,
      `Trạng thái sổ: ${book.isLocked ? 'ĐÃ CHỐT' : 'ĐANG MỞ'}`,
    ]
    for (const a of book.assessments) {
      lines.push(`Cột «${a.name}» hệ số ${a.weight}, max ${a.max_score}`)
    }
    for (const s of book.students.slice(0, 40)) {
      const scores = book.assessments
        .map((a) => {
          const v = values[cellKey(a.id, s.id)] ?? book.grades[cellKey(a.id, s.id)]
          return v === undefined || v === '' ? null : `${a.name}=${v}`
        })
        .filter(Boolean)
      if (scores.length > 0) {
        lines.push(`${s.full_name}: ${scores.join(', ')}`)
      }
    }
    return lines.join('\n')
  }, [book, values])

  async function handleBlur(assessmentId: string, studentId: string) {
    const key = cellKey(assessmentId, studentId)
    const raw = (values[key] ?? '').trim()

    // Không đổi so với lần lưu trước -> bỏ qua
    if (raw === (savedValues.current[key] ?? '')) return
    // Ô bị xóa trống: chưa hỗ trợ xóa điểm, khôi phục giá trị cũ
    if (raw === '') {
      setValues((prev) => ({ ...prev, [key]: savedValues.current[key] ?? '' }))
      return
    }

    const score = Number(raw)
    const assessment = book?.assessments.find((a) => a.id === assessmentId)
    if (!Number.isFinite(score) || score < 0 || (assessment && score > assessment.max_score)) {
      setCellStatus((prev) => ({ ...prev, [key]: 'error' }))
      setToast({
        type: 'error',
        message: `Điểm phải từ 0 đến ${assessment?.max_score ?? 10}.`,
      })
      return
    }

    setCellStatus((prev) => ({ ...prev, [key]: 'saving' }))
    const result = await updateGrade(classId, assessmentId, studentId, score)

    if (result.error !== undefined) {
      setCellStatus((prev) => ({ ...prev, [key]: 'error' }))
      setToast({ type: 'error', message: result.error })
      return
    }

    savedValues.current[key] = raw
    setCellStatus((prev) => ({ ...prev, [key]: 'saved' }))
  }

  async function handleLock() {
    if (!book) return
    const confirmed = window.confirm(
      'CHỐT SỔ ĐIỂM?\n\nSau khi chốt, TOÀN BỘ ô điểm sẽ bị khóa và không thể sửa (backend + database đều chặn). Hành động này không thể tự hoàn tác trên UI.'
    )
    if (!confirmed) return

    setLocking(true)
    const result = await lockGradebook(classId)
    setLocking(false)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setIsLocked(true)
    setToast({ type: 'success', message: 'Đã chốt sổ điểm. Mọi ô nhập đã bị khóa.' })
  }

  async function handleCreateAssessment(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    const result = await createAssessment(classId, {
      name: newName,
      weight: Number(newWeight),
      maxScore: Number(newMax),
    })
    setAdding(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã thêm cột «${newName.trim()}».` })
    setNewName('')
    setNewWeight('1')
    setNewMax('10')
    setShowAdd(false)
    await load()
  }

  /** Điểm trung bình có trọng số của 1 học sinh (chỉ tính bài đã có điểm) */
  function weightedAverage(studentId: string): string {
    if (!book) return '—'
    let sum = 0
    let weightSum = 0
    for (const a of book.assessments) {
      const raw = values[cellKey(a.id, studentId)]
      if (raw === undefined || raw === '') continue
      const score = Number(raw)
      if (!Number.isFinite(score)) continue
      sum += score * a.weight
      weightSum += a.weight
    }
    if (weightSum === 0) return '—'
    return (sum / weightSum).toFixed(2)
  }

  if (!book) {
    return (
      <FunLoader label="Đang tải sổ điểm…" />
    )
  }

  return (
    <div className="space-y-6">
      {/* ===== Header + nút Chốt Sổ ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Sổ điểm: {book.className}
          </h1>
        </div>

        <div className="flex flex-wrap gap-3">
          {book.canLock && !isLocked && !book.loadError && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Thêm cột điểm
            </button>
          )}
          {book.canLock && !isLocked && (
            <button
              type="button"
              onClick={handleLock}
              disabled={locking}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {locking ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4" aria-hidden="true" />
              )}
              {locking ? 'Đang chốt…' : 'Chốt Sổ Điểm'}
            </button>
          )}
        </div>
      </div>

      {/* ===== Banner trạng thái / lỗi ===== */}
      {book.loadError ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <TriangleAlert className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p className="text-sm font-medium text-rose-800">{book.loadError}</p>
        </div>
      ) : isLocked ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p className="text-sm font-medium text-rose-800">
            SỔ ĐIỂM ĐÃ CHỐT — không thể sửa điểm.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <LockOpen className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-emerald-800">
            Sổ điểm đang MỞ — tự lưu khi rời ô. Chỉ học viên đang ghi danh.
          </p>
        </div>
      )}

      {showAdd && !isLocked && (
        <form
          onSubmit={handleCreateAssessment}
          className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-4 sm:items-end"
        >
          <div className="sm:col-span-2">
            <label htmlFor="asmt-name" className="text-xs font-semibold text-muted-foreground">
              Tên bài kiểm tra
            </label>
            <input
              id="asmt-name"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={120}
              placeholder="VD: Giữa kỳ, 15 phút…"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="asmt-weight" className="text-xs font-semibold text-muted-foreground">
              Hệ số
            </label>
            <input
              id="asmt-weight"
              type="number"
              min={0.01}
              max={100}
              step={0.25}
              required
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="asmt-max" className="text-xs font-semibold text-muted-foreground">
              Điểm tối đa
            </label>
            <input
              id="asmt-max"
              type="number"
              min={0.01}
              max={1000}
              step={0.5}
              required
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {adding ? 'Đang tạo…' : 'Tạo cột điểm'}
            </button>
          </div>
        </form>
      )}

      {!book.loadError && book.orgIdForAi && (
        <AcademicAiAssist
          orgId={book.orgIdForAi}
          classId={classId}
          contextPayload={aiContext}
          title="AI phân tích sổ điểm"
          defaultPrompt="Chỉ ra học viên yếu, cột điểm chưa cân, và gợi ý ưu tiên ôn tập."
          suggestions={[
            'Liệt kê học viên ĐTB < 5 và lý do',
            'Đánh giá phân bổ hệ số các cột điểm',
            'Soạn nhận xét ngắn cho 3 HV yếu nhất',
          ]}
        />
      )}

      {/* ===== Matrix nhập điểm ===== */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="sticky left-0 z-10 bg-indigo-50/90 px-4 py-3 font-semibold backdrop-blur">
                  Học sinh
                </th>
                {book.assessments.map((a) => (
                  <th key={a.id} scope="col" className="px-3 py-3 text-center font-semibold">
                    <span className="block">{a.name}</span>
                    <span className="mt-0.5 block text-[10px] font-medium normal-case text-muted-foreground">
                      Hệ số {a.weight} · tối đa {a.max_score}
                    </span>
                    {book.canLock && !isLocked && (
                      <button
                        type="button"
                        title={`Xóa cột «${a.name}»`}
                        aria-label={`Xóa cột ${a.name}`}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Xóa cột điểm «${a.name}»?\nĐiểm đã nhập của cột này cũng sẽ bị ẩn (soft-delete).`
                            )
                          ) {
                            return
                          }
                          const result = await softDeleteAssessment(classId, a.id)
                          if (result.error !== undefined) {
                            setToast({ type: 'error', message: result.error })
                            return
                          }
                          setToast({ type: 'success', message: `Đã xóa cột «${a.name}».` })
                          await load()
                        }}
                        className="mx-auto mt-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-center font-semibold text-primary">
                  TB
                </th>
              </tr>
            </thead>
            <tbody>
              {(book.students.length === 0 || book.assessments.length === 0) && (
                <tr>
                  <td
                    colSpan={Math.max(book.assessments.length, 0) + 2}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {book.loadError
                      ? 'Không có dữ liệu sổ điểm để hiển thị.'
                      : book.students.length === 0
                        ? 'Lớp chưa có học viên đang ghi danh (enrollments active).'
                        : 'Chưa có bài kiểm tra — bấm «Thêm cột điểm» để tạo.'}
                  </td>
                </tr>
              )}
              {book.students.map((student) => (
                <tr
                  key={student.id}
                  className="border-b border-border last:border-b-0 hover:bg-indigo-50/30"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium text-foreground"
                  >
                    {student.full_name}
                  </th>
                  {book.assessments.map((assessment) => {
                    const key = cellKey(assessment.id, student.id)
                    const status = cellStatus[key]
                    return (
                      <td key={assessment.id} className="px-2 py-2 text-center">
                        <div className="relative mx-auto w-20">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={assessment.max_score}
                            step={0.25}
                            disabled={isLocked}
                            value={values[key] ?? ''}
                            aria-label={`Điểm ${assessment.name} của ${student.full_name}`}
                            onChange={(e) =>
                              setValues((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            onBlur={() => handleBlur(assessment.id, student.id)}
                            className={`min-h-10 w-full rounded-lg border bg-background px-2 pr-6 text-center text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-muted-foreground ${
                              status === 'error' ? 'border-rose-300' : 'border-border'
                            }`}
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
                            {status === 'saving' && (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                                aria-label="Đang lưu"
                              />
                            )}
                            {status === 'saved' && (
                              <Check
                                className="h-3.5 w-3.5 text-emerald-600"
                                aria-label="Đã lưu"
                              />
                            )}
                            {status === 'error' && (
                              <TriangleAlert
                                className="h-3.5 w-3.5 text-rose-600"
                                aria-label="Lỗi lưu điểm"
                              />
                            )}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center">
                    <span className="font-heading text-sm font-bold text-primary">
                      {weightedAverage(student.id)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
