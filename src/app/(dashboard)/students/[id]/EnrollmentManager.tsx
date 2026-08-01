'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  GraduationCap,
  PauseCircle,
  PlayCircle,
  Plus,
  UserRoundX,
  Users,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  enrollStudentToClass,
  getEnrollmentPanel,
  transferEnrollment,
  updateEnrollmentStatus,
  type EnrollmentPanel,
  type EnrollmentRow,
} from './enrollment-actions'

// ============================================================
// QUẢN LÝ GHI DANH (tab Học tập, Student 360)
// Ghi danh vào lớp / chuyển lớp / bảo lưu / thôi học / học lại.
// Hiển thị sĩ số lớp (đang học / tối đa) để giáo vụ ra quyết định.
// ============================================================

const STATUS_META: Record<
  EnrollmentRow['status'],
  { label: string; className: string }
> = {
  active: { label: 'Đang học', className: 'bg-emerald-50 text-emerald-700' },
  paused: { label: 'Bảo lưu', className: 'bg-amber-50 text-amber-700' },
  dropped: { label: 'Thôi học', className: 'bg-rose-50 text-rose-700' },
  completed: { label: 'Hoàn thành', className: 'bg-sky-50 text-sky-700' },
}

export function EnrollmentManager({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState<EnrollmentPanel | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)

  // Form ghi danh mới
  const [newClassId, setNewClassId] = useState('')
  // Hành động trên từng dòng: đổi trạng thái / chuyển lớp
  const [actionRow, setActionRow] = useState<{
    enrollmentId: string
    mode: 'status' | 'transfer'
    status?: EnrollmentRow['status']
  } | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [transferClassId, setTransferClassId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getEnrollmentPanel(studentId)
    if (result.error === undefined) setPanel(result.panel)
    setLoading(false)
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = async (fn: () => Promise<{ error?: string }>, okMessage: string) => {
    if (busy) return
    setBusy(true)
    const result = await fn()
    setBusy(false)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: okMessage })
    setActionRow(null)
    setActionNote('')
    setTransferClassId('')
    setNewClassId('')
    void load()
  }

  if (loading) return <FunLoader />
  if (!panel) return null

  const activeClassIds = new Set(
    panel.enrollments.filter((e) => e.status === 'active').map((e) => e.classId)
  )
  const enrollableClasses = panel.classes.filter((c) => !activeClassIds.has(c.id))

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <h2 className="flex items-center gap-2 font-heading text-base font-bold">
        <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
        Quản lý ghi danh
      </h2>

      {/* ===== Ghi danh vào lớp mới ===== */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={newClassId}
          onChange={(e) => setNewClassId(e.target.value)}
          className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">— Chọn lớp để ghi danh —</option>
          {enrollableClasses.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name} ({cls.activeCount}
              {cls.maxStudents != null ? `/${cls.maxStudents}` : ''} HV)
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !newClassId}
          onClick={() =>
            void runAction(
              () => enrollStudentToClass(studentId, newClassId),
              'Đã ghi danh vào lớp.'
            )
          }
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ghi danh
        </button>
      </div>

      {/* ===== Danh sách ghi danh + hành động ===== */}
      {panel.enrollments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Chưa có ghi danh nào.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {panel.enrollments.map((row) => {
            const meta = STATUS_META[row.status]
            const isActing = actionRow?.enrollmentId === row.id
            return (
              <li key={row.id} className="rounded-xl border border-border bg-background p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm font-semibold">{row.className}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.status === 'active' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActionRow({ enrollmentId: row.id, mode: 'transfer' })
                            setActionNote('')
                          }}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          Chuyển lớp
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionRow({ enrollmentId: row.id, mode: 'status', status: 'paused' })
                            setActionNote('')
                          }}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        >
                          <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Bảo lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionRow({ enrollmentId: row.id, mode: 'status', status: 'completed' })
                            setActionNote('')
                          }}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hoàn thành
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionRow({ enrollmentId: row.id, mode: 'status', status: 'dropped' })
                            setActionNote('')
                          }}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          <UserRoundX className="h-3.5 w-3.5" aria-hidden="true" />
                          Thôi học
                        </button>
                      </>
                    )}
                    {(row.status === 'paused' || row.status === 'dropped') && (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            () =>
                              updateEnrollmentStatus(studentId, row.id, 'active', 'Học lại'),
                            'Đã kích hoạt học lại.'
                          )
                        }
                        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Học lại
                      </button>
                    )}
                  </div>
                </div>

                {row.statusNote && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Ghi chú: {row.statusNote}</p>
                )}

                {/* ===== Form hành động inline ===== */}
                {isActing && (
                  <div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3">
                    {actionRow.mode === 'transfer' && (
                      <select
                        value={transferClassId}
                        onChange={(e) => setTransferClassId(e.target.value)}
                        className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">— Chọn lớp chuyển đến —</option>
                        {panel.classes
                          .filter((c) => c.id !== row.classId)
                          .map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.name} ({cls.activeCount}
                              {cls.maxStudents != null ? `/${cls.maxStudents}` : ''} HV)
                            </option>
                          ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      maxLength={300}
                      placeholder={
                        actionRow.mode === 'transfer'
                          ? 'Lý do chuyển lớp (tùy chọn)...'
                          : 'Lý do (bắt buộc với bảo lưu / thôi học)...'
                      }
                      className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (actionRow.mode === 'transfer') {
                            void runAction(
                              () =>
                                transferEnrollment(studentId, row.id, transferClassId, actionNote),
                              'Đã chuyển lớp thành công.'
                            )
                          } else if (actionRow.status) {
                            void runAction(
                              () =>
                                updateEnrollmentStatus(
                                  studentId,
                                  row.id,
                                  actionRow.status as EnrollmentRow['status'],
                                  actionNote
                                ),
                              'Đã cập nhật trạng thái.'
                            )
                          }
                        }}
                        className="min-h-9 flex-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        Xác nhận
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionRow(null)}
                        className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
