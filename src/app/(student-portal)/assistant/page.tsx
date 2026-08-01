'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from 'ai/react'
import { AlertCircle, Bot, Loader2, SearchX, Send, Sparkles } from 'lucide-react'
import { getMyEnrolledClasses, type MyClass } from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// TRỢ LÝ AI - GIA SƯ RAG (Student Portal, mobile-first)
// Chọn lớp -> chat với /api/chat/tutor (chỉ trả lời theo tài liệu lớp).
// ============================================================

export default function StudentAssistantPage() {
  const [classes, setClasses] = useState<MyClass[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const result = await getMyEnrolledClasses()
      setLoadingClasses(false)
      if (result.error !== undefined) {
        setLoadError(result.error)
        return
      }
      setClasses(result.classes)
      if (result.classes.length > 0) setSelectedClassId(result.classes[0].id)
    })()
  }, [])

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } =
    useChat({
      api: '/api/chat/tutor',
      body: { class_id: selectedClassId },
    })

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  if (loadingClasses) {
    return (
      <FunLoader label="Đang tải lớp học của bạn…" />
    )
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700">
        {loadError}
      </div>
    )
  }

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Bạn chưa ghi danh lớp nào.</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Bot className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-bold tracking-tight">Gia sư AI</h1>
          <p className="truncate text-xs text-muted-foreground">
            Trả lời theo tài liệu lớp học.
          </p>
        </div>
      </div>

      <select
        value={selectedClassId}
        onChange={(event) => {
          setSelectedClassId(event.target.value)
          setMessages([]) // đổi lớp = đổi ngữ cảnh -> xóa hội thoại cũ
        }}
        className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Chọn lớp để hỏi gia sư"
      >
        {classes.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.name}
          </option>
        ))}
      </select>

      {/* Hội thoại */}
      <div
        className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-3"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Sparkles className="h-8 w-8 text-emerald-300" aria-hidden="true" />
            <p className="text-sm font-semibold">Hỏi gia sư AI bất cứ điều gì</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Ví dụ: &quot;Tóm tắt bài học tuần trước&quot;
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md border border-border bg-slate-50 text-foreground'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-slate-50 px-3.5 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Gia sư đang soạn câu trả lời…
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Có lỗi khi gọi gia sư AI. Vui lòng thử lại sau.</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Ô nhập */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label htmlFor="student-tutor-input" className="sr-only">
          Câu hỏi cho gia sư AI
        </label>
        <input
          id="student-tutor-input"
          value={input}
          onChange={handleInputChange}
          placeholder="Nhập câu hỏi…"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base shadow-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim() || !selectedClassId}
          aria-label="Gửi câu hỏi"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </form>
    </div>
  )
}
