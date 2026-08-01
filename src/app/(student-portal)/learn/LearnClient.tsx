'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlarmClock,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Download,
  FileQuestion,
  FileUp,
  Inbox,
  Loader2,
  Paperclip,
  PlayCircle,
  Send,
  X,
  XCircle,
} from 'lucide-react'
import { formatFileSize, uploadFilesToR2, type AttachmentMeta } from '@/components/lms/uploadFiles'
import {
  getLearnDownloadUrl,
  getQuizForTaking,
  presignSubmissionUpload,
  submitAssignment,
  submitQuiz,
  type LearnAssignment,
  type LearnData,
  type LearnLesson,
  type LearnQuiz,
  type QuizTakingState,
} from './actions'

// ============================================================
// LMS Học viên - mobile-first. Chip chọn lớp + 3 tab.
// ============================================================

type Tab = 'lessons' | 'assignments' | 'quizzes'

const TABS: { id: Tab; label: string; icon: typeof BookOpenCheck }[] = [
  { id: 'lessons', label: 'Bài học', icon: BookOpenCheck },
  { id: 'assignments', label: 'Bài tập', icon: ClipboardList },
  { id: 'quizzes', label: 'Kiểm tra', icon: FileQuestion },
]

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Chuyển link YouTube thường -> link nhúng (embed) */
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v'))
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`
    return null
  } catch {
    return null
  }
}

export function LearnClient({ data }: { data: LearnData }) {
  const router = useRouter()
  const [classId, setClassId] = useState(data.classes[0]?.classId ?? '')
  const [tab, setTab] = useState<Tab>('lessons')
  const [lessonOpen, setLessonOpen] = useState<LearnLesson | null>(null)
  const [assignmentOpen, setAssignmentOpen] = useState<LearnAssignment | null>(null)
  const [quizOpen, setQuizOpen] = useState<LearnQuiz | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const cls = useMemo(
    () => data.classes.find((c) => c.classId === classId) ?? data.classes[0],
    [data, classId]
  )

  function notify(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4500)
  }

  async function handleDownload(kind: 'lesson' | 'assignment' | 'my-submission', recordId: string, f: AttachmentMeta) {
    const res = await getLearnDownloadUrl({ kind, recordId, key: f.key, fileName: f.name })
    if ('error' in res) return notify('error', res.error)
    window.open(res.url, '_blank')
  }

  if (!cls) return null

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-bold tracking-tight sm:text-2xl">Học Online</h1>

      {/* Chip chọn lớp */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.classes.map((c) => (
          <button
            key={c.classId}
            onClick={() => setClassId(c.classId)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
              c.classId === cls.classId
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'border border-border bg-surface text-muted-foreground'
            }`}
          >
            {c.className}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const count =
            t.id === 'lessons'
              ? cls.lessons.length
              : t.id === 'assignments'
                ? cls.assignments.length
                : cls.quizzes.length
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors sm:text-sm ${
                tab === t.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t.label} ({count})
            </button>
          )
        })}
      </div>

      {/* ===== BÀI HỌC ===== */}
      {tab === 'lessons' &&
        (cls.lessons.length === 0 ? (
          <EmptyBox label="Chưa có bài học nào." />
        ) : (
          <div className="space-y-2.5">
            {cls.lessons.map((l) => (
              <button
                key={l.id}
                onClick={() => setLessonOpen(l)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  {l.video_url ? <PlayCircle className="h-5 w-5" /> : <BookOpenCheck className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{l.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtDate(l.created_at)}
                    {l.attachments.length > 0 && ` · ${l.attachments.length} file`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}

      {/* ===== BÀI TẬP ===== */}
      {tab === 'assignments' &&
        (cls.assignments.length === 0 ? (
          <EmptyBox label="Chưa có bài tập nào." />
        ) : (
          <div className="space-y-2.5">
            {cls.assignments.map((a) => {
              const overdue = a.due_at && new Date(a.due_at) < new Date()
              return (
                <button
                  key={a.id}
                  onClick={() => setAssignmentOpen(a)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/40"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      a.mySubmission
                        ? a.mySubmission.score !== null
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-sky-50 text-sky-600'
                        : overdue
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">Hạn: {fmtDate(a.due_at)}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      a.mySubmission
                        ? a.mySubmission.score !== null
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-sky-100 text-sky-700'
                        : overdue
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {a.mySubmission
                      ? a.mySubmission.score !== null
                        ? `Điểm ${a.mySubmission.score}`
                        : 'Đã nộp'
                      : overdue
                        ? 'Quá hạn'
                        : 'Chưa nộp'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}

      {/* ===== KIỂM TRA ===== */}
      {tab === 'quizzes' &&
        (cls.quizzes.length === 0 ? (
          <EmptyBox label="Chưa có bài kiểm tra nào." />
        ) : (
          <div className="space-y-2.5">
            {cls.quizzes.map((q) => {
              const done = q.myAttempt?.submitted_at
              return (
                <button
                  key={q.id}
                  onClick={() => setQuizOpen(q)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/40"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      done ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'
                    }`}
                  >
                    <FileQuestion className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{q.title}</span>
                    <span className="block text-xs text-muted-foreground">{q.duration_minutes} phút</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      done ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
                    }`}
                  >
                    {done ? `Điểm ${q.myAttempt?.score ?? '—'}` : 'Làm bài'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}

      {/* ===== MODALS ===== */}
      {lessonOpen && (
        <LessonViewer
          lesson={lessonOpen}
          onClose={() => setLessonOpen(null)}
          onDownload={(f) => void handleDownload('lesson', lessonOpen.id, f)}
        />
      )}
      {assignmentOpen && (
        <AssignmentModal
          assignment={assignmentOpen}
          r2Ready={data.r2Ready}
          onClose={() => setAssignmentOpen(null)}
          onDownloadTask={(f) => void handleDownload('assignment', assignmentOpen.id, f)}
          onDownloadMine={(f) =>
            assignmentOpen.mySubmission &&
            void handleDownload('my-submission', assignmentOpen.mySubmission.id, f)
          }
          onSubmitted={() => {
            setAssignmentOpen(null)
            notify('success', 'Đã nộp bài thành công.')
            router.refresh()
          }}
          onError={(m) => notify('error', m)}
        />
      )}
      {quizOpen && (
        <QuizModal
          quiz={quizOpen}
          onClose={() => {
            setQuizOpen(null)
            router.refresh()
          }}
          onError={(m) => notify('error', m)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
          role="status"
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ============ Sub-components ============

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-10 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <button onClick={onClose} aria-label="Quay lại" className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100 sm:hidden">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate font-heading text-base font-bold sm:text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Đóng" className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100 sm:block">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function LessonViewer({
  lesson,
  onClose,
  onDownload,
}: {
  lesson: LearnLesson
  onClose: () => void
  onDownload: (f: AttachmentMeta) => void
}) {
  const embed = lesson.video_url ? toEmbedUrl(lesson.video_url) : null
  return (
    <Sheet title={lesson.title} onClose={onClose}>
      <div className="space-y-4">
        {lesson.description && <p className="text-sm text-muted-foreground">{lesson.description}</p>}

        {embed ? (
          <div className="aspect-video overflow-hidden rounded-2xl border border-border">
            <iframe src={embed} title={lesson.title} className="h-full w-full" allowFullScreen />
          </div>
        ) : (
          lesson.video_url && (
            <a
              href={lesson.video_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              <PlayCircle className="h-4 w-4" /> Xem video bài giảng
            </a>
          )
        )}

        {lesson.content && (
          <div className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed">{lesson.content}</div>
        )}

        {lesson.attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">Tài liệu đính kèm</p>
            {lesson.attachments.map((f) => (
              <button
                key={f.key}
                onClick={() => onDownload(f)}
                className="flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-sm font-medium hover:bg-indigo-50"
              >
                <Download className="h-4 w-4 shrink-0 text-indigo-600" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function AssignmentModal({
  assignment,
  r2Ready,
  onClose,
  onDownloadTask,
  onDownloadMine,
  onSubmitted,
  onError,
}: {
  assignment: LearnAssignment
  r2Ready: boolean
  onClose: () => void
  onDownloadTask: (f: AttachmentMeta) => void
  onDownloadMine: (f: AttachmentMeta) => void
  onSubmitted: () => void
  onError: (m: string) => void
}) {
  const sub = assignment.mySubmission
  const graded = sub?.score !== null && sub?.score !== undefined
  const overdue = assignment.due_at && new Date(assignment.due_at) < new Date()
  const canSubmit = !graded && (!overdue || assignment.allow_late)

  const [content, setContent] = useState(sub?.content ?? '')
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(sub?.attachments ?? [])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const res = await uploadFilesToR2(Array.from(files), (f) =>
      presignSubmissionUpload({ assignmentId: assignment.id, ...f })
    )
    setUploading(false)
    if ('error' in res) return onError(res.error)
    setAttachments([...attachments, ...res.attachments])
  }

  async function handleSubmit() {
    setSubmitting(true)
    const res = await submitAssignment({ assignmentId: assignment.id, content, attachments })
    setSubmitting(false)
    if (res.error) return onError(res.error)
    onSubmitted()
  }

  return (
    <Sheet title={assignment.title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Hạn nộp: <strong>{fmtDate(assignment.due_at)}</strong>
          {overdue && (
            <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
              Quá hạn{assignment.allow_late ? ' (được nộp muộn)' : ''}
            </span>
          )}
        </p>

        {assignment.instructions && (
          <div className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed">
            {assignment.instructions}
          </div>
        )}

        {assignment.attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">File đề bài</p>
            {assignment.attachments.map((f) => (
              <button
                key={f.key}
                onClick={() => onDownloadTask(f)}
                className="flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-sm font-medium hover:bg-indigo-50"
              >
                <Download className="h-4 w-4 shrink-0 text-indigo-600" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Kết quả đã chấm */}
        {graded && sub && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">Điểm: {sub.score}</p>
            {sub.feedback && <p className="mt-1 text-sm text-emerald-700">Nhận xét: {sub.feedback}</p>}
          </div>
        )}

        {/* Form nộp bài */}
        {canSubmit ? (
          <div className="space-y-3 rounded-2xl border border-border p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <FileUp className="h-4 w-4 text-primary" /> {sub ? 'Nộp lại bài' : 'Nộp bài'}
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Nhập câu trả lời (hoặc đính kèm file)..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((f) => (
                <span key={f.key} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
                  <Paperclip className="h-3 w-3" /> {f.name}
                  <button type="button" onClick={() => setAttachments(attachments.filter((x) => x.key !== f.key))} aria-label={`Bỏ ${f.name}`} className="ml-0.5 text-indigo-400 hover:text-rose-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                disabled={!r2Ready || uploading}
                onClick={() => fileRef.current?.click()}
                title={r2Ready ? 'Đính kèm file' : 'Hệ thống chưa bật lưu trữ file'}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-slate-50 disabled:opacity-40"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} Đính kèm
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
            </div>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || uploading || (content.trim() === '' && attachments.length === 0)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sub ? 'Nộp lại' : 'Nộp bài'}
            </button>
          </div>
        ) : !graded ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
            Đã quá hạn nộp và giáo viên không cho phép nộp muộn.
          </p>
        ) : null}

        {/* Bài đã nộp */}
        {sub && sub.attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">
              Bài đã nộp lúc {fmtDate(sub.submitted_at)}
              {sub.is_late && ' (muộn)'}
            </p>
            {sub.attachments.map((f) => (
              <button
                key={f.key}
                onClick={() => onDownloadMine(f)}
                className="flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-sm font-medium hover:bg-indigo-50"
              >
                <Download className="h-4 w-4 shrink-0 text-indigo-600" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function QuizModal({
  quiz,
  onClose,
  onError,
}: {
  quiz: LearnQuiz
  onClose: () => void
  onError: (m: string) => void
}) {
  const alreadyDone = Boolean(quiz.myAttempt?.submitted_at)
  const [state, setState] = useState<QuizTakingState | null>(
    alreadyDone
      ? { mode: 'result', score: quiz.myAttempt?.score ?? null, submitted_at: quiz.myAttempt?.submitted_at ?? null }
      : null
  )
  const [confirmed, setConfirmed] = useState(alreadyDone)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [remaining, setRemaining] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(false)

  async function begin() {
    setConfirmed(true)
    const res = await getQuizForTaking(quiz.id)
    if ('error' in res) {
      onError(res.error)
      onClose()
      return
    }
    setState(res)
  }

  // Đồng hồ đếm ngược + tự nộp khi hết giờ
  useEffect(() => {
    if (!state || !('mode' in state) || state.mode !== 'taking') return
    const tick = () => {
      const ms = new Date(state.deadline).getTime() - Date.now()
      setRemaining(Math.max(0, Math.floor(ms / 1000)))
      if (ms <= 0 && !submittedRef.current) {
        submittedRef.current = true
        void doSubmit()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  async function doSubmit() {
    setSubmitting(true)
    const res = await submitQuiz({ quizId: quiz.id, answers })
    setSubmitting(false)
    if ('error' in res && res.error) {
      onError(res.error)
      setState({ mode: 'result', score: 0, submitted_at: new Date().toISOString() })
      return
    }
    setState({
      mode: 'result',
      score: 'score' in res ? res.score : null,
      submitted_at: new Date().toISOString(),
    })
  }

  const mm = remaining !== null ? Math.floor(remaining / 60) : 0
  const ss = remaining !== null ? remaining % 60 : 0

  return (
    <Sheet title={quiz.title} onClose={onClose}>
      {/* Màn xác nhận trước khi bắt đầu (đồng hồ chạy ngay khi mở đề) */}
      {!confirmed ? (
        <div className="space-y-4 text-center">
          <AlarmClock className="mx-auto h-10 w-10 text-violet-500" aria-hidden="true" />
          <p className="text-sm">
            Thời gian làm bài: <strong>{quiz.duration_minutes} phút</strong>. Đồng hồ bắt đầu chạy
            ngay khi mở đề và <strong>không dừng lại</strong>. Mỗi học viên chỉ được làm 1 lần.
          </p>
          {quiz.description && <p className="text-xs text-muted-foreground">{quiz.description}</p>}
          <button
            onClick={() => void begin()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <PlayCircle className="h-4 w-4" /> Bắt đầu làm bài
          </button>
        </div>
      ) : state === null ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : 'error' in state ? null : state.mode === 'result' ? (
        <div className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
          <p className="text-sm font-bold">Đã hoàn thành bài kiểm tra</p>
          <p className="font-heading text-4xl font-bold text-primary">{state.score ?? '—'}</p>
          <p className="text-xs text-muted-foreground">Nộp lúc {fmtDate(state.submitted_at)}</p>
          <button
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-bold hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Đồng hồ */}
          <div
            className={`sticky top-0 z-10 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-bold ${
              remaining !== null && remaining < 60 ? 'bg-rose-100 text-rose-700' : 'bg-violet-50 text-violet-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <AlarmClock className="h-4 w-4" /> Còn lại
            </span>
            <span className="font-mono text-base tabular-nums">
              {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
            </span>
          </div>

          {state.questions.map((q, i) => (
            <div key={q.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="mb-2.5 text-sm font-bold">
                Câu {i + 1}. {q.question}
                <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">({q.points}đ)</span>
              </p>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm transition-colors ${
                      answers[q.id] === oi
                        ? 'border-primary bg-indigo-50 font-semibold text-primary'
                        : 'border-border hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === oi}
                      onChange={() => setAnswers({ ...answers, [q.id]: oi })}
                      className="h-4 w-4"
                    />
                    <span className="font-bold">{String.fromCharCode(65 + oi)}.</span> {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => {
              if (!window.confirm(`Đã trả lời ${Object.keys(answers).length}/${state.questions.length} câu. Nộp bài?`)) return
              submittedRef.current = true
              void doSubmit()
            }}
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Nộp bài ({Object.keys(answers).length}/{state.questions.length})
          </button>
        </div>
      )}
    </Sheet>
  )
}
