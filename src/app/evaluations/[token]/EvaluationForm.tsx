'use client'

import { useState } from 'react'
import { CheckCircle2, GraduationCap, Loader2, Lock, Send, Star } from 'lucide-react'
import { submitEvaluation } from '@/app/api/evaluations/actions'

// ============================================================
// Form đánh giá ẩn danh (client) - mobile-first, KHÔNG dùng bảng.
// 3 tiêu chí chấm bằng NGÔI SAO click được (1-5) + ô góp ý tự do.
// ============================================================

const CRITERIA: { key: CriterionKey; label: string; hint: string }[] = [
  { key: 'ratingTeaching', label: 'Kỹ năng sư phạm', hint: 'Giảng dễ hiểu, bài giảng hấp dẫn' },
  { key: 'ratingAttitude', label: 'Sự nhiệt tình', hint: 'Quan tâm, hỗ trợ khi bạn gặp khó' },
  { key: 'ratingPunctuality', label: 'Đúng giờ', hint: 'Vào lớp và trả bài đúng hẹn' },
]

type CriterionKey = 'ratingTeaching' | 'ratingAttitude' | 'ratingPunctuality'

const SCORE_LABELS = ['', 'Rất tệ', 'Chưa tốt', 'Bình thường', 'Tốt', 'Tuyệt vời']

function StarRating({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (score: number) => void
  label: string
}) {
  const [hovered, setHovered] = useState(0)
  const active = hovered || value

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-1.5"
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={`${score} sao - ${SCORE_LABELS[score]}`}
          onClick={() => onChange(score)}
          onMouseEnter={() => setHovered(score)}
          className="cursor-pointer rounded-lg p-1 transition-transform duration-100 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={`h-9 w-9 transition-colors duration-100 ${
              score <= active
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-slate-300'
            }`}
            aria-hidden="true"
          />
        </button>
      ))}
      <span className="ml-1 min-w-20 text-sm font-medium text-muted-foreground">
        {active > 0 ? SCORE_LABELS[active] : ''}
      </span>
    </div>
  )
}

export function EvaluationForm({
  token,
  campaignName,
  className,
  teacherName,
}: {
  token: string
  campaignName: string
  className: string
  teacherName: string
}) {
  const [ratings, setRatings] = useState<Record<CriterionKey, number>>({
    ratingTeaching: 0,
    ratingAttitude: 0,
    ratingPunctuality: 0,
  })
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allRated = Object.values(ratings).every((score) => score > 0)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!allRated) {
      setError('Vui lòng chấm sao đủ cả 3 tiêu chí trước khi gửi.')
      return
    }
    setError(null)
    setSubmitting(true)
    const result = await submitEvaluation(token, {
      ratingTeaching: ratings.ratingTeaching,
      ratingAttitude: ratings.ratingAttitude,
      ratingPunctuality: ratings.ratingPunctuality,
      feedbackText: feedback.trim(),
    })
    setSubmitting(false)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden="true" />
        <h1 className="font-heading text-lg font-bold text-emerald-900">
          Cảm ơn bạn đã đánh giá!
        </h1>
        <p className="text-sm leading-relaxed text-emerald-800">
          Ý kiến đã được ghi nhận ẩn danh. Bạn có thể đóng trang này.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      {/* ===== Đối tượng được đánh giá (KHÔNG hiện tên học sinh) ===== */}
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-heading text-lg font-bold leading-snug text-foreground">
            Đánh giá thầy/cô {teacherName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lớp {className} · {campaignName}
          </p>
        </div>
      </div>

      <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        Khảo sát 100% ẩn danh — nhà trường và thầy/cô KHÔNG biết ai đã gửi đánh giá nào.
      </p>

      {/* ===== 3 tiêu chí chấm sao ===== */}
      <div className="space-y-5">
        {CRITERIA.map((criterion) => (
          <div key={criterion.key}>
            <p className="text-sm font-semibold text-foreground">{criterion.label}</p>
            <p className="text-xs text-muted-foreground">{criterion.hint}</p>
            <div className="mt-1.5">
              <StarRating
                label={criterion.label}
                value={ratings[criterion.key]}
                onChange={(score) =>
                  setRatings((prev) => ({ ...prev, [criterion.key]: score }))
                }
              />
            </div>
          </div>
        ))}
      </div>

      {/* ===== Góp ý tự do ===== */}
      <div>
        <label
          htmlFor="feedback"
          className="text-sm font-semibold text-foreground"
        >
          Góp ý cho thầy/cô{' '}
          <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
        </label>
        <textarea
          id="feedback"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Nhập góp ý…"
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang gửi…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden="true" />
            Gửi đánh giá
          </>
        )}
      </button>
    </form>
  )
}
