'use client'

import { useEffect, useState } from 'react'
import { Medal } from 'lucide-react'
import { getMyGrades, type PortalClassGrades } from '../actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Báo cáo điểm (/grades - Cổng Học sinh)
// Toàn bộ điểm của học sinh, NHÓM theo lớp, kèm TB dự kiến.
// ============================================================

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

export default function StudentGradesPage() {
  const [classGrades, setClassGrades] = useState<PortalClassGrades[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyGrades().then((result) => {
      setClassGrades(result.data)
      setIsDemo(result.demo)
      setLoading(false)
    })
  }, [])

  return (
    <div className="space-y-6">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
                    <div>
                      <p className="font-medium text-foreground">{item.assessment_name}</p>
                      <p className="text-xs text-muted-foreground">Hệ số {item.weight}</p>
                    </div>
                    <p className="font-semibold text-foreground">
                      {item.score}
                      <span className="text-xs font-normal text-muted-foreground">
                        /{item.max_score}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
