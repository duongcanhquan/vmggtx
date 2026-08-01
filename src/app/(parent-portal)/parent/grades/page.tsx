'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Medal } from 'lucide-react'
import {
  getParentGradeReport,
  getParentStudent,
  type ParentGradeReport,
} from '../../actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// Sổ điểm của con - nhóm theo lớp, kèm ĐTB có trọng số.
// ============================================================

function scoreColor(score: number) {
  if (score >= 8) return 'text-emerald-600'
  if (score >= 5) return 'text-sky-600'
  return 'text-rose-600'
}

export default function ParentGradesPage() {
  const router = useRouter()
  const [reports, setReports] = useState<ParentGradeReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const student = await getParentStudent()
      if (cancelled) return
      if (!student) {
        router.replace('/parent/login')
        return
      }
      const data = await getParentGradeReport()
      if (cancelled) return
      setReports(data)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loading) {
    return (
      <FunLoader label="Đang tải sổ điểm…" />
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="font-heading text-xl font-bold tracking-tight">Sổ điểm của con</h1>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-center">
          <Medal className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Chưa có điểm nào.</p>
        </div>
      ) : (
        reports.map((report) => (
          <section
            key={report.class_name}
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border bg-indigo-50/50 px-4 py-3">
              <h2 className="font-heading text-sm font-bold text-foreground">
                {report.class_name}
              </h2>
              {report.average !== null && (
                <span
                  className={`font-heading text-lg font-bold ${scoreColor(report.average)}`}
                >
                  ĐTB {report.average.toFixed(1)}
                </span>
              )}
            </header>
            <ul className="divide-y divide-border">
              {report.items.map((item, index) => (
                <li
                  key={`${report.class_name}-${index}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">{item.assessment_name}</p>
                    <p className="text-xs text-muted-foreground">Hệ số {item.weight}</p>
                  </div>
                  <span className={`font-heading text-base font-bold ${scoreColor(item.score)}`}>
                    {item.score}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
