'use client'

import { useEffect, useState } from 'react'
import { useCompletion } from 'ai/react'
import { Bot, Loader2, Sparkles, StopCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SaveLessonDraft } from './SaveLessonDraft'

// ============================================================
// TRỢ LÝ AI SOẠN GIÁO ÁN (/teacher/assistant)
// Gọi Core Copilot (/api/ai/copilot) với taskType='lesson_plan':
// RAG lấy khung chương trình toàn cơ sở, AI trả giáo án 45 phút
// (streaming). orgId = org của chính giáo viên (route double-check).
// ============================================================

const SUGGESTIONS = [
  'Soạn giáo án 45 phút chủ đề "Phương trình bậc hai" cho lớp 10',
  'Giáo án Ngữ văn: phân tích bài "Tây Tiến" (tiết 1)',
  'Giáo án tiếng Anh về thì hiện tại hoàn thành, có hoạt động nhóm',
]

export default function TeacherAssistantPage() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgLoading, setOrgLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadOrg() {
      try {
        const supabase = createClient()
        // getSession đọc cục bộ (0ms) thay vì round-trip mạng như getUser
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .is('deleted_at', null)
          .maybeSingle()
        if (!cancelled) setOrgId(profile?.org_id ?? null)
      } finally {
        if (!cancelled) setOrgLoading(false)
      }
    }
    loadOrg()
    return () => {
      cancelled = true
    }
  }, [])

  const {
    completion,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    error,
  } = useCompletion({
    api: '/api/ai/copilot',
    body: { taskType: 'lesson_plan', orgId },
  })

  const canAsk = !orgLoading && orgId !== null

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
        <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
        Trợ lý AI — Soạn giáo án
      </h1>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
      >
        <label htmlFor="lesson-topic" className="text-sm font-semibold text-foreground">
          Chủ đề / yêu cầu giáo án
        </label>
        <textarea
          id="lesson-topic"
          value={input}
          onChange={handleInputChange}
          rows={3}
          maxLength={4000}
          placeholder="Chủ đề bài học…"
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {/* Gợi ý nhanh */}
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setInput(suggestion)}
              className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            disabled={!canAsk || isLoading || input.trim().length === 0}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {isLoading ? 'Đang soạn…' : 'Tạo giáo án 45 phút'}
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={() => stop()}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3.5 text-sm font-semibold text-foreground hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
              Dừng
            </button>
          )}
        </div>

        {!orgLoading && orgId === null && (
          <p className="mt-2 text-xs text-amber-700">
            Tài khoản của bạn chưa gắn cơ sở — liên hệ quản trị viên để dùng Trợ lý AI.
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Trợ lý AI đang bảo trì, vui lòng quay lại sau.
          </p>
        )}
      </form>

      {/* ===== Kết quả streaming ===== */}
      {(completion || isLoading) && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5">
          <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-indigo-900">
            <Bot className="h-4 w-4" aria-hidden="true" />
            Giáo án do AI soạn
          </h2>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {completion || 'Đang chuẩn bị nội dung…'}
          </div>
          {!isLoading && completion && (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                Nội dung do AI tạo — vui lòng rà soát trước khi dùng.
              </p>
              <SaveLessonDraft content={completion} topicHint={input} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
