'use client'

import { useState } from 'react'
import { Star, X } from 'lucide-react'
import { rateIntern, type InternRow } from './actions'

// ============================================================
// Modal "Chấm điểm thực hành" — doanh nghiệp nhập điểm 0-10 và
// nhận xét thái độ nghề nghiệp. Điểm đồng bộ về bảng điểm nghề
// của trung tâm (vocational_records) qua Server Action rateIntern.
// ============================================================

export function RatingModal({
  intern,
  onClose,
  onDone,
}: {
  intern: InternRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [score, setScore] = useState(intern.rating !== null ? String(intern.rating) : '')
  const [feedback, setFeedback] = useState(intern.feedback ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const rating = Number(score)
    if (score.trim() === '' || !Number.isFinite(rating) || rating < 0 || rating > 10) {
      setError('Điểm phải là số từ 0 đến 10.')
      return
    }
    setSending(true)
    setError(null)
    const result = await rateIntern({ internshipId: intern.id, rating, feedback })
    setSending(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone(`Đã chấm ${rating} điểm cho ${intern.studentName} — điểm đã đồng bộ về trung tâm.`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Chấm điểm thực hành</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {intern.studentName}
              {intern.maSV ? ` · ${intern.maSV}` : ''}
              {intern.position ? ` · ${intern.position}` : ''}
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
          Điểm thực hành (0 – 10)
          <input
            type="number"
            min={0}
            max={10}
            step={0.25}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="VD: 8.5"
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="mt-3 block text-sm font-medium">
          Nhận xét thái độ nghề nghiệp
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="VD: Chăm chỉ, đúng giờ, kỹ năng vận hành máy tốt, cần cải thiện giao tiếp nhóm..."
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Star className="h-4 w-4" aria-hidden="true" />
            {sending ? 'Đang lưu...' : 'Lưu điểm & đồng bộ'}
          </button>
        </div>
      </div>
    </div>
  )
}
