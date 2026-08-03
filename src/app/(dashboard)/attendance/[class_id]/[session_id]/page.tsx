'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DoorOpen,
  Inbox,
  MessageSquareText,
  NotebookPen,
  Users,
} from 'lucide-react'
import {
  getAttendancePolicy,
  getSessionRoster,
  submitAttendance,
  type AttendancePolicy,
  type AttendanceStatus,
  type AttendanceRecord,
  type DiaryNotes,
  type SessionRoster,
} from '../../actions'
import { FunLoader } from '@/components/shared/FunLoader'
import { BehaviorPanel } from './BehaviorPanel'
import { AiDraftButton } from '@/components/ai/AiDraftButton'
import { useEffectiveOrgId } from '@/lib/ai/useEffectiveOrgId'

// ============================================================
// ĐIỂM DANH + SỔ ĐẦU BÀI ĐIỆN TỬ (/attendance/[class]/[session])
// - Danh sách học viên THẬT từ enrollments (không còn mock).
// - Mỗi học sinh: trạng thái + ô nhận xét riêng (đổ vào Sổ Liên Lạc).
// - Cuối trang: Nhận xét buổi học (nội bộ) + Dặn dò phụ huynh
//   (hiển thị trong Sổ Liên Lạc điện tử của phụ huynh).
// ============================================================

const STATUS_OPTIONS: {
  value: AttendanceStatus
  label: string
  checkedClass: string
}[] = [
  {
    value: 'present',
    label: 'Có mặt',
    checkedClass:
      'peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:text-emerald-700',
  },
  {
    value: 'excused',
    label: 'Vắng phép',
    checkedClass:
      'peer-checked:border-amber-600 peer-checked:bg-amber-50 peer-checked:text-amber-700',
  },
  {
    value: 'absent',
    label: 'Vắng KP',
    checkedClass:
      'peer-checked:border-rose-600 peer-checked:bg-rose-50 peer-checked:text-rose-700',
  },
]

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

type PageProps = {
  params: { class_id: string; session_id: string }
}

export default function AttendanceSessionPage({ params }: PageProps) {
  const currentOrgId = useEffectiveOrgId()
  const [roster, setRoster] = useState<SessionRoster | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [sessionNote, setSessionNote] = useState('')
  const [parentNote, setParentNote] = useState('')
  const [diary, setDiary] = useState<DiaryNotes>({
    actualContent: '',
    attitude: '',
    reminders: '',
  })

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [policy, setPolicy] = useState<AttendancePolicy | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getSessionRoster(params.session_id),
      getAttendancePolicy(params.session_id),
    ]).then(([rosterResult, policyResult]) => {
      if (cancelled) return
      setPolicy(policyResult)
      if (rosterResult.error !== undefined) {
        setLoadError(rosterResult.error)
      } else {
        const data = rosterResult.roster
        setRoster(data)
        setStatuses(
          Object.fromEntries(data.students.map((s) => [s.id, s.savedStatus ?? 'present']))
        )
        setNotes(Object.fromEntries(data.students.map((s) => [s.id, s.savedNote ?? ''])))
        setSessionNote(data.sessionNote ?? '')
        setParentNote(data.parentNote ?? '')
        if (data.diary) setDiary(data.diary)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [params.session_id])

  function handleSave() {
    if (!roster) return
    setMessage(null)
    const records: AttendanceRecord[] = roster.students.map((student) => ({
      studentId: student.id,
      status: statuses[student.id] ?? 'present',
      note: notes[student.id]?.trim() || undefined,
    }))

    startTransition(async () => {
      const result = await submitAttendance(params.session_id, records, {
        sessionNote,
        parentNote,
        diary,
      })
      if ('error' in result && result.error) {
        setMessage({ type: 'error', text: result.error })
      } else if ('success' in result) {
        setMessage({
          type: 'success',
          text:
            result.absentCount > 0
              ? `Đã lưu điểm danh + sổ đầu bài. ${result.absentCount} học viên vắng không phép — hệ thống đang gửi thông báo tự động.`
              : 'Đã lưu điểm danh + sổ đầu bài. Cả lớp không có ai vắng không phép.',
        })
      }
    })
  }

  const absentCount = roster
    ? roster.students.filter((s) => statuses[s.id] === 'absent').length
    : 0

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/attendance"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="bento-icon bg-stone-100 text-stone-700">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              {roster?.className ?? 'Điểm danh buổi học'}
            </h1>
            {roster && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm capitalize text-muted-foreground">
                <span>{dateFormat.format(new Date(roster.startTime))}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {timeFormat.format(new Date(roster.startTime))}–
                  {timeFormat.format(new Date(roster.endTime))}
                </span>
                {roster.room && (
                  <span className="flex items-center gap-1">
                    <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Phòng {roster.room}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  {roster.students.length} học viên
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {policy && (
        <p className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Điểm danh trễ tối đa <strong>{policy.allowLateCheckinMinutes} phút</strong>
          {policy.source === 'inherited' && ' (kế thừa từ cấp trên)'}
          {policy.source === 'default' && ' (mặc định hệ thống)'}.
        </p>
      )}

      {/* ===== Trạng thái tải ===== */}
      {loading && (
        <FunLoader label="Đang tải danh sách lớp…" />
      )}

      {!loading && loadError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{loadError}</p>
        </div>
      )}

      {!loading && roster && roster.students.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <Inbox className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Lớp chưa có học viên đang theo học (enrollments active).
          </p>
        </div>
      )}

      {!loading && roster && roster.students.length > 0 && (
        <>
          {/* ===== Bảng điểm danh + nhận xét từng học sinh ===== */}
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="w-8 px-4 py-3.5 font-semibold">#</th>
                  <th scope="col" className="px-3 py-3.5 font-semibold">Học viên</th>
                  <th scope="col" className="px-3 py-3.5 font-semibold">Trạng thái</th>
                  <th scope="col" className="w-64 px-4 py-3.5 font-semibold">
                    Nhận xét (gửi Sổ Liên Lạc)
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.students.map((student, index) => (
                  <tr key={student.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 align-top text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-foreground">{student.fullName}</p>
                    </td>
                    <td className="px-3 py-3">
                      <fieldset>
                        <legend className="sr-only">
                          Trạng thái điểm danh của {student.fullName}
                        </legend>
                        <div className="flex flex-wrap gap-1.5">
                          {STATUS_OPTIONS.map((option) => (
                            <label key={option.value} className="cursor-pointer">
                              <input
                                type="radio"
                                name={`status-${student.id}`}
                                value={option.value}
                                checked={statuses[student.id] === option.value}
                                onChange={() =>
                                  setStatuses((prev) => ({
                                    ...prev,
                                    [student.id]: option.value,
                                  }))
                                }
                                className="peer sr-only"
                              />
                              <span
                                className={`inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 ${option.checkedClass}`}
                              >
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        maxLength={500}
                        placeholder="VD: Tích cực phát biểu…"
                        aria-label={`Nhận xét ${student.fullName}`}
                        value={notes[student.id] ?? ''}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [student.id]: e.target.value }))
                        }
                        className="min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ===== ĐIỂM RÈN LUYỆN + CẢNH BÁO TÂM LÝ (038) ===== */}
          <BehaviorPanel
            sessionId={params.session_id}
            students={roster.students.map((s) => ({ id: s.id, fullName: s.fullName }))}
          />

          {/* ===== TỔNG KẾT BUỔI HỌC (Sổ đầu bài 033) ===== */}
          <div className="bento-card p-5">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold">
              <BookOpenCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              Tổng kết buổi học (Sổ đầu bài)
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tự động hiển thị lên Sổ Liên Lạc của phụ huynh để nắm tình hình học tập trong ngày.
            </p>

            <div className="mt-4 space-y-4">
              <label htmlFor="diary-content" className="block text-sm font-medium">
                Nội dung thực dạy (so sánh với giáo án)
                <textarea
                  id="diary-content"
                  rows={3}
                  maxLength={2000}
                  placeholder="VD: Dạy hết bài 5 Hàm số bậc hai theo giáo án; phần luyện tập chuyển sang buổi sau vì lớp cần ôn lại kiến thức cũ…"
                  value={diary.actualContent}
                  onChange={(e) =>
                    setDiary((prev) => ({ ...prev, actualContent: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <fieldset>
                <legend className="text-sm font-medium">Đánh giá thái độ lớp</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(
                    [
                      { value: 'good', label: 'Tốt', cls: 'peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:text-emerald-700' },
                      { value: 'fair', label: 'Khá', cls: 'peer-checked:border-indigo-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-700' },
                      { value: 'noisy', label: 'Ồn ào', cls: 'peer-checked:border-amber-600 peer-checked:bg-amber-50 peer-checked:text-amber-700' },
                    ] as const
                  ).map((option) => (
                    <label key={option.value} className="cursor-pointer">
                      <input
                        type="radio"
                        name="diary-attitude"
                        value={option.value}
                        checked={diary.attitude === option.value}
                        onChange={() =>
                          setDiary((prev) => ({
                            ...prev,
                            attitude: prev.attitude === option.value ? '' : option.value,
                          }))
                        }
                        className="peer sr-only"
                      />
                      <span
                        className={`inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${option.cls}`}
                      >
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label htmlFor="diary-reminders" className="block text-sm font-medium">
                <span className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  Nhắc nhở chung
                  <AiDraftButton
                    orgId={currentOrgId}
                    draftMode="contact_book"
                    label="AI soạn"
                    contextHint={`Lớp: ${roster?.className ?? ''}. Soạn nhắc nhở chung cho cả lớp sau buổi học.`}
                    onDraft={(text) =>
                      setDiary((prev) => ({ ...prev, reminders: text.slice(0, 1000) }))
                    }
                  />
                </span>
                <textarea
                  id="diary-reminders"
                  rows={2}
                  maxLength={1000}
                  placeholder="VD: Cả lớp hoàn thành bài tập 3.1–3.5 trước buổi sau; mang máy tính cầm tay…"
                  value={diary.reminders}
                  onChange={(e) =>
                    setDiary((prev) => ({ ...prev, reminders: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>
          </div>

          {/* ===== Sổ đầu bài điện tử ===== */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bento-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label
                  htmlFor="session-note"
                  className="flex items-center gap-2 font-heading text-sm font-bold"
                >
                  <NotebookPen className="h-4 w-4 text-stone-500" aria-hidden="true" />
                  Nhận xét buổi học / lớp
                </label>
                <AiDraftButton
                  orgId={currentOrgId}
                  draftMode="session_note"
                  label="AI soạn"
                  contextHint={`Lớp: ${roster?.className ?? ''}. Soạn nhận xét sổ đầu bài nội bộ.`}
                  onDraft={(text) => setSessionNote(text.slice(0, 1000))}
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sổ đầu bài nội bộ — giáo vụ và quản lý cơ sở xem được.
              </p>
              <textarea
                id="session-note"
                rows={4}
                maxLength={1000}
                placeholder="VD: Lớp học sôi nổi, hoàn thành bài Hàm số. 3 bạn chưa làm bài tập về nhà…"
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="bento-card-gold p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label
                  htmlFor="parent-note"
                  className="flex items-center gap-2 font-heading text-sm font-bold text-[#573412]"
                >
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  Dặn dò phụ huynh
                </label>
                <AiDraftButton
                  orgId={currentOrgId}
                  draftMode="contact_book"
                  label="AI soạn"
                  contextHint={`Lớp: ${roster?.className ?? ''}. Soạn dặn dò phụ huynh cả lớp sau buổi học.`}
                  onDraft={(text) => setParentNote(text.slice(0, 1000))}
                />
              </div>
              <p className="mt-0.5 text-xs text-[#3c3ac0]/80">
                Hiển thị trong Sổ Liên Lạc điện tử của phụ huynh cả lớp.
              </p>
              <textarea
                id="parent-note"
                rows={4}
                maxLength={1000}
                placeholder="VD: Kính nhờ phụ huynh nhắc các em ôn tập chương 2, tuần sau kiểm tra giữa kỳ…"
                value={parentNote}
                onChange={(e) => setParentNote(e.target.value)}
                className="mt-3 w-full rounded-xl border border-amber-200 bg-white/70 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {message && (
            <div
              role={message.type === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
                message.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <p>{message.text}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {isPending ? 'Đang lưu...' : 'Lưu điểm danh + sổ đầu bài'}
            </button>
            {absentCount > 0 && (
              <span className="text-sm font-medium text-rose-700">
                {absentCount} học viên vắng không phép
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
