'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Star, Users } from 'lucide-react'
import { getB2BBoard, type B2BBoard, type InternRow } from '../actions'
import { RatingModal } from '../RatingModal'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'

// ============================================================
// DANH SÁCH THỰC TẬP SINH (/b2b/interns)
// Bảng học viên đang thực tập tại doanh nghiệp (lọc theo
// enterprise_id của tài khoản qua RLS). Nút "Chấm điểm thực hành"
// mở form nhập điểm 0-10 + nhận xét — tự đồng bộ về trung tâm.
// ============================================================

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const STATUS_META: Record<InternRow['status'], { label: string; className: string }> = {
  active: { label: 'Đang thực tập', className: 'bg-emerald-50 text-emerald-700' },
  completed: { label: 'Hoàn thành', className: 'bg-sky-50 text-sky-700' },
  terminated: { label: 'Kết thúc sớm', className: 'bg-rose-50 text-rose-600' },
}

export default function B2BInternsPage() {
  const [board, setBoard] = useState<B2BBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState<InternRow | null>(null)
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
      <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
        {error}
      </p>
    )
  }
  if (!board) return <FunLoader />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-heading text-2xl font-bold">Thực tập sinh</h1>
          <p className="text-sm text-muted-foreground">
            {board.stats.total} học viên · {board.stats.rated} đã được chấm điểm
          </p>
        </div>
      </div>

      {board.migrationMissing && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Database chưa chạy migration 037_b2b_portal.sql — chưa có dữ liệu thực tập sinh.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Học viên</th>
              <th className="px-4 py-3 font-semibold">Vị trí</th>
              <th className="px-4 py-3 font-semibold">Thời gian</th>
              <th className="px-4 py-3 font-semibold">Trạng thái</th>
              <th className="px-4 py-3 font-semibold">Điểm</th>
              <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {board.interns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Chưa có học viên nào thực tập tại doanh nghiệp của bạn.
                </td>
              </tr>
            )}
            {board.interns.map((intern) => {
              const status = STATUS_META[intern.status]
              return (
                <tr key={intern.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{intern.studentName}</p>
                    {intern.maSV && (
                      <p className="text-xs text-muted-foreground">{intern.maSV}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {intern.position ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {dateFmt.format(new Date(intern.startDate))}
                    {intern.endDate ? ` → ${dateFmt.format(new Date(intern.endDate))}` : ' → nay'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {intern.rating !== null ? (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                        <Star className="h-4 w-4" aria-hidden="true" />
                        {intern.rating}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setRating(intern)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <Star className="h-3.5 w-3.5" aria-hidden="true" />
                      {intern.rating !== null ? 'Sửa điểm' : 'Chấm điểm thực hành'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rating && (
        <RatingModal
          intern={rating}
          onClose={() => setRating(null)}
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
