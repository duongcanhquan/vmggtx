'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlarmClockPlus,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Lock,
  SearchX,
  ShieldAlert,
  X,
} from 'lucide-react'
import {
  extendGradingDeadline,
  lockClassResults,
  type ExamRow,
  type ExamStatus,
} from './actions'

// ============================================================
// Bảng Khảo thí: 3 màu trạng thái + Gia hạn nhập điểm + Chốt sổ.
// ============================================================

const STATUS_META: Record<
  ExamStatus,
  { label: string; chip: string; dot: string }
> = {
  open: {
    label: 'Đang mở nhập điểm',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  pending_review: {
    label: 'Quá hạn - chờ Khảo thí duyệt',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  locked: {
    label: 'Đã duyệt (Chốt sổ)',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
}

function formatDeadline(iso: string | null): string {
  if (!iso) return 'Không giới hạn'
  return new Date(iso).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Giá trị mặc định cho input datetime-local: 7 ngày sau, giờ địa phương */
function defaultDeadlineValue(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function ExamBoard({ initialExams }: { initialExams: ExamRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [extendTarget, setExtendTarget] = useState<ExamRow | null>(null)
  const [newDeadline, setNewDeadline] = useState(defaultDeadlineValue)
  const [filter, setFilter] = useState<'all' | ExamStatus>('all')

  const exams = useMemo(
    () => (filter === 'all' ? initialExams : initialExams.filter((e) => e.status === filter)),
    [initialExams, filter]
  )

  const counts = useMemo(() => {
    const base: Record<ExamStatus, number> = { open: 0, pending_review: 0, locked: 0 }
    for (const exam of initialExams) base[exam.status] += 1
    return base
  }, [initialExams])

  function notify(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4500)
  }

  function handleExtend() {
    if (!extendTarget) return
    setBusyId(extendTarget.assessmentId)
    startTransition(async () => {
      const result = await extendGradingDeadline({
        assessmentId: extendTarget.assessmentId,
        newDeadline,
      })
      setBusyId(null)
      if (result.error !== undefined) {
        notify('error', result.error)
        return
      }
      setExtendTarget(null)
      notify('success', 'Đã gia hạn nhập điểm. Giáo viên có thể nhập bù.')
      router.refresh()
    })
  }

  function handleLock(exam: ExamRow) {
    if (
      !window.confirm(
        `Chốt sổ điểm lớp "${exam.className}"?\nSau khi chốt, MỌI thay đổi điểm sẽ bị Database từ chối.`
      )
    ) {
      return
    }
    setBusyId(exam.classId)
    startTransition(async () => {
      const result = await lockClassResults(exam.classId)
      setBusyId(null)
      if (result.error !== undefined) {
        notify('error', result.error)
        return
      }
      notify('success', `Đã chốt sổ điểm lớp ${exam.className}.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Bộ đếm + lọc nhanh theo trạng thái */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label={`Tất cả (${initialExams.length})`}
          className="border-slate-200 bg-white text-slate-700"
        />
        <FilterChip
          active={filter === 'open'}
          onClick={() => setFilter('open')}
          label={`Đang mở (${counts.open})`}
          className={STATUS_META.open.chip}
        />
        <FilterChip
          active={filter === 'pending_review'}
          onClick={() => setFilter('pending_review')}
          label={`Chờ duyệt (${counts.pending_review})`}
          className={STATUS_META.pending_review.chip}
        />
        <FilterChip
          active={filter === 'locked'}
          onClick={() => setFilter('locked')}
          label={`Đã chốt (${counts.locked})`}
          className={STATUS_META.locked.chip}
        />
      </div>

      {exams.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-slate-500">
          <SearchX className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium">Không tìm thấy bài thi nào.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[2fr_1.4fr_1.4fr_1.2fr_auto] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Bài thi / Lớp</span>
            <span>Hạn nhập điểm</span>
            <span>Trạng thái</span>
            <span>Điểm đã nhập</span>
            <span className="text-right">Thao tác</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {exams.map((exam) => {
              const meta = STATUS_META[exam.status]
              const busy = isPending && (busyId === exam.assessmentId || busyId === exam.classId)
              return (
                <li
                  key={exam.assessmentId}
                  className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[2fr_1.4fr_1.4fr_1.2fr_auto] md:items-center"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-indigo-50 p-2">
                      <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{exam.assessmentName}</p>
                      <p className="text-sm text-slate-500">{exam.className}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
                    {formatDeadline(exam.gradingDeadline)}
                  </div>

                  <div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.chip}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>

                  <div className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-900">{exam.gradeCount}</span> điểm
                  </div>

                  <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setNewDeadline(defaultDeadlineValue())
                        setExtendTarget(exam)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      <AlarmClockPlus className="h-3.5 w-3.5" />
                      Gia hạn nhập điểm
                    </button>
                    <button
                      type="button"
                      disabled={busy || exam.status === 'locked'}
                      onClick={() => handleLock(exam)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      {exam.status === 'locked' ? 'Đã chốt sổ' : 'Chốt sổ điểm'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Modal Gia hạn nhập điểm */}
      {extendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Gia hạn nhập điểm
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {extendTarget.assessmentName} · {extendTarget.className}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Chỉ gia hạn khi giáo viên có đơn xin phép nhập bù. Sổ điểm của lớp
              sẽ được MỞ KHÓA lại cho tới hạn mới.
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Hạn nhập điểm mới
              <input
                type="datetime-local"
                value={newDeadline}
                onChange={(event) => setNewDeadline(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleExtend}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {isPending && busyId === extendTarget.assessmentId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlarmClockPlus className="h-4 w-4" />
                )}
                Xác nhận gia hạn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  className,
}: {
  active: boolean
  onClick: () => void
  label: string
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${className} ${
        active ? 'ring-2 ring-indigo-300 ring-offset-1' : 'opacity-80 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  )
}
