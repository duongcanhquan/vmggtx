'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCheck,
  HeartHandshake,
  Loader2,
  Minus,
  Plus,
  Sparkles,
} from 'lucide-react'
import {
  getBehaviorContext,
  logBehavior,
  type BehaviorLogRow,
} from '../../behavior-actions'

// ============================================================
// ĐIỂM RÈN LUYỆN (Sổ đầu bài) — tích hợp sau phần điểm danh.
// Giáo viên chọn nhanh học sinh -> bấm nút preset ("+5 Hăng hái",
// "-5 Không làm bài tập"...) hoặc nhập tùy ý. Tổng điểm THÁNG rớt
// dưới ngưỡng -> hệ thống tự tạo ticket "Tư vấn Tâm lý Đặc biệt"
// gán cho giáo vụ (xem behavior-actions.ts).
// ============================================================

const PRESETS: { points: number; category: string }[] = [
  { points: 5, category: 'Hăng hái phát biểu' },
  { points: 5, category: 'Tiến bộ' },
  { points: -5, category: 'Không làm bài tập' },
  { points: -5, category: 'Ngủ gật' },
  { points: -10, category: 'Gây rối' },
]

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function BehaviorPanel({
  sessionId,
  students,
}: {
  sessionId: string
  students: { id: string; fullName: string }[]
}) {
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [threshold, setThreshold] = useState(-15)
  const [logs, setLogs] = useState<BehaviorLogRow[]>([])
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customPoints, setCustomPoints] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'alert'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getBehaviorContext(sessionId).then((result) => {
      if (cancelled) return
      if (result.error === undefined) {
        setTotals(result.monthTotals)
        setThreshold(result.threshold)
        setLogs(result.recentLogs)
        setMigrationMissing(result.migrationMissing)
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  function apply(points: number, category: string, description?: string) {
    if (selected.size === 0) {
      setMessage({ type: 'error', text: 'Chọn ít nhất một học sinh trước khi ghi nhận.' })
      return
    }
    setMessage(null)
    const studentIds = [...selected]
    startTransition(async () => {
      const result = await logBehavior({ sessionId, studentIds, points, category, description })
      if (result.error !== undefined) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      setTotals((prev) => ({ ...prev, ...result.monthTotals }))
      // Cập nhật nhật ký cục bộ (không cần round-trip)
      const now = new Date().toISOString()
      const nameById = new Map(students.map((s) => [s.id, s.fullName]))
      setLogs((prev) => [
        ...studentIds.map((id) => ({
          id: `local-${id}-${now}`,
          studentId: id,
          studentName: nameById.get(id) ?? 'Học viên',
          points,
          category,
          description: description?.trim() || null,
          createdAt: now,
        })),
        ...prev,
      ].slice(0, 15))
      setSelected(new Set())

      if (result.alertedStudents.length > 0) {
        setMessage({
          type: 'alert',
          text: `CẢNH BÁO TÂM LÝ: ${result.alertedStudents.join(', ')} đã rớt dưới ngưỡng ${threshold} điểm tháng này — hệ thống đã tự tạo ticket "Tư vấn Tâm lý Đặc biệt" gán cho Giáo vụ để hẹn gặp học sinh.`,
        })
      } else {
        setMessage({
          type: 'success',
          text: `Đã ghi ${points > 0 ? '+' : ''}${points} điểm (${category}) cho ${studentIds.length} học sinh.`,
        })
      }
    })
  }

  function applyCustom() {
    const points = Math.trunc(Number(customPoints))
    if (!Number.isFinite(points) || points === 0) {
      setMessage({ type: 'error', text: 'Điểm tùy chỉnh phải là số nguyên khác 0.' })
      return
    }
    if (!customCategory.trim()) {
      setMessage({ type: 'error', text: 'Nhập hạng mục cho ghi nhận tùy chỉnh.' })
      return
    }
    apply(points, customCategory.trim(), customDescription)
    setCustomPoints('')
    setCustomCategory('')
    setCustomDescription('')
  }

  if (!loaded) return null

  return (
    <div className="bento-card p-5">
      <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
        <Sparkles className="h-4 w-4 text-violet-600" aria-hidden="true" />
        Điểm rèn luyện (thưởng / phạt)
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Chọn học sinh rồi bấm nút nhanh. Tổng điểm tháng dưới{' '}
        <strong>{threshold}</strong> sẽ tự động gửi cảnh báo Tư vấn Tâm lý cho Giáo vụ.
      </p>

      {migrationMissing && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Database chưa chạy migration 038_behavioral_tracking.sql — chưa ghi nhận được hành vi.
        </p>
      )}

      {/* ===== Chọn nhanh học sinh (kèm tổng điểm tháng) ===== */}
      <div className="mt-4 flex flex-wrap gap-2">
        {students.map((student) => {
          const total = totals[student.id] ?? 0
          const isSelected = selected.has(student.id)
          const totalTone =
            total < threshold
              ? 'bg-rose-100 text-rose-700'
              : total < 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
          return (
            <button
              key={student.id}
              type="button"
              onClick={() => toggle(student.id)}
              aria-pressed={isSelected}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-foreground hover:border-primary'
              }`}
            >
              {isSelected && <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              {student.fullName}
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${totalTone}`}>
                {total > 0 ? `+${total}` : total}
              </span>
            </button>
          )
        })}
      </div>

      {/* ===== Nút preset ===== */}
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={`${preset.points}-${preset.category}`}
            type="button"
            disabled={isPending || migrationMissing}
            onClick={() => apply(preset.points, preset.category)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
              preset.points > 0
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            {preset.points > 0 ? (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {preset.points > 0 ? `+${preset.points}` : preset.points} · {preset.category}
          </button>
        ))}
      </div>

      {/* ===== Ghi nhận tùy chỉnh ===== */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Điểm (+/-)
          <input
            type="number"
            min={-100}
            max={100}
            step={1}
            value={customPoints}
            onChange={(e) => setCustomPoints(e.target.value)}
            placeholder="-3"
            className="mt-1 block w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block flex-1 basis-40 text-xs font-medium text-muted-foreground">
          Hạng mục
          <input
            type="text"
            maxLength={100}
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="VD: Đi trễ, Giúp bạn học..."
            className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="block flex-1 basis-52 text-xs font-medium text-muted-foreground">
          Mô tả (tùy chọn)
          <input
            type="text"
            maxLength={500}
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            placeholder="Chi tiết thêm..."
            className="mt-1 block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button
          type="button"
          disabled={isPending || migrationMissing}
          onClick={applyCustom}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          Ghi nhận
        </button>
      </div>

      {message && (
        <p
          role={message.type === 'success' ? 'status' : 'alert'}
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : message.type === 'alert'
                ? 'bg-violet-50 text-violet-800'
                : 'bg-rose-50 text-rose-600'
          }`}
        >
          {message.type === 'alert' && (
            <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {message.text}
        </p>
      )}

      {/* ===== Ghi nhận gần đây trong tháng ===== */}
      {logs.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ghi nhận gần đây (tháng này)
          </p>
          <ul className="mt-2 space-y-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                <span
                  className={`w-10 shrink-0 text-right font-bold tabular-nums ${
                    log.points > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {log.points > 0 ? `+${log.points}` : log.points}
                </span>
                <span className="font-medium">{log.studentName}</span>
                <span className="text-muted-foreground">
                  · {log.category}
                  {log.description ? ` — ${log.description}` : ''}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {timeFmt.format(new Date(log.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
