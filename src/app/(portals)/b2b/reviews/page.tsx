'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, PenSquare, Star } from 'lucide-react'
import { getB2BBoard, type B2BBoard, type InternRow } from '../actions'
import { RatingModal } from '../RatingModal'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'

// ============================================================
// ĐÁNH GIÁ THỰC TẬP SINH (/b2b/reviews)
// Lịch sử các đánh giá đã chấm (điểm + nhận xét thái độ nghề
// nghiệp). Có thể sửa lại — điểm mới tiếp tục đồng bộ về trung tâm.
// ============================================================

const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function ratingTone(rating: number): string {
  if (rating >= 8) return 'bg-emerald-50 text-emerald-700'
  if (rating >= 5) return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-600'
}

export default function B2BReviewsPage() {
  const [board, setBoard] = useState<B2BBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<InternRow | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const load = useCallback(() => {
    getB2BBoard().then((result) => {
      if (result.error !== undefined) setError(result.error)
      else setBoard(result)
    })
  }, [])

  useEffect(load, [load])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
          {error}
        </p>
      </div>
    )
  }
  if (!board) return <FunLoader />

  const reviewed = board.interns.filter((intern) => intern.rating !== null)

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Star className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-heading text-2xl font-bold">Đánh giá đã chấm</h1>
          <p className="text-sm text-muted-foreground">
            {reviewed.length} đánh giá
            {board.stats.avgRating !== null
              ? ` · điểm trung bình ${board.stats.avgRating.toFixed(2)}`
              : ''}
          </p>
        </div>
      </div>

      {board.migrationMissing && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Database chưa chạy migration 037_b2b_portal.sql — chưa có dữ liệu đánh giá.
        </p>
      )}

      {reviewed.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Chưa có đánh giá nào. Vào mục &quot;Thực tập sinh&quot; để chấm điểm thực hành.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviewed.map((intern) => (
            <li key={intern.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {intern.studentName}
                    {intern.maSV && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {intern.maSV}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {intern.position ?? 'Thực tập sinh'}
                    {intern.ratedAt
                      ? ` · chấm lúc ${dateTimeFmt.format(new Date(intern.ratedAt))}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-bold ${ratingTone(intern.rating ?? 0)}`}
                  >
                    <Star className="h-4 w-4" aria-hidden="true" />
                    {intern.rating}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(intern)}
                    aria-label={`Sửa đánh giá của ${intern.studentName}`}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted"
                  >
                    <PenSquare className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {intern.feedback && (
                <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
                  {intern.feedback}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RatingModal
          intern={editing}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            load()
          }}
        />
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
