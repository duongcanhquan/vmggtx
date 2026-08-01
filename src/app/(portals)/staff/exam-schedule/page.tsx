'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  ClipboardList,
  DoorOpen,
  GripVertical,
  ScrollText,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { FunLoader } from '@/components/shared/FunLoader'
import {
  assignProctor,
  createExamSchedule,
  deleteExamRoom,
  getExamBoard,
  removeProctor,
  resolveGradeReview,
  type ExamBoard,
} from './actions'

// ============================================================
// Portal Khảo thí (/staff/exam-schedule)
// 1. Xếp lịch thi: chọn bài thi + giờ + sức chứa -> TỰ CHIA PHÒNG.
// 2. KÉO THẢ giáo viên (cột trái) vào từng phòng thi để phân công
//    Giám thị (GT1/GT2) - chống trùng ca coi thi ở server.
// 3. Xử lý yêu cầu PHÚC KHẢO của học sinh.
// ============================================================

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ROLE_LABEL: Record<string, string> = {
  proctor_1: 'GT1',
  proctor_2: 'GT2',
}

export default function ExamSchedulePage() {
  const [board, setBoard] = useState<ExamBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  // Form xếp lịch thi
  const [assessmentId, setAssessmentId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [capacity, setCapacity] = useState('30')
  const [roomPrefix, setRoomPrefix] = useState('P.Thi')
  const [creating, setCreating] = useState(false)

  // Drag & drop
  const [draggingTeacherId, setDraggingTeacherId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  // Phúc khảo
  const [reviewScores, setReviewScores] = useState<Record<string, string>>({})
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getExamBoard()
    if (result.error !== undefined) {
      setLoadError(result.error)
    } else {
      setLoadError(null)
      setBoard(result.board)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedAssessment = useMemo(
    () => board?.assessments.find((a) => a.id === assessmentId) ?? null,
    [board, assessmentId]
  )
  const predictedRooms = useMemo(() => {
    const cap = Number(capacity)
    if (!selectedAssessment || !Number.isInteger(cap) || cap < 1) return null
    return Math.max(1, Math.ceil(selectedAssessment.studentCount / cap))
  }, [selectedAssessment, capacity])

  const handleCreate = async () => {
    if (creating) return
    setCreating(true)
    const result = await createExamSchedule(
      assessmentId,
      startTime,
      endTime,
      Number(capacity),
      roomPrefix
    )
    setCreating(false)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Đã xếp lịch thi — tự chia thành ${result.roomCount} phòng. Kéo thả giám thị vào từng phòng.`,
    })
    void load()
  }

  const handleDrop = async (roomId: string) => {
    setDropTargetId(null)
    if (!draggingTeacherId) return
    const teacherId = draggingTeacherId
    setDraggingTeacherId(null)
    const result = await assignProctor(roomId, teacherId)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã phân công giám thị.' })
    void load()
  }

  const handleRemoveProctor = async (proctorId: string) => {
    const result = await removeProctor(proctorId)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    void load()
  }

  const handleDeleteRoom = async (roomId: string) => {
    const result = await deleteExamRoom(roomId)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({ type: 'success', message: 'Đã xóa phòng thi.' })
    void load()
  }

  const handleResolveReview = async (gradeId: string) => {
    const rawScore = (reviewScores[gradeId] ?? '').trim()
    const newScore = rawScore === '' ? null : Number(rawScore)
    if (newScore !== null && !Number.isFinite(newScore)) {
      setToast({ type: 'error', message: 'Điểm mới phải là số.' })
      return
    }
    const result = await resolveGradeReview(gradeId, newScore, reviewNotes[gradeId] ?? '')
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: newScore === null ? 'Đã đóng phúc khảo (giữ nguyên điểm).' : 'Đã cập nhật điểm sau phúc khảo.',
    })
    void load()
  }

  return (
    <div className="space-y-6">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          Portal Khảo thí
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Xếp lịch thi (tự chia phòng), kéo thả phân công giám thị, xử lý phúc khảo.
        </p>
      </div>

      {loading ? (
        <FunLoader />
      ) : loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      ) : board ? (
        <>
          {/* ===== 1. Form xếp lịch thi ===== */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <CalendarPlus className="h-4 w-4 text-primary" aria-hidden="true" />
              Xếp lịch thi mới
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="block text-sm font-medium xl:col-span-2">
                Bài thi (môn / lớp)
                <select
                  value={assessmentId}
                  onChange={(e) => setAssessmentId(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Chọn bài thi —</option>
                  {board.assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.className} ({a.studentCount} HV)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Bắt đầu
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="block text-sm font-medium">
                Kết thúc
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Sức chứa/phòng
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Tên phòng
                  <input
                    type="text"
                    value={roomPrefix}
                    onChange={(e) => setRoomPrefix(e.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !assessmentId}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <DoorOpen className="h-4 w-4" aria-hidden="true" />
                {creating ? 'Đang chia phòng…' : 'Xếp lịch & tự chia phòng'}
              </button>
              {predictedRooms !== null && selectedAssessment && (
                <p className="text-sm text-muted-foreground">
                  {selectedAssessment.studentCount} học viên ÷ {capacity} chỗ ={' '}
                  <strong className="text-foreground">{predictedRooms} phòng thi</strong>
                </p>
              )}
            </div>
          </section>

          {/* ===== 2. Kéo thả giám thị ===== */}
          <section className="grid gap-6 lg:grid-cols-[minmax(0,260px)_1fr]">
            {/* Cột GV kéo được */}
            <div className="h-fit rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
                <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
                Giáo viên ({board.teachers.length})
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kéo thả vào phòng thi để phân công GT1/GT2.
              </p>
              <ul className="mt-3 max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
                {board.teachers.map((teacher) => (
                  <li
                    key={teacher.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingTeacherId(teacher.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDragEnd={() => setDraggingTeacherId(null)}
                    className={`flex cursor-grab items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm active:cursor-grabbing ${
                      draggingTeacherId === teacher.id ? 'opacity-50' : ''
                    }`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{teacher.name}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Lưới phòng thi (drop target) */}
            <div>
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
                <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
                Phòng thi ({board.rooms.length})
              </h2>
              {board.rooms.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
                  Chưa có phòng thi nào. Xếp lịch thi ở khung trên để hệ thống tự chia phòng.
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {board.rooms.map((room) => (
                    <div
                      key={room.id}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDropTargetId(room.id)
                      }}
                      onDragLeave={() => setDropTargetId((prev) => (prev === room.id ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault()
                        void handleDrop(room.id)
                      }}
                      className={`rounded-2xl border-2 bg-surface p-4 shadow-sm transition-colors ${
                        dropTargetId === room.id
                          ? 'border-indigo-400 bg-indigo-50/60'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {room.room} · {room.assessmentName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {room.className} · {formatDateTime(room.startTime)}
                            {room.capacity ? ` · ${room.capacity} chỗ` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          title="Xóa phòng thi"
                          onClick={() => void handleDeleteRoom(room.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {room.proctors.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">
                            Thả giáo viên vào đây (GT1, GT2)
                          </p>
                        ) : (
                          room.proctors.map((proctor) => (
                            <div
                              key={proctor.id}
                              className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-sm"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {ROLE_LABEL[proctor.role]}
                                </span>
                                <span className="truncate text-indigo-900">
                                  {proctor.teacherName}
                                </span>
                              </span>
                              <button
                                type="button"
                                aria-label={`Gỡ ${proctor.teacherName}`}
                                onClick={() => void handleRemoveProctor(proctor.id)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ))
                        )}
                        {room.proctors.length === 1 && (
                          <p className="text-center text-[11px] text-muted-foreground">
                            Thả thêm 1 GV để đủ GT1 + GT2
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ===== 3. Phúc khảo ===== */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <ScrollText className="h-4 w-4 text-primary" aria-hidden="true" />
              Yêu cầu phúc khảo ({board.reviewRequests.length})
            </h2>
            {board.reviewRequests.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Không có yêu cầu phúc khảo nào đang chờ.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {board.reviewRequests.map((req) => (
                  <li key={req.gradeId} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {req.studentName} · {req.assessmentName} · {req.className}
                      </p>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Điểm hiện tại: {req.score}/{req.maxScore}
                      </span>
                    </div>
                    {req.reason && (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        Lý do: {req.reason}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={req.maxScore}
                        step={0.25}
                        value={reviewScores[req.gradeId] ?? ''}
                        onChange={(e) =>
                          setReviewScores((prev) => ({ ...prev, [req.gradeId]: e.target.value }))
                        }
                        placeholder="Điểm mới (bỏ trống = giữ nguyên)"
                        className="min-h-10 w-56 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <input
                        type="text"
                        value={reviewNotes[req.gradeId] ?? ''}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({ ...prev, [req.gradeId]: e.target.value }))
                        }
                        maxLength={200}
                        placeholder="Ghi chú trả lời (tùy chọn)"
                        className="min-h-10 min-w-56 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => void handleResolveReview(req.gradeId)}
                        className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                      >
                        Chốt kết quả
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
