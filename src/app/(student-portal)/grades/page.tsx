'use client'

import { useEffect, useState } from 'react'
import { FileSearch, Medal, RefreshCcw, Send, X } from 'lucide-react'
import {
  getMyGrades,
  requestGradeReview,
  requestReExamination,
  type PortalClassGrades,
  type PortalGradeItem,
} from '../actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'

// ============================================================
// Báo cáo điểm (/grades - Cổng Học sinh)
// Toàn bộ điểm của học sinh, NHÓM theo lớp, kèm TB dự kiến.
// + PHÚC KHẢO (migration 031): nút "Yêu cầu thi lại / Phúc khảo"
//   ngay trên từng dòng điểm -> trạng thái 'Đang phúc khảo'.
// + ĐĂNG KÝ THI LẠI (migration 036): điểm DƯỚI TRUNG BÌNH hiện nút
//   "Đăng ký thi lại" -> insert re_examination_requests, Khảo thí
//   duyệt & xếp lịch ở /staff/assessments.
// ============================================================

/** Điểm dưới trung bình (< 50% thang điểm) -> đủ điều kiện thi lại */
const isBelowAverage = (item: PortalGradeItem) => item.score < item.max_score / 2

const RE_EXAM_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Đơn thi lại: chờ duyệt', className: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Đơn thi lại: đã duyệt', className: 'bg-indigo-50 text-indigo-700' },
  rescheduled: { label: 'Đã xếp lịch thi lại', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Đơn thi lại: từ chối', className: 'bg-rose-50 text-rose-600' },
}

function averageColor(avg: number | null) {
  if (avg === null) return 'text-muted-foreground'
  if (avg >= 8) return 'text-emerald-600'
  if (avg >= 6.5) return 'text-indigo-600'
  if (avg >= 5) return 'text-amber-600'
  return 'text-rose-600'
}

function averageLabel(avg: number | null) {
  if (avg === null) return 'Chưa có điểm'
  if (avg >= 8) return 'Giỏi'
  if (avg >= 6.5) return 'Khá'
  if (avg >= 5) return 'Trung bình'
  return 'Cần cố gắng'
}

// ---------- Modal gửi yêu cầu phúc khảo ----------
function ReviewRequestModal({
  item,
  onClose,
  onDone,
}: {
  item: PortalGradeItem
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!item.grade_id) return
    setSending(true)
    setError(null)
    const result = await requestGradeReview(item.grade_id, reason)
    setSending(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone('Đã gửi yêu cầu phúc khảo — điểm chuyển trạng thái "Đang phúc khảo".')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Yêu cầu thi lại / Phúc khảo</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {item.assessment_name} · Điểm hiện tại: {item.score}/{item.max_score}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium">
          Lý do phúc khảo
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="VD: Em nghĩ câu 5 phần tự luận chưa được chấm..."
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Gửi xong → điểm hiện &quot;Đang phúc khảo&quot; tới khi có kết quả.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || reason.trim().length < 5}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {sending ? 'Đang gửi…' : 'Gửi yêu cầu phúc khảo'}
        </button>
      </div>
    </div>
  )
}

// ---------- Modal đăng ký thi lại (điểm dưới trung bình) ----------
function ReExamModal({
  item,
  onClose,
  onDone,
}: {
  item: PortalGradeItem
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!item.assessment_id) return
    setSending(true)
    setError(null)
    const result = await requestReExamination(item.assessment_id, reason)
    setSending(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone('Đã gửi đơn đăng ký thi lại — chờ Khảo thí duyệt và xếp lịch.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Đăng ký thi lại</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {item.assessment_name} · Điểm hiện tại: {item.score}/{item.max_score}
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium">
          Lý do đăng ký thi lại
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="VD: Hôm thi em bị ốm, mong được thi lại để cải thiện điểm..."
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          Khảo thí sẽ duyệt đơn và tự động xếp một buổi thi lại. Kết quả hiển thị ngay tại
          trang này.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || reason.trim().length < 5}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          {sending ? 'Đang gửi…' : 'Gửi đơn đăng ký thi lại'}
        </button>
      </div>
    </div>
  )
}

export default function StudentGradesPage() {
  const [classGrades, setClassGrades] = useState<PortalClassGrades[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reviewItem, setReviewItem] = useState<PortalGradeItem | null>(null)
  const [reExamItem, setReExamItem] = useState<PortalGradeItem | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = () => {
    getMyGrades().then((result) => {
      setClassGrades(result.data)
      setIsDemo(result.demo)
      setLoading(false)
    })
  }

  useEffect(load, [])

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <h1 className="font-heading text-2xl font-bold tracking-tight">
        Kết quả học tập
      </h1>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị điểm demo.
        </p>
      )}

      {loading ? (
        <FunLoader label="Đang tải bảng điểm…" />
      ) : classGrades.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
          <Medal className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Bạn chưa có điểm nào.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classGrades.map((group) => (
            <section
              key={group.class_id}
              aria-label={`Điểm lớp ${group.class_name}`}
              className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              {/* Header lớp + TB dự kiến */}
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-heading text-base font-bold text-foreground">
                  {group.class_name}
                </h2>
                <div className="shrink-0 text-right">
                  <p className={`font-heading text-2xl font-bold ${averageColor(group.average)}`}>
                    {group.average === null ? '—' : group.average.toFixed(2)}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    TB dự kiến · {averageLabel(group.average)}
                  </p>
                </div>
              </div>

              {/* Danh sách bài kiểm tra */}
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                {group.items.map((item, index) => (
                  <li
                    key={`${group.class_id}-${index}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{item.assessment_name}</p>
                      <p className="text-xs text-muted-foreground">Hệ số {item.weight}</p>
                      {item.review_status === 'under_review' && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          <FileSearch className="h-3 w-3" aria-hidden="true" />
                          Đang phúc khảo
                        </span>
                      )}
                      {item.review_status === 'resolved' && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Đã có kết quả phúc khảo
                        </span>
                      )}
                      {item.re_exam_status && RE_EXAM_BADGE[item.re_exam_status] && (
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${RE_EXAM_BADGE[item.re_exam_status].className}`}
                        >
                          <RefreshCcw className="h-3 w-3" aria-hidden="true" />
                          {RE_EXAM_BADGE[item.re_exam_status].label}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {item.score}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{item.max_score}
                        </span>
                      </p>
                      {/* Điểm DƯỚI TRUNG BÌNH -> được đăng ký thi lại */}
                      {item.assessment_id &&
                        isBelowAverage(item) &&
                        item.re_exam_status !== 'pending' &&
                        item.re_exam_status !== 'rescheduled' && (
                          <button
                            type="button"
                            onClick={() => setReExamItem(item)}
                            className="flex min-h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            Đăng ký thi lại
                          </button>
                        )}
                      {item.grade_id && item.review_status !== 'under_review' && (
                        <button
                          type="button"
                          title="Yêu cầu thi lại / Phúc khảo"
                          onClick={() => setReviewItem(item)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <FileSearch className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {reviewItem && (
        <ReviewRequestModal
          item={reviewItem}
          onClose={() => setReviewItem(null)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            load()
          }}
        />
      )}

      {reExamItem && (
        <ReExamModal
          item={reExamItem}
          onClose={() => setReExamItem(null)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            load()
          }}
        />
      )}
    </div>
  )
}
