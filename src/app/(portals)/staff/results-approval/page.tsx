'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Loader2,
  Lock,
  SearchX,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { getExamBoard, lockClassResults, type ExamRow } from '../exams/actions'

// ============================================================
// XÉT DUYỆT KẾT QUẢ (Staff Portal - phòng Khảo thí)
// Hàng đợi các LỚP đã hết hạn nhập điểm (chờ duyệt) -> duyệt =
// "Chốt sổ điểm" (lock_status='locked', trigger DB chặn mọi sửa đổi).
// Gia hạn nhập điểm thực hiện tại mục Kỳ thi.
// ============================================================

type ClassQueueItem = {
  classId: string
  className: string
  lockStatus: ExamRow['lockStatus']
  assessments: ExamRow[]
  totalGrades: number
  pendingReview: boolean
}

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

export default function ResultsApprovalPage() {
  const [exams, setExams] = useState<ExamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lockingId, setLockingId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const result = await getExamBoard()
    setLoading(false)
    if (result.error !== undefined) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setExams(result.exams)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Gom bài thi theo lớp
  const queue = useMemo<ClassQueueItem[]>(() => {
    const byClass = new Map<string, ClassQueueItem>()
    for (const exam of exams) {
      let item = byClass.get(exam.classId)
      if (!item) {
        item = {
          classId: exam.classId,
          className: exam.className,
          lockStatus: exam.lockStatus,
          assessments: [],
          totalGrades: 0,
          pendingReview: false,
        }
        byClass.set(exam.classId, item)
      }
      item.assessments.push(exam)
      item.totalGrades += exam.gradeCount
      if (exam.status === 'pending_review') item.pendingReview = true
    }
    // Chờ duyệt lên đầu, đã chốt xuống cuối
    return [...byClass.values()].sort((a, b) => {
      const score = (item: ClassQueueItem) =>
        item.lockStatus === 'locked' ? 2 : item.pendingReview ? 0 : 1
      return score(a) - score(b)
    })
  }, [exams])

  async function handleApprove(item: ClassQueueItem) {
    if (
      !window.confirm(
        `Chốt sổ điểm lớp "${item.className}"? Sau khi chốt, MỌI thay đổi điểm sẽ bị chặn ở tầng database.`
      )
    ) {
      return
    }
    setLockingId(item.classId)
    const result = await lockClassResults(item.classId)
    setLockingId(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã chốt sổ điểm lớp ${item.className}.` })
    void loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900">
            <ClipboardCheck className="h-6 w-6 text-indigo-600" aria-hidden="true" />
            Xét duyệt kết quả
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cần gia hạn?{' '}
            <Link href="/staff/exams" className="font-semibold text-indigo-600 hover:underline">
              Sang mục Kỳ thi
            </Link>
            .
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Đang tải hàng đợi xét duyệt…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {loadError}
        </div>
      ) : queue.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-medium">Không có lớp nào cần xét duyệt.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((item) => (
            <div
              key={item.classId}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                item.lockStatus === 'locked'
                  ? 'border-slate-200 opacity-75'
                  : item.pendingReview
                    ? 'border-amber-300 ring-1 ring-amber-100'
                    : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
                    {item.className}
                    {item.lockStatus === 'locked' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">
                        <Lock className="h-3 w-3" aria-hidden="true" /> Đã chốt sổ
                      </span>
                    ) : item.pendingReview ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
                        <Clock3 className="h-3 w-3" aria-hidden="true" /> Quá hạn - chờ duyệt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Đang nhập điểm
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.assessments.length} bài thi · {item.totalGrades} lượt điểm đã nhập
                  </p>
                </div>

                {item.lockStatus !== 'locked' && (
                  <button
                    type="button"
                    onClick={() => handleApprove(item)}
                    disabled={lockingId === item.classId}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {lockingId === item.classId ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Lock className="h-4 w-4" aria-hidden="true" />
                    )}
                    Duyệt &amp; Chốt sổ
                  </button>
                )}
              </div>

              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {item.assessments.map((assessment) => (
                  <li
                    key={assessment.assessmentId}
                    className="flex items-center justify-between text-xs text-slate-600"
                  >
                    <span>{assessment.assessmentName}</span>
                    <span className="text-slate-400">
                      {assessment.gradingDeadline
                        ? `Hạn: ${dateFmt.format(new Date(assessment.gradingDeadline))}`
                        : 'Không giới hạn hạn nhập'}
                      {' · '}
                      {assessment.gradeCount} điểm
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
