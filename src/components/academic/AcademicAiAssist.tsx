'use client'

import { useState } from 'react'
import { useCompletion } from 'ai/react'
import { Bot, Loader2, Sparkles, StopCircle, X } from 'lucide-react'

// ============================================================
// Trợ lý AI học vụ — gọi /api/ai/copilot taskType=academic_assist
// Dùng ở cảnh báo sớm, sổ điểm, sổ đầu bài (draft).
// ============================================================

type Props = {
  orgId: string
  classId?: string
  /** Ngữ cảnh có cấu trúc (danh sách cảnh báo, matrix điểm…) */
  contextPayload: string
  title?: string
  suggestions?: string[]
  defaultPrompt?: string
}

const DEFAULT_SUGGESTIONS = [
  'Tóm tắt rủi ro và ưu tiên xử lý',
  'Soạn tin nhắn ngắn gửi phụ huynh (lịch sự, rõ ràng)',
  'Gợi ý hành động cho giáo vụ / GVCN trong 7 ngày tới',
]

export function AcademicAiAssist({
  orgId,
  classId,
  contextPayload,
  title = 'Trợ lý AI học vụ',
  suggestions = DEFAULT_SUGGESTIONS,
  defaultPrompt = 'Phân tích dữ liệu học vụ dưới đây và đề xuất bước xử lý cụ thể.',
}: Props) {
  const [open, setOpen] = useState(false)

  const {
    completion,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    error,
    setCompletion,
  } = useCompletion({
    api: '/api/ai/copilot',
    body: {
      taskType: 'academic_assist',
      orgId,
      classId,
      extraContext: contextPayload.slice(0, 6000),
    },
  })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          if (!input) setInput(defaultPrompt)
        }}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {title}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
          <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
          {title}
        </h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            stop()
            setCompletion('')
          }}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Đóng trợ lý AI"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={input}
          onChange={handleInputChange}
          rows={3}
          maxLength={4000}
          placeholder="Yêu cầu AI…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="cursor-pointer rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !orgId}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {isLoading ? 'Đang phân tích…' : 'Chạy AI'}
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
              Dừng
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error.message || 'Trợ lý AI đang bảo trì, vui lòng thử lại sau.'}
        </p>
      )}

      {completion && (
        <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-white px-4 py-3 text-sm leading-relaxed text-foreground">
          {completion}
        </div>
      )}
    </div>
  )
}
