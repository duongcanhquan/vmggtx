'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useChat } from 'ai/react'
import { ArrowLeft, Sparkles, Send, Loader2, AlertCircle } from 'lucide-react'

export default function TutorPage({ params }: { params: { id: string } }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat/tutor',
    // class_id từ URL được nhúng vào payload để API lọc tài liệu đúng lớp
    body: { class_id: params.id },
  })

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-3xl flex-col gap-4">
      <div>
        <Link
          href="/classes"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại danh sách lớp
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-secondary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Gia sư AI</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Trả lời dựa trên tài liệu của lớp{' '}
              <span className="font-mono text-xs">{params.id}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Danh sách tin nhắn */}
      <div
        className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-secondary">
              <Sparkles className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="font-heading text-lg font-bold">Hỏi gia sư AI bất cứ điều gì</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Ví dụ: &quot;Tóm tắt nội dung buổi học tuần trước&quot; hoặc &quot;Giải thích lại
              phần khó nhất trong tài liệu&quot;.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
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
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-slate-50 px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Gia sư đang soạn câu trả lời...
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Có lỗi khi gọi gia sư AI: {error.message}. Vui lòng thử lại.</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Khung nhập câu hỏi */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label htmlFor="tutor-input" className="sr-only">
          Câu hỏi cho gia sư AI
        </label>
        <input
          id="tutor-input"
          value={input}
          onChange={handleInputChange}
          placeholder="Nhập câu hỏi của bạn..."
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-foreground shadow-sm transition-colors duration-200 placeholder:text-slate-400 hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Gửi câu hỏi"
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
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
