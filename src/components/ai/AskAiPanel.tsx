'use client'

import { useCompletion } from 'ai/react'
import { Bot, Loader2, Sparkles, StopCircle } from 'lucide-react'
import type { ModuleAiPreset } from '@/lib/ai/moduleAssist'

type Props = {
  orgId: string | null
  preset: ModuleAiPreset
  /** Compact = card nhúng trong trang; full = panel rộng hơn */
  variant?: 'compact' | 'full'
  className?: string
}

export function AskAiPanel({
  orgId,
  preset,
  variant = 'compact',
  className = '',
}: Props) {
  const { completion, input, setInput, isLoading, stop, error, complete } =
    useCompletion({
      api: '/api/ai/copilot',
      body: {
        taskType: preset.taskType,
        orgId,
        kbCategory: preset.kbCategory,
        module: preset.key,
      },
    })

  async function ask(prompt: string) {
    const q = prompt.trim()
    if (!q || isLoading || !orgId) return
    await complete(q, {
      body: {
        taskType: preset.taskType,
        orgId,
        kbCategory: preset.kbCategory,
        module: preset.key,
      },
    })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await ask(input)
  }

  if (!orgId) {
    return (
      <p
        className={`rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground ${className}`}
      >
        Chọn cơ sở trên header để hỏi AI theo kho tri thức của đơn vị.
      </p>
    )
  }

  return (
    <div
      className={`space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-sm sm:p-4 ${className}`}
    >
      <div className="flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{preset.title}</p>
          <p className="text-xs text-muted-foreground">{preset.subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {preset.suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={isLoading}
            onClick={() => {
              setInput(s)
              void ask(s)
            }}
            className="inline-flex max-w-full cursor-pointer items-center rounded-lg border border-border px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <span className="truncate">{s}</span>
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-2">
        <label htmlFor={`ask-ai-${preset.key}`} className="sr-only">
          Câu hỏi AI
        </label>
        <textarea
          id={`ask-ai-${preset.key}`}
          rows={variant === 'full' ? 4 : 3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={4000}
          placeholder={preset.placeholder}
          className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Bot className="h-4 w-4" aria-hidden="true" />
            )}
            Hỏi AI
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={() => stop()}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
              Dừng
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error.message || 'Không gọi được AI. Kiểm tra API / kho tri thức.'}
        </p>
      )}

      {completion && (
        <div
          className={`rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            variant === 'full' ? 'max-h-[50vh] overflow-y-auto' : 'max-h-64 overflow-y-auto'
          }`}
        >
          {completion}
        </div>
      )}
    </div>
  )
}
