'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Loader2,
  Save,
  WifiOff,
} from 'lucide-react'
import { FunLoader } from '@/components/shared/FunLoader'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  finalizeRubricGrade,
  getGradeWorkspace,
  getSignedSubmissionFileUrl,
  saveRubricDraft,
  type GradeWorkspace,
} from '../../rubric-actions'

const DRAFT_KEY = (id: string) => `rubric-draft:${id}`

function computeScore(
  workspace: GradeWorkspace,
  selections: Record<string, string>
): number {
  if (!workspace.rubric) return 0
  let sum = 0
  for (const c of workspace.rubric.criteria) {
    const levelId = selections[c.id]
    const level = c.levels.find((l) => l.id === levelId)
    if (level) sum += level.points
  }
  return Math.round(Math.min(workspace.maxScore, sum) * 100) / 100
}

export default function RubricGradePage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = String(params.submissionId ?? '')

  const [workspace, setWorkspace] = useState<GradeWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'offline' | 'error'
  >('idle')
  const [toast, setToast] = useState<ToastData | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalScore = useMemo(() => {
    if (!workspace) return 0
    return computeScore(workspace, selections)
  }, [workspace, selections])

  const load = useCallback(async () => {
    if (!submissionId) return
    setLoading(true)
    const res = await getGradeWorkspace(submissionId)
    if (res.error !== undefined) {
      setToast({ type: 'error', message: res.error })
      setWorkspace(null)
      setLoading(false)
      return
    }
    const data = res.data
    if (!data) {
      setWorkspace(null)
      setLoading(false)
      return
    }
    setWorkspace(data)

    let nextSelections = { ...data.grade.selections }
    let nextFeedback = data.grade.feedback
    try {
      const raw = localStorage.getItem(DRAFT_KEY(submissionId))
      if (raw) {
        const local = JSON.parse(raw) as {
          selections?: Record<string, string>
          feedback?: string
          updatedAt?: string
        }
        const localAt = local.updatedAt ? Date.parse(local.updatedAt) : 0
        const serverAt = data.grade.updated_at
          ? Date.parse(data.grade.updated_at)
          : 0
        if (localAt >= serverAt && local.selections) {
          nextSelections = local.selections
          nextFeedback = local.feedback ?? nextFeedback
        }
      }
    } catch {
      /* ignore */
    }
    setSelections(nextSelections)
    setFeedback(nextFeedback)
    setLoading(false)
  }, [submissionId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const persistLocal = useCallback(
    (sel: Record<string, string>, fb: string) => {
      try {
        localStorage.setItem(
          DRAFT_KEY(submissionId),
          JSON.stringify({
            selections: sel,
            feedback: fb,
            updatedAt: new Date().toISOString(),
            computedScore: workspace ? computeScore(workspace, sel) : 0,
          })
        )
      } catch {
        /* quota */
      }
    },
    [submissionId, workspace]
  )

  const scheduleSave = useCallback(
    (sel: Record<string, string>, fb: string) => {
      dirtyRef.current = true
      persistLocal(sel, fb)
      if (!navigator.onLine) {
        setSaveState('offline')
        return
      }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void (async () => {
          if (!workspace) return
          setSaveState('saving')
          const score = computeScore(workspace, sel)
          const res = await saveRubricDraft({
            submissionId,
            selections: sel,
            feedback: fb,
            computedScore: score,
          })
          if (res.error) {
            setSaveState('error')
            return
          }
          dirtyRef.current = false
          setSaveState('saved')
        })()
      }, 2000)
    },
    [persistLocal, submissionId, workspace]
  )

  function selectLevel(criterionId: string, levelId: string) {
    if (workspace?.grade.status === 'final') return
    const next = { ...selections, [criterionId]: levelId }
    setSelections(next)
    scheduleSave(next, feedback)
  }

  function onFeedbackChange(value: string) {
    if (workspace?.grade.status === 'final') return
    setFeedback(value)
    scheduleSave(selections, value)
  }

  async function onFinalize() {
    if (!workspace?.rubric) {
      setToast({ type: 'error', message: 'Bài tập chưa có rubric.' })
      return
    }
    for (const c of workspace.rubric.criteria) {
      if (!selections[c.id]) {
        setToast({
          type: 'error',
          message: `Chưa chọn mức cho tiêu chí «${c.name}».`,
        })
        return
      }
    }
    setFinalizing(true)
    const res = await finalizeRubricGrade({
      submissionId,
      selections,
      feedback,
      computedScore: totalScore,
    })
    setFinalizing(false)
    if (res.error) {
      setToast({ type: 'error', message: res.error })
      return
    }
    dirtyRef.current = false
    try {
      localStorage.removeItem(DRAFT_KEY(submissionId))
    } catch {
      /* */
    }
    setToast({ type: 'success', message: `Đã chốt điểm ${totalScore}.` })
    void load()
  }

  async function downloadFile(key: string, name: string) {
    const res = await getSignedSubmissionFileUrl(submissionId, key)
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
      return
    }
    const a = document.createElement('a')
    a.href = res.url
    a.download = name
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  const siblingIndex = workspace
    ? workspace.siblingIds.indexOf(submissionId)
    : -1
  const prevId =
    siblingIndex > 0 ? workspace!.siblingIds[siblingIndex - 1] : null
  const nextId =
    siblingIndex >= 0 && siblingIndex < (workspace?.siblingIds.length ?? 0) - 1
      ? workspace!.siblingIds[siblingIndex + 1]
      : null

  if (loading) {
    return (
      <div className="p-6">
        <FunLoader label="Đang mở workspace chấm…" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="space-y-4 p-6">
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
        <Link href="/teacher/lms" className="text-sm font-semibold text-primary">
          ← Về LMS
        </Link>
        <p className="text-sm text-muted-foreground">Không tải được bài nộp.</p>
      </div>
    )
  }

  const isFinal = workspace.grade.status === 'final'

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <Link
            href="/teacher/lms"
            className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            LMS
          </Link>
          <h1 className="truncate font-heading text-lg font-bold sm:text-xl">
            {workspace.submission.student_name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {workspace.assignmentTitle}
            {workspace.submission.is_late ? ' · Nộp muộn' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {saveState === 'saving' && 'Đang lưu nháp…'}
            {saveState === 'saved' && 'Đã lưu nháp'}
            {saveState === 'offline' && (
              <span className="inline-flex items-center gap-1">
                <WifiOff className="h-3 w-3" /> Offline — bản local
              </span>
            )}
            {saveState === 'error' && 'Lỗi lưu — vẫn còn local'}
            {saveState === 'idle' && (isFinal ? 'Đã chốt' : 'Sẵn sàng')}
          </span>
          <button
            type="button"
            disabled={!prevId}
            onClick={() => prevId && router.push(`/teacher/lms/grade/${prevId}`)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> Trước
          </button>
          <button
            type="button"
            disabled={!nextId}
            onClick={() => nextId && router.push(`/teacher/lms/grade/${nextId}`)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border px-3 text-sm disabled:opacity-40"
          >
            Sau <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        {/* LEFT — bài làm */}
        <section className="flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm lg:max-h-[calc(100dvh-12rem)]">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Bài làm học viên</p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {workspace.submission.content ? (
              <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed">
                {workspace.submission.content}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">Không có nội dung văn bản.</p>
            )}
            {workspace.submission.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {workspace.submission.attachments.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => void downloadFile(f.key, f.name)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — rubric */}
        <section className="flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100dvh-12rem)]">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              {workspace.rubric?.title ?? 'Rubric'}
            </p>
            <p className="text-lg font-bold tabular-nums text-primary">
              {totalScore}
              <span className="text-sm font-medium text-muted-foreground">
                /{workspace.maxScore}
              </span>
            </p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!workspace.rubric ? (
              <p className="text-sm text-muted-foreground">
                Chưa có rubric cho bài này. Mở LMS → Sửa bài tập → thiết lập
                Rubric, hoặc chấm điểm nhanh trong danh sách nộp bài.
              </p>
            ) : (
              workspace.rubric.criteria.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3">
                  <p className="font-semibold">{c.name}</p>
                  {c.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-col gap-1.5">
                    {c.levels.map((lv) => {
                      const active = selections[c.id] === lv.id
                      return (
                        <button
                          key={lv.id}
                          type="button"
                          disabled={isFinal}
                          onClick={() => selectLevel(c.id, lv.id)}
                          className={`flex min-h-11 items-center justify-between rounded-xl border px-3 text-left text-sm transition-colors ${
                            active
                              ? 'border-primary bg-indigo-50 font-semibold text-primary'
                              : 'border-border hover:bg-slate-50'
                          } disabled:opacity-60`}
                        >
                          <span>{lv.label}</span>
                          <span className="tabular-nums">{lv.points}đ</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="fb">
                Nhận xét
              </label>
              <textarea
                id="fb"
                rows={4}
                disabled={isFinal}
                value={feedback}
                onChange={(e) => onFeedbackChange(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              />
            </div>
          </div>

          <div className="border-t border-border p-4">
            <button
              type="button"
              disabled={isFinal || finalizing || !workspace.rubric}
              onClick={() => void onFinalize()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {finalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isFinal ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isFinal ? `Đã chốt · ${workspace.submission.score}` : 'Chốt điểm'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
