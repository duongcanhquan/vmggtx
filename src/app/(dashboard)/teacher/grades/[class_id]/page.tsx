'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Lock, LockOpen, TriangleAlert } from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  getGradebook,
  lockGradebook,
  updateGrade,
  type Gradebook,
} from './actions'

// ============================================================
// Sổ điểm điện tử (/teacher/grades/[class_id])
// - Matrix: hàng = học sinh, cột = bài kiểm tra (kèm hệ số).
// - Ô input number, Tab chuyển ô, BLUR -> tự lưu ngầm (auto-save).
// - is_locked = true -> DISABLE toàn bộ ô + backend cũng chặn.
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
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải sổ điểm…
      </div>
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
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập điểm rồi bấm Tab / click ra ngoài — hệ thống tự lưu ngầm.
          </p>
        </div>

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

      {/* ===== Banner trạng thái ===== */}
      {isLocked ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p className="text-sm font-medium text-rose-800">
            SỔ ĐIỂM ĐÃ CHỐT — mọi ô nhập bị vô hiệu hóa. Database cũng từ chối
            mọi thay đổi (trigger chặn ở tầng DB).
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <LockOpen className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="text-sm text-emerald-800">
            Sổ điểm đang MỞ — điểm được tự lưu khi rời ô nhập.
            {book.demo && ' (chế độ demo: điểm không ghi vào database)'}
          </p>
        </div>
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
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-center font-semibold text-primary">
                  TB
                </th>
              </tr>
            </thead>
            <tbody>
              {/* [UX] Empty state: lớp chưa có học sinh / bài kiểm tra */}
              {(book.students.length === 0 || book.assessments.length === 0) && (
                <tr>
                  <td
                    colSpan={book.assessments.length + 2}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {book.students.length === 0
                      ? 'Lớp chưa có học sinh nào. Hãy ghi danh học viên trước khi nhập điểm.'
                      : 'Lớp chưa có bài kiểm tra nào. Hãy tạo bài kiểm tra để bắt đầu nhập điểm.'}
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
