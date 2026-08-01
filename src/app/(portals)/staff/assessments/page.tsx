'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  FileStack,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react'
import {
  addExamVariant,
  deleteExamVariant,
  getAssessmentOps,
  resolveReExamRequest,
  type AssessmentOpsBoard,
  type ReExamRequestRow,
} from './actions'
import { assignProctor, removeProctor } from '../exam-schedule/actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'

// ============================================================
// PORTAL KHẢO THÍ CHUYÊN SÂU (/staff/assessments) - migration 036
// 1) Đơn thi lại: "Duyệt & Xếp lịch" tự sinh buổi thi (assessment)
//    mới, gom các đơn cùng bài về chung một buổi.
// 2) Giám thị: form đa chọn gán GV vào từng phòng thi (GT1/GT2).
// 3) Mã đề thi: quản lý Đề 01/Đề 02... kèm link file đề.
// ============================================================

const STATUS_META: Record<
  ReExamRequestRow['status'],
  { label: string; className: string }
> = {
  pending: { label: 'Chờ duyệt', className: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Đã duyệt', className: 'bg-indigo-50 text-indigo-700' },
  rescheduled: { label: 'Đã xếp lịch thi lại', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Từ chối', className: 'bg-rose-50 text-rose-600' },
}

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

// ---------- Modal xử lý đơn thi lại ----------
function DecisionModal({
  request,
  onClose,
  onDone,
}: {
  request: ReExamRequestRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [note, setNote] = useState('')
  const [sending, setSending] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = async (action: 'approve' | 'reject') => {
    setSending(action)
    setError(null)
    const result = await resolveReExamRequest(request.id, action, note)
    setSending(null)
    if (result.error !== undefined) {
      setError(result.error)
      return
    }
    onDone(
      action === 'approve'
        ? `Đã duyệt — hệ thống sinh buổi thi "${result.newAssessmentName ?? 'Thi lại'}" cho học sinh.`
        : 'Đã từ chối đơn thi lại.'
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Xử lý đơn thi lại</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {request.studentName} · {request.assessmentName} ({request.className})
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

        <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
          <span className="font-semibold">Lý do của học sinh:</span> {request.reason}
        </p>

        <label className="mt-3 block text-sm font-medium">
          Ghi chú xử lý <span className="text-muted-foreground">(bắt buộc khi từ chối)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="VD: Xếp thi lại tuần sau / Không đủ điều kiện vì..."
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void decide('approve')}
            disabled={sending !== null}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {sending === 'approve' ? 'Đang xếp lịch…' : 'Duyệt & Xếp lịch'}
          </button>
          <button
            type="button"
            onClick={() => void decide('reject')}
            disabled={sending !== null}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            {sending === 'reject' ? 'Đang từ chối…' : 'Từ chối'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AssessmentOpsPage() {
  const [board, setBoard] = useState<AssessmentOpsBoard | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [decisionRequest, setDecisionRequest] = useState<ReExamRequestRow | null>(null)

  // Form mã đề
  const [variantAssessment, setVariantAssessment] = useState('')
  const [variantCode, setVariantCode] = useState('')
  const [variantUrl, setVariantUrl] = useState('')
  const [addingVariant, setAddingVariant] = useState(false)

  // Form giám thị: chọn GV theo từng phòng
  const [proctorPick, setProctorPick] = useState<Record<string, string>>({})
  const [assigningRoom, setAssigningRoom] = useState<string | null>(null)

  const load = () => {
    getAssessmentOps().then((result) => {
      if (result.error !== undefined) {
        setLoadError(result.error)
        return
      }
      setBoard(result)
    })
  }

  useEffect(load, [])

  const pendingCount = useMemo(
    () => board?.requests.filter((request) => request.status === 'pending').length ?? 0,
    [board]
  )

  const handleAddVariant = async () => {
    setAddingVariant(true)
    const result = await addExamVariant(variantAssessment, variantCode, variantUrl)
    setAddingVariant(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã tạo mã đề "${variantCode.trim()}".` })
    setVariantCode('')
    setVariantUrl('')
    load()
  }

  const handleAssignProctor = async (roomId: string) => {
    const teacherId = proctorPick[roomId]
    if (!teacherId) {
      setToast({ type: 'error', message: 'Chọn giáo viên trước khi gán giám thị.' })
      return
    }
    setAssigningRoom(roomId)
    const result = await assignProctor(roomId, teacherId)
    setAssigningRoom(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã gán giám thị vào phòng thi.' })
    load()
  }

  const handleRemoveProctor = async (proctorId: string) => {
    const result = await removeProctor(proctorId)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    load()
  }

  const handleDeleteVariant = async (variantId: string, code: string) => {
    const result = await deleteExamVariant(variantId)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: `Đã xóa mã đề "${code}".` })
    load()
  }

  if (loadError) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {loadError}
      </p>
    )
  }
  if (!board) return <FunLoader label="Đang mở Portal Khảo thí…" />

  const variantsOfSelected = board.variants.filter(
    (variant) => !variantAssessment || variant.assessmentId === variantAssessment
  )

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
          Khảo thí chuyên sâu
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          Tổ chức thi · Giám thị · Thi lại
        </h1>
        {board.migrationMissing && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Database chưa chạy migration 036 — mục Mã đề thi và Đơn thi lại sẽ trống cho tới
            khi migration được áp dụng.
          </p>
        )}
      </div>

      {/* ===== 1. ĐƠN THI LẠI ===== */}
      <section aria-label="Đơn xin thi lại" className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <RefreshCcw className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold">Đơn xin thi lại / phúc khảo</h2>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              {pendingCount} chờ duyệt
            </span>
          )}
        </div>

        {board.requests.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có đơn nào — đơn của học sinh gửi từ trang Kết quả học tập sẽ hiện ở đây.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {board.requests.map((request) => {
              const meta = STATUS_META[request.status]
              return (
                <li
                  key={request.id}
                  className="flex flex-col gap-2 rounded-xl border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {request.studentName}
                      <span className="font-normal text-muted-foreground">
                        {' '}· {request.assessmentName} ({request.className})
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Lý do: {request.reason}
                    </p>
                    {request.newAssessmentName && (
                      <p className="mt-0.5 text-xs font-medium text-emerald-700">
                        → Buổi thi lại: {request.newAssessmentName}
                      </p>
                    )}
                    {request.decisionNote && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Ghi chú xử lý: {request.decisionNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
                      {meta.label}
                    </span>
                    {request.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => setDecisionRequest(request)}
                        className="flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Xử lý
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ===== 2. GIÁM THỊ THEO PHÒNG THI ===== */}
      <section aria-label="Phân công giám thị" className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold">Phân công giám thị</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Phòng thi lấy từ Lịch thi (mục &quot;Lịch thi &amp; Giám thị&quot;). Chọn giáo viên
          rồi bấm gán — hệ thống tự xếp Giám thị 1/Giám thị 2 và chặn trùng lịch coi thi.
        </p>

        {board.rooms.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có phòng thi sắp diễn ra — xếp lịch thi trước ở mục &quot;Lịch thi &amp; Giám thị&quot;.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {board.rooms.map((room) => (
              <div key={room.id} className="rounded-xl border border-border p-3.5">
                <p className="text-sm font-semibold text-foreground">
                  {room.room}
                  <span className="font-normal text-muted-foreground"> · {room.assessmentName}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {timeFmt.format(new Date(room.startTime))} → {timeFmt.format(new Date(room.endTime))}
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {room.proctors.length === 0 && (
                    <span className="text-xs italic text-muted-foreground">Chưa có giám thị</span>
                  )}
                  {room.proctors.map((proctor) => (
                    <span
                      key={proctor.id}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                    >
                      {proctor.teacherName} · {proctor.role}
                      <button
                        type="button"
                        aria-label={`Gỡ ${proctor.teacherName}`}
                        onClick={() => void handleRemoveProctor(proctor.id)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-100"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <select
                    value={proctorPick[room.id] ?? ''}
                    onChange={(e) =>
                      setProctorPick((prev) => ({ ...prev, [room.id]: e.target.value }))
                    }
                    aria-label="Chọn giáo viên làm giám thị"
                    className="min-h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Chọn giáo viên —</option>
                    {board.teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleAssignProctor(room.id)}
                    disabled={assigningRoom === room.id}
                    className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    {assigningRoom === room.id ? 'Đang gán…' : 'Gán'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== 3. MÃ ĐỀ THI ===== */}
      <section aria-label="Mã đề thi" className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <FileStack className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <h2 className="font-heading text-lg font-bold">Mã đề thi</h2>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
          <select
            value={variantAssessment}
            onChange={(e) => setVariantAssessment(e.target.value)}
            aria-label="Chọn bài kiểm tra"
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Chọn bài kiểm tra —</option>
            {board.assessments.map((assessment) => (
              <option key={assessment.id} value={assessment.id}>
                {assessment.name} · {assessment.className}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={variantCode}
            onChange={(e) => setVariantCode(e.target.value)}
            placeholder="VD: Đề 01"
            aria-label="Mã đề"
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            type="url"
            value={variantUrl}
            onChange={(e) => setVariantUrl(e.target.value)}
            placeholder="Link file đề (tùy chọn)"
            aria-label="Link file đề"
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={() => void handleAddVariant()}
            disabled={addingVariant || !variantAssessment || !variantCode.trim()}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {addingVariant ? 'Đang tạo…' : 'Tạo mã đề'}
          </button>
        </div>

        {variantsOfSelected.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Chưa có mã đề nào{variantAssessment ? ' cho bài kiểm tra này' : ''}.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {variantsOfSelected.map((variant) => (
              <li
                key={variant.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {variant.variantCode}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {variant.assessmentName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {variant.fileUrl && (
                    <a
                      href={variant.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Mở file đề"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Xóa mã đề ${variant.variantCode}`}
                    onClick={() => void handleDeleteVariant(variant.id, variant.variantCode)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decisionRequest && (
        <DecisionModal
          request={decisionRequest}
          onClose={() => setDecisionRequest(null)}
          onDone={(message) => {
            setToast({ type: 'success', message })
            load()
          }}
        />
      )}
    </div>
  )
}
