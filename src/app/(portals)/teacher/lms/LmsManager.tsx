'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileQuestion,
  FileUp,
  Inbox,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { formatFileSize, uploadFilesToR2, type AttachmentMeta } from '@/components/lms/uploadFiles'
import {
  deleteAssignment,
  deleteLesson,
  deleteQuiz,
  getClassLmsData,
  getClassProgress,
  getQuizQuestions,
  getQuizResults,
  getSubmissions,
  getTeacherDownloadUrl,
  gradeSubmission,
  presignLmsUpload,
  saveAssignment,
  saveLesson,
  saveQuiz,
  setQuizPublished,
  syncScoresToGradebook,
  type ClassLmsData,
  type ClassProgress,
  type LmsAssignment,
  type LmsLesson,
  type LmsQuiz,
  type QuizResultRow,
  type SubmissionRow,
} from './actions'
import {
  generateLessonDraft,
  generateQuizDraft,
  getLessonRagStatus,
  indexLessonToRAG,
} from './ai-actions'

// ============================================================
// LMS Giáo viên - client. 3 tab: Bài giảng / Bài tập / Kiểm tra.
// ============================================================

type ClassOption = { id: string; name: string; orgName: string | null }
type Tab = 'lessons' | 'assignments' | 'quizzes' | 'progress'

const TABS: { id: Tab; label: string; icon: typeof BookOpenCheck }[] = [
  { id: 'lessons', label: 'Bài giảng', icon: BookOpenCheck },
  { id: 'assignments', label: 'Bài tập', icon: ClipboardList },
  { id: 'quizzes', label: 'Kiểm tra', icon: FileQuestion },
  { id: 'progress', label: 'Theo dõi', icon: Users },
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

export function LmsManager({ classes }: { classes: ClassOption[] }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [tab, setTab] = useState<Tab>('lessons')
  const [data, setData] = useState<ClassLmsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Modal state
  const [lessonEditing, setLessonEditing] = useState<Partial<LmsLesson> | null>(null)
  const [assignmentEditing, setAssignmentEditing] = useState<Partial<LmsAssignment> | null>(null)
  const [quizEditing, setQuizEditing] = useState<LmsQuiz | 'new' | null>(null)
  const [submissionsFor, setSubmissionsFor] = useState<LmsAssignment | null>(null)
  const [resultsFor, setResultsFor] = useState<LmsQuiz | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** lessonId -> số chunk đã nạp vào RAG (bài AI đã học) */
  const [ragStatus, setRagStatus] = useState<Record<string, number>>({})

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4500)
  }, [])

  const reload = useCallback(async () => {
    if (!classId) return
    setLoading(true)
    const [result, rag] = await Promise.all([getClassLmsData(classId), getLessonRagStatus(classId)])
    if ('error' in result && result.error) {
      notify('error', result.error)
      setData(null)
    } else {
      setData(result as ClassLmsData)
    }
    setRagStatus(rag)
    setLoading(false)
  }, [classId, notify])

  /** "Cho AI học" bài giảng: nạp nội dung vào kho RAG của Gia sư AI */
  async function handleTeachAI(lesson: LmsLesson) {
    setBusyId(`rag-${lesson.id}`)
    const res = await indexLessonToRAG(classId, lesson.id)
    setBusyId(null)
    if ('error' in res) return notify('error', res.error)
    setRagStatus((prev) => ({ ...prev, [lesson.id]: res.chunkCount }))
    notify('success', `AI đã học bài "${lesson.title}" (${res.chunkCount} đoạn kiến thức). Gia sư AI sẽ trả lời học viên dựa trên bài này.`)
  }

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleDownload(kind: 'lesson' | 'assignment' | 'submission', recordId: string, file: AttachmentMeta) {
    const res = await getTeacherDownloadUrl({ classId, kind, recordId, key: file.key, fileName: file.name })
    if ('error' in res) return notify('error', res.error)
    window.open(res.url, '_blank')
  }

  async function togglePublishLesson(lesson: LmsLesson) {
    setBusyId(lesson.id)
    const res = await saveLesson({
      id: lesson.id,
      classId,
      title: lesson.title,
      description: lesson.description ?? '',
      content: lesson.content ?? '',
      videoUrl: lesson.video_url ?? '',
      attachments: lesson.attachments,
      status: lesson.status === 'published' ? 'draft' : 'published',
    })
    setBusyId(null)
    if (res.error) return notify('error', res.error)
    notify('success', lesson.status === 'published' ? 'Đã chuyển về nháp.' : 'Đã phát hành bài giảng.')
    void reload()
  }

  async function handleSync(source: 'assignment' | 'quiz', sourceId: string) {
    setBusyId(sourceId)
    const res = await syncScoresToGradebook({ classId, source, sourceId, weight: 0.1 })
    setBusyId(null)
    if (res.error !== undefined) return notify('error', res.error)
    notify('success', `Đã đồng bộ ${res.data?.synced ?? 0} điểm vào sổ điểm.`)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">LMS - Dạy học Online</h1>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Chọn lớp"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.orgName ? ` · ${c.orgName}` : ''}
            </option>
          ))}
        </select>
      </div>

      {data && !data.r2Ready && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Chưa cấu hình lưu trữ R2 - vẫn soạn được bài (văn bản, video link) nhưng không đính kèm file được.
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors ${
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-indigo-50'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-surface p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : !data ? null : (
        <>
          {/* ===== TAB BÀI GIẢNG ===== */}
          {tab === 'lessons' && (
            <section className="space-y-3">
              <button
                onClick={() => setLessonEditing({})}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Soạn bài giảng
              </button>

              {data.lessons.length === 0 ? (
                <EmptyBox label="Chưa có bài giảng." />
              ) : (
                data.lessons.map((lesson) => (
                  <div key={lesson.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-heading text-base font-bold">{lesson.title}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              lesson.status === 'published'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {lesson.status === 'published' ? 'Đã phát hành' : 'Nháp'}
                          </span>
                          {ragStatus[lesson.id] > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                              <BrainCircuit className="h-3 w-3" aria-hidden="true" /> AI đã học
                            </span>
                          )}
                        </div>
                        {lesson.description && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{lesson.description}</p>
                        )}
                        {lesson.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {lesson.attachments.map((f) => (
                              <button
                                key={f.key}
                                onClick={() => void handleDownload('lesson', lesson.id, f)}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                <Paperclip className="h-3 w-3" aria-hidden="true" />
                                {f.name} · {formatFileSize(f.size)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => void handleTeachAI(lesson)}
                          disabled={busyId === `rag-${lesson.id}` || !lesson.content}
                          title={
                            lesson.content
                              ? 'Cho Gia sư AI học nội dung bài này (RAG) để trả lời học viên'
                              : 'Bài chưa có phần Nội dung để AI học'
                          }
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                        >
                          {busyId === `rag-${lesson.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BrainCircuit className="h-3.5 w-3.5" />
                          )}
                          {ragStatus[lesson.id] > 0 ? 'AI học lại' : 'Cho AI học'}
                        </button>
                        <IconBtn title={lesson.status === 'published' ? 'Chuyển về nháp' : 'Phát hành'} busy={busyId === lesson.id} onClick={() => void togglePublishLesson(lesson)}>
                          {lesson.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </IconBtn>
                        <IconBtn title="Sửa" onClick={() => setLessonEditing(lesson)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Xóa"
                          danger
                          busy={busyId === `del-${lesson.id}`}
                          onClick={async () => {
                            if (!window.confirm(`Xóa bài giảng "${lesson.title}"?`)) return
                            setBusyId(`del-${lesson.id}`)
                            const res = await deleteLesson(classId, lesson.id)
                            setBusyId(null)
                            if (res.error) return notify('error', res.error)
                            notify('success', 'Đã xóa bài giảng.')
                            void reload()
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {/* ===== TAB BÀI TẬP ===== */}
          {tab === 'assignments' && (
            <section className="space-y-3">
              <button
                onClick={() => setAssignmentEditing({})}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Giao bài tập
              </button>

              {data.assignments.length === 0 ? (
                <EmptyBox label="Chưa giao bài tập nào." />
              ) : (
                data.assignments.map((a) => (
                  <div key={a.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-base font-bold">{a.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Hạn: {fmtDate(a.due_at)} · Đã nộp {a.submission_count} · Đã chấm {a.graded_count}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          onClick={() => setSubmissionsFor(a)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold hover:bg-slate-50"
                        >
                          <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Bài nộp ({a.submission_count})
                        </button>
                        <button
                          onClick={() => void handleSync('assignment', a.id)}
                          disabled={busyId === a.id || a.graded_count === 0}
                          title="Đồng bộ điểm vào sổ điểm chính thức"
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                        >
                          {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Vào sổ điểm
                        </button>
                        <IconBtn title="Sửa" onClick={() => setAssignmentEditing(a)}>
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          title="Xóa"
                          danger
                          busy={busyId === `del-${a.id}`}
                          onClick={async () => {
                            if (!window.confirm(`Xóa bài tập "${a.title}"?`)) return
                            setBusyId(`del-${a.id}`)
                            const res = await deleteAssignment(classId, a.id)
                            setBusyId(null)
                            if (res.error) return notify('error', res.error)
                            notify('success', 'Đã xóa bài tập.')
                            void reload()
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {/* ===== TAB KIỂM TRA ===== */}
          {tab === 'quizzes' && (
            <section className="space-y-3">
              <button
                onClick={() => setQuizEditing('new')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Tạo đề kiểm tra
              </button>

              {data.quizzes.length === 0 ? (
                <EmptyBox label="Chưa có đề kiểm tra." />
              ) : (
                data.quizzes.map((q) => (
                  <div key={q.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-heading text-base font-bold">{q.title}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              q.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {q.is_published ? 'Đang mở' : 'Nháp'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {q.question_count} câu · {q.duration_minutes} phút · {q.attempt_count} lượt làm
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          onClick={async () => {
                            setBusyId(q.id)
                            const res = await setQuizPublished(classId, q.id, !q.is_published)
                            setBusyId(null)
                            if (res.error) return notify('error', res.error)
                            notify('success', q.is_published ? 'Đã đóng đề.' : 'Đã mở đề cho học viên.')
                            void reload()
                          }}
                          disabled={busyId === q.id}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
                        >
                          {busyId === q.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : q.is_published ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          {q.is_published ? 'Đóng đề' : 'Mở đề'}
                        </button>
                        <button
                          onClick={() => setResultsFor(q)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold hover:bg-slate-50"
                        >
                          <ClipboardList className="h-3.5 w-3.5" /> Kết quả
                        </button>
                        <button
                          onClick={() => void handleSync('quiz', q.id)}
                          disabled={busyId === q.id || q.attempt_count === 0}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                        >
                          <Send className="h-3.5 w-3.5" /> Vào sổ điểm
                        </button>
                        {q.attempt_count === 0 && (
                          <IconBtn title="Sửa đề" onClick={() => setQuizEditing(q)}>
                            <Pencil className="h-4 w-4" />
                          </IconBtn>
                        )}
                        <IconBtn
                          title="Xóa"
                          danger
                          busy={busyId === `del-${q.id}`}
                          onClick={async () => {
                            if (!window.confirm(`Xóa đề "${q.title}"?`)) return
                            setBusyId(`del-${q.id}`)
                            const res = await deleteQuiz(classId, q.id)
                            setBusyId(null)
                            if (res.error) return notify('error', res.error)
                            notify('success', 'Đã xóa đề.')
                            void reload()
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          {/* ===== TAB THEO DÕI HỌC TẬP ===== */}
          {tab === 'progress' && <ProgressPanel classId={classId} onError={(m) => notify('error', m)} />}
        </>
      )}

      {/* ===== MODALS ===== */}
      {lessonEditing !== null && (
        <LessonModal
          classId={classId}
          lesson={lessonEditing}
          r2Ready={data?.r2Ready ?? false}
          onClose={() => setLessonEditing(null)}
          onSaved={() => {
            setLessonEditing(null)
            notify('success', 'Đã lưu bài giảng.')
            void reload()
          }}
          onError={(m) => notify('error', m)}
        />
      )}
      {assignmentEditing !== null && (
        <AssignmentModal
          classId={classId}
          assignment={assignmentEditing}
          r2Ready={data?.r2Ready ?? false}
          onClose={() => setAssignmentEditing(null)}
          onSaved={() => {
            setAssignmentEditing(null)
            notify('success', 'Đã lưu bài tập.')
            void reload()
          }}
          onError={(m) => notify('error', m)}
        />
      )}
      {quizEditing !== null && (
        <QuizModal
          classId={classId}
          lessons={data?.lessons ?? []}
          quiz={quizEditing === 'new' ? null : quizEditing}
          onClose={() => setQuizEditing(null)}
          onSaved={() => {
            setQuizEditing(null)
            notify('success', 'Đã lưu đề kiểm tra.')
            void reload()
          }}
          onError={(m) => notify('error', m)}
        />
      )}
      {submissionsFor && (
        <SubmissionsModal
          classId={classId}
          assignment={submissionsFor}
          onClose={() => setSubmissionsFor(null)}
          onDownload={(recordId, f) => void handleDownload('submission', recordId, f)}
          onError={(m) => notify('error', m)}
          onGraded={() => void reload()}
        />
      )}
      {resultsFor && (
        <QuizResultsModal classId={classId} quiz={resultsFor} onClose={() => setResultsFor(null)} onError={(m) => notify('error', m)} />
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

function IconBtn({
  title,
  danger,
  busy,
  onClick,
  children,
}: {
  title: string
  danger?: boolean
  busy?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
        danger
          ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
          : 'border-border text-muted-foreground hover:bg-slate-50'
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  )
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const labelCls = 'mb-1 block text-xs font-bold text-muted-foreground'

function LessonModal({
  classId,
  lesson,
  r2Ready,
  onClose,
  onSaved,
  onError,
}: {
  classId: string
  lesson: Partial<LmsLesson>
  r2Ready: boolean
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [title, setTitle] = useState(lesson.title ?? '')
  const [description, setDescription] = useState(lesson.description ?? '')
  const [content, setContent] = useState(lesson.content ?? '')
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? '')
  const [status, setStatus] = useState<'draft' | 'published'>(lesson.status ?? 'draft')
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(lesson.attachments ?? [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [aiNotes, setAiNotes] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const res = await uploadFilesToR2(Array.from(files), (f) => presignLmsUpload({ classId, ...f }))
    setUploading(false)
    if ('error' in res) return onError(res.error)
    setAttachments([...attachments, ...res.attachments])
  }

  /** AI soạn nháp bài giảng từ chủ đề (dùng ô Tiêu đề làm chủ đề) */
  async function handleAICompose() {
    if (title.trim().length < 3) {
      return onError('Nhập chủ đề vào ô Tiêu đề trước (VD: "Hàm số bậc hai") rồi bấm AI soạn bài.')
    }
    setAiBusy(true)
    const res = await generateLessonDraft({ classId, topic: title.trim(), audience: '', notes: aiNotes.trim() })
    setAiBusy(false)
    if ('error' in res) return onError(res.error)
    setTitle(res.draft.title)
    setDescription(res.draft.description)
    setContent(res.draft.content)
  }

  async function handleSave() {
    setSaving(true)
    const res = await saveLesson({
      id: lesson.id,
      classId,
      title,
      description,
      content,
      videoUrl,
      attachments,
      status,
    })
    setSaving(false)
    if (res.error) return onError(res.error)
    onSaved()
  }

  return (
    <ModalShell title={lesson.id ? 'Sửa bài giảng' : 'Soạn bài giảng'} onClose={onClose} wide>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Tiêu đề / Chủ đề *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="VD: Bài 5 - Hàm số bậc hai" />
        </div>

        {/* AI soạn bài giảng */}
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-surface px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Yêu cầu thêm cho AI (tùy chọn): VD nhiều ví dụ thực tế, học viên mất gốc..."
            />
            <button
              type="button"
              onClick={() => void handleAICompose()}
              disabled={aiBusy}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI soạn bài
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-violet-700">
            Nhập chủ đề vào ô Tiêu đề rồi bấm - AI tự soạn mục tiêu, kiến thức, ví dụ và bài tập. Bạn duyệt lại trước khi phát hành.
          </p>
        </div>

        <div>
          <label className={labelCls}>Mô tả ngắn</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Nội dung bài giảng</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} className={inputCls} placeholder="Soạn nội dung (hỗ trợ xuống dòng)..." />
        </div>
        <div>
          <label className={labelCls}>Link video (YouTube...)</label>
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={inputCls} placeholder="https://youtube.com/watch?v=..." />
        </div>

        <div>
          <label className={labelCls}>File đính kèm (tối đa 50MB/file)</label>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
                <Paperclip className="h-3 w-3" /> {f.name} · {formatFileSize(f.size)}
                <button type="button" onClick={() => setAttachments(attachments.filter((x) => x.key !== f.key))} aria-label={`Bỏ ${f.name}`} className="ml-0.5 text-indigo-400 hover:text-rose-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              disabled={!r2Ready || uploading}
              onClick={() => fileRef.current?.click()}
              title={r2Ready ? 'Thêm file' : 'Chưa cấu hình R2'}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-slate-50 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Thêm file
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Trạng thái</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'published')} className={inputCls}>
            <option value="draft">Nháp (học viên chưa thấy)</option>
            <option value="published">Phát hành ngay</option>
          </select>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving || uploading || title.trim().length < 3}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu bài giảng
        </button>
      </div>
    </ModalShell>
  )
}

function AssignmentModal({
  classId,
  assignment,
  r2Ready,
  onClose,
  onSaved,
  onError,
}: {
  classId: string
  assignment: Partial<LmsAssignment>
  r2Ready: boolean
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [title, setTitle] = useState(assignment.title ?? '')
  const [instructions, setInstructions] = useState(assignment.instructions ?? '')
  const [dueAt, setDueAt] = useState(
    assignment.due_at ? new Date(assignment.due_at).toISOString().slice(0, 16) : ''
  )
  const [allowLate, setAllowLate] = useState(assignment.allow_late ?? true)
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(assignment.attachments ?? [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const res = await uploadFilesToR2(Array.from(files), (f) => presignLmsUpload({ classId, ...f }))
    setUploading(false)
    if ('error' in res) return onError(res.error)
    setAttachments([...attachments, ...res.attachments])
  }

  async function handleSave() {
    setSaving(true)
    const res = await saveAssignment({
      id: assignment.id,
      classId,
      title,
      instructions,
      dueAt: dueAt ? new Date(dueAt).toISOString() : '',
      allowLate,
      attachments,
    })
    setSaving(false)
    if (res.error) return onError(res.error)
    onSaved()
  }

  return (
    <ModalShell title={assignment.id ? 'Sửa bài tập' : 'Giao bài tập'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Tiêu đề *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="VD: Bài tập tuần 3" />
        </div>
        <div>
          <label className={labelCls}>Yêu cầu / đề bài</label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Hạn nộp</label>
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-end gap-2 pb-2.5 text-sm font-medium">
            <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} className="h-4 w-4 rounded" />
            Cho nộp muộn
          </label>
        </div>

        <div>
          <label className={labelCls}>File đề bài</label>
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
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-slate-50 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Thêm file
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
          </div>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving || uploading || title.trim().length < 3}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu bài tập
        </button>
      </div>
    </ModalShell>
  )
}

type DraftQuestion = { question: string; options: string[]; correctIndex: number; points: number }

function QuizModal({
  classId,
  lessons,
  quiz,
  onClose,
  onSaved,
  onError,
}: {
  classId: string
  lessons: LmsLesson[]
  quiz: LmsQuiz | null
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [title, setTitle] = useState(quiz?.title ?? '')
  const [description, setDescription] = useState(quiz?.description ?? '')
  const [duration, setDuration] = useState(quiz?.duration_minutes ?? 15)
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { question: '', options: ['', ''], correctIndex: 0, points: 1 },
  ])
  const [saving, setSaving] = useState(false)
  const [aiLessonId, setAiLessonId] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiBusy, setAiBusy] = useState(false)

  /** AI tạo câu hỏi từ bài giảng đã chọn hoặc từ tiêu đề đề kiểm tra */
  async function handleAIQuestions() {
    if (!aiLessonId && title.trim().length < 3) {
      return onError('Chọn bài giảng nguồn hoặc nhập Tiêu đề (chủ đề) trước khi tạo câu hỏi bằng AI.')
    }
    setAiBusy(true)
    const res = await generateQuizDraft({
      classId,
      lessonId: aiLessonId || undefined,
      topic: title.trim(),
      count: aiCount,
    })
    setAiBusy(false)
    if ('error' in res) return onError(res.error)
    const generated: DraftQuestion[] = res.questions.map((q) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      points: q.points,
    }))
    // Thay câu hỏi trống mặc định, còn lại thì nối thêm vào cuối
    setQuestions((prev) => {
      const kept = prev.filter((q) => q.question.trim() !== '')
      return [...kept, ...generated]
    })
  }

  // Sửa đề cũ -> nạp câu hỏi hiện có
  useEffect(() => {
    if (!quiz) return
    void (async () => {
      const res = await getQuizQuestions(classId, quiz.id)
      if ('error' in res) return onError(res.error)
      if (res.data.length > 0) {
        setQuestions(
          res.data.map((q) => ({
            question: q.question,
            options: q.options,
            correctIndex: q.correct_index,
            points: q.points,
          }))
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz?.id])

  function patchQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }

  async function handleSave(publish: boolean) {
    setSaving(true)
    const res = await saveQuiz({
      id: quiz?.id,
      classId,
      title,
      description,
      durationMinutes: duration,
      isPublished: publish,
      questions: questions.map((q) => ({
        question: q.question,
        options: q.options.filter((o) => o.trim() !== ''),
        correctIndex: q.correctIndex,
        points: q.points,
      })),
    })
    setSaving(false)
    if (res.error) return onError(res.error)
    onSaved()
  }

  return (
    <ModalShell title={quiz ? 'Sửa đề kiểm tra' : 'Tạo đề kiểm tra trắc nghiệm'} onClose={onClose} wide>
      <div className="space-y-4">
        {quiz && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Lưu đề sẽ thay toàn bộ câu hỏi cũ. Đề đã có lượt làm thì không sửa được.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Tiêu đề *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="VD: Kiểm tra 15 phút chương 2" />
          </div>
          <div>
            <label className={labelCls}>Thời gian (phút)</label>
            <input
              type="number"
              min={1}
              max={180}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Mô tả</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </div>

        {/* AI tạo câu hỏi */}
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={aiLessonId}
              onChange={(e) => setAiLessonId(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-surface px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Bài giảng nguồn cho AI"
            >
              <option value="">— Ra đề theo Tiêu đề (chủ đề) —</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  Từ bài giảng: {l.title}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={20}
              value={aiCount}
              onChange={(e) => setAiCount(Math.min(20, Math.max(1, Number(e.target.value) || 5)))}
              className="w-16 rounded-xl border border-violet-200 bg-surface px-2 py-2 text-sm"
              aria-label="Số câu hỏi AI tạo"
              title="Số câu hỏi"
            />
            <button
              type="button"
              onClick={() => void handleAIQuestions()}
              disabled={aiBusy}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI tạo câu hỏi
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-violet-700">
            Chọn bài giảng để AI ra đề bám sát nội dung đã dạy. Câu hỏi tạo ra có thể sửa/xóa trước khi lưu.
          </p>
        </div>

        {/* Câu hỏi */}
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={i} className="rounded-2xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">Câu {i + 1}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    Điểm
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={q.points}
                      onChange={(e) => patchQuestion(i, { points: Number(e.target.value) || 1 })}
                      className="w-16 rounded-lg border border-border px-2 py-1 text-xs"
                    />
                  </label>
                  {questions.length > 1 && (
                    <button
                      onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                      aria-label="Xóa câu hỏi"
                      className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={q.question}
                onChange={(e) => patchQuestion(i, { question: e.target.value })}
                rows={2}
                className={inputCls}
                placeholder="Nội dung câu hỏi..."
              />
              <div className="mt-2 space-y-1.5">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correctIndex === oi}
                      onChange={() => patchQuestion(i, { correctIndex: oi })}
                      title="Đáp án đúng"
                      className="h-4 w-4"
                    />
                    <input
                      value={opt}
                      onChange={(e) =>
                        patchQuestion(i, { options: q.options.map((o, x) => (x === oi ? e.target.value : o)) })
                      }
                      className={inputCls}
                      placeholder={`Phương án ${String.fromCharCode(65 + oi)}`}
                    />
                    {q.options.length > 2 && (
                      <button
                        onClick={() =>
                          patchQuestion(i, {
                            options: q.options.filter((_, x) => x !== oi),
                            correctIndex: q.correctIndex >= oi && q.correctIndex > 0 ? q.correctIndex - 1 : q.correctIndex,
                          })
                        }
                        aria-label="Bỏ phương án"
                        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:text-rose-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {q.options.length < 6 && (
                  <button
                    onClick={() => patchQuestion(i, { options: [...q.options, ''] })}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    + Thêm phương án
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => setQuestions([...questions, { question: '', options: ['', ''], correctIndex: 0, points: 1 }])}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-bold text-muted-foreground hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Thêm câu hỏi
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void handleSave(false)}
            disabled={saving}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold hover:bg-slate-50 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu nháp
          </button>
          <button
            onClick={() => void handleSave(true)}
            disabled={saving}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lưu & mở đề
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function SubmissionsModal({
  classId,
  assignment,
  onClose,
  onDownload,
  onError,
  onGraded,
}: {
  classId: string
  assignment: LmsAssignment
  onClose: () => void
  onDownload: (recordId: string, f: AttachmentMeta) => void
  onError: (m: string) => void
  onGraded: () => void
}) {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({})

  useEffect(() => {
    void (async () => {
      const res = await getSubmissions(classId, assignment.id)
      if ('error' in res) {
        onError(res.error)
        setRows([])
      } else {
        setRows(res.data)
        setDrafts(
          Object.fromEntries(
            res.data.map((s) => [s.id, { score: s.score === null ? '' : String(s.score), feedback: s.feedback ?? '' }])
          )
        )
      }
    })()
    // onError là arrow prop đổi mỗi render cha -> đưa vào deps sẽ refetch vô hạn khi có lỗi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, assignment.id])

  async function handleGrade(s: SubmissionRow) {
    const draft = drafts[s.id]
    const score = Number(draft?.score)
    if (draft?.score === '' || Number.isNaN(score) || score < 0 || score > 10) {
      return onError('Điểm phải từ 0 đến 10.')
    }
    setSavingId(s.id)
    const res = await gradeSubmission({ classId, submissionId: s.id, score, feedback: draft.feedback })
    setSavingId(null)
    if (res.error) return onError(res.error)
    setRows((prev) => prev?.map((r) => (r.id === s.id ? { ...r, score, feedback: draft.feedback } : r)) ?? null)
    onGraded()
  }

  return (
    <ModalShell title={`Bài nộp - ${assignment.title}`} onClose={onClose} wide>
      {rows === null ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyBox label="Chưa có học viên nào nộp bài." />
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{s.student_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Nộp {fmtDate(s.submitted_at)}
                    {s.is_late && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Muộn</span>}
                  </p>
                </div>
                {s.score !== null && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Đã chấm: {s.score}</span>
                )}
              </div>

              {s.content && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{s.content}</p>}

              {s.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.attachments.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => onDownload(s.id, f)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      <Download className="h-3 w-3" /> {f.name} · {formatFileSize(f.size)}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.25}
                  value={drafts[s.id]?.score ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...drafts[s.id], score: e.target.value } })}
                  placeholder="Điểm"
                  className="w-20 rounded-xl border border-border px-2.5 py-2 text-sm"
                  aria-label={`Điểm cho ${s.student_name}`}
                />
                <input
                  value={drafts[s.id]?.feedback ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...drafts[s.id], feedback: e.target.value } })}
                  placeholder="Nhận xét..."
                  className="min-w-40 flex-1 rounded-xl border border-border px-2.5 py-2 text-sm"
                  aria-label={`Nhận xét cho ${s.student_name}`}
                />
                <button
                  onClick={() => void handleGrade(s)}
                  disabled={savingId === s.id}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  {savingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Chấm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

/**
 * Tab "Theo dõi": ma trận học viên × (bài giảng đã xem / bài tập đã
 * nộp / đề đã làm) + % hoạt động. Học viên chưa học gì nổi bật đỏ.
 */
function ProgressPanel({ classId, onError }: { classId: string; onError: (m: string) => void }) {
  const [progress, setProgress] = useState<ClassProgress | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void (async () => {
      const res = await getClassProgress(classId)
      if ('error' in res) {
        onError(res.error)
        setProgress(null)
      } else {
        setProgress(res)
      }
      setLoading(false)
    })()
    // onError là arrow prop đổi mỗi render cha -> không đưa vào deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-surface p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }
  if (!progress) return <EmptyBox label="Không tải được dữ liệu theo dõi." />
  if (progress.students.length === 0) return <EmptyBox label="Lớp chưa có học viên ghi danh." />

  const totalLessons = progress.lessons.length
  const totalAssignments = progress.assignments.length
  const totalQuizzes = progress.quizzes.length
  const inactive = progress.students.filter((s) => s.engagement === 0).length

  return (
    <section className="space-y-3">
      {!progress.progressAvailable && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Chưa chạy migration 039 (lms_lesson_progress) - tạm thời chỉ theo dõi được bài nộp và lượt làm kiểm tra, chưa theo dõi được lượt xem bài giảng.
        </p>
      )}

      {/* Thẻ tổng quan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Học viên', value: progress.students.length, cls: 'text-primary' },
          { label: 'Bài giảng phát hành', value: totalLessons, cls: 'text-indigo-600' },
          { label: 'Bài tập / Đề KT', value: `${totalAssignments} / ${totalQuizzes}`, cls: 'text-emerald-600' },
          { label: 'Chưa học gì', value: inactive, cls: inactive > 0 ? 'text-rose-600' : 'text-emerald-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
            <p className="text-[11px] font-bold text-muted-foreground">{c.label}</p>
            <p className={`mt-0.5 font-heading text-2xl font-bold ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Bảng chi tiết */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Học viên</th>
              <th className="px-3 py-3 text-center">Xem bài giảng</th>
              <th className="px-3 py-3 text-center">Nộp bài tập</th>
              <th className="px-3 py-3 text-center">Làm kiểm tra</th>
              <th className="px-4 py-3">Mức độ học tập</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {progress.students.map((s) => (
              <tr key={s.studentId} className={s.engagement === 0 ? 'bg-rose-50/50' : ''}>
                <td className="px-4 py-3">
                  <span className="font-semibold">{s.studentName}</span>
                  {s.engagement === 0 && (
                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                      Chưa học
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center tabular-nums">
                  <span className={s.lessonsViewed < totalLessons ? 'text-amber-700' : 'text-emerald-700'}>
                    {s.lessonsViewed}/{totalLessons}
                  </span>
                </td>
                <td className="px-3 py-3 text-center tabular-nums">
                  <span className={s.assignmentsSubmitted < totalAssignments ? 'text-amber-700' : 'text-emerald-700'}>
                    {s.assignmentsSubmitted}/{totalAssignments}
                  </span>
                </td>
                <td className="px-3 py-3 text-center tabular-nums">
                  <span className={s.quizzesDone < totalQuizzes ? 'text-amber-700' : 'text-emerald-700'}>
                    {s.quizzesDone}/{totalQuizzes}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-full max-w-36 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          s.engagement >= 70 ? 'bg-emerald-500' : s.engagement >= 30 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${s.engagement}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-bold tabular-nums">{s.engagement}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function QuizResultsModal({
  classId,
  quiz,
  onClose,
  onError,
}: {
  classId: string
  quiz: LmsQuiz
  onClose: () => void
  onError: (m: string) => void
}) {
  const [rows, setRows] = useState<QuizResultRow[] | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await getQuizResults(classId, quiz.id)
      if ('error' in res) {
        onError(res.error)
        setRows([])
      } else {
        setRows(res.data)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, quiz.id])

  return (
    <ModalShell title={`Kết quả - ${quiz.title}`} onClose={onClose}>
      {rows === null ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyBox label="Chưa có lượt làm bài." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.student_id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-semibold">{r.student_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.submitted_at ? `Nộp ${fmtDate(r.submitted_at)}` : 'Đang làm bài...'}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  r.score === null
                    ? 'bg-slate-100 text-slate-600'
                    : r.score >= 5
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                }`}
              >
                {r.score === null ? '—' : r.score}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  )
}
