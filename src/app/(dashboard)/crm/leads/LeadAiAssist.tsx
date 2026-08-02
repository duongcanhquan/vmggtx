'use client'

import { useCompletion } from 'ai/react'
import { Bot, Loader2, Sparkles, StopCircle } from 'lucide-react'
import { useState } from 'react'

type Mode = 'rag' | 'counsel_script' | 'summarize' | 'draft_followup'

const QUICK: { mode: Mode; label: string; prompt: string }[] = [
  {
    mode: 'summarize',
    label: 'Tóm tắt lead',
    prompt: 'Tóm tắt hồ sơ và nhật ký, nêu rủi ro + bước follow-up.',
  },
  {
    mode: 'counsel_script',
    label: 'Kịch bản gọi',
    prompt: 'Soạn kịch bản gọi điện tư vấn phù hợp lead này.',
  },
  {
    mode: 'draft_followup',
    label: 'Tin follow-up',
    prompt: 'Soạn tin nhắn Zalo/SMS follow-up ngắn để chốt lịch.',
  },
  {
    mode: 'rag',
    label: 'Hỏi RAG',
    prompt: '',
  },
]

export function LeadAiAssist({
  orgId,
  leadId,
  enabled = true,
}: {
  orgId: string
  leadId: string
  enabled?: boolean
}) {
  const [mode, setMode] = useState<Mode>('rag')

  const {
    completion,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    error,
    complete,
  } = useCompletion({
    api: '/api/ai/copilot',
    body: { taskType: 'crm_assist', orgId, leadId, mode },
  })

  async function runQuick(item: (typeof QUICK)[number]) {
    setMode(item.mode)
    if (item.mode === 'rag' && !item.prompt) {
      setInput('Học phí và lịch khai giảng chương trình phù hợp lead này?')
      return
    }
    await complete(item.prompt || 'Hỗ trợ tư vấn tuyển sinh cho lead này.', {
      body: { taskType: 'crm_assist', orgId, leadId, mode: item.mode },
    })
  }

  if (!enabled) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        AI tuyển sinh đang tắt. Bật tại <strong>Cài đặt → Tuyển sinh / CRM</strong>. Upload tài
        liệu FAQ tại <strong>/ai/knowledge-base</strong> (metadata category=admissions).
      </p>
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
        Trợ lý AI tuyển sinh
      </p>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((item) => (
          <button
            key={item.mode + item.label}
            type="button"
            disabled={isLoading}
            onClick={() => void runQuick(item)}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="crm-ai-q" className="sr-only">
          Câu hỏi AI
        </label>
        <textarea
          id="crm-ai-q"
          rows={3}
          value={input}
          onChange={(e) => {
            setMode('rag')
            handleInputChange(e)
          }}
          placeholder="Hỏi về học phí, chương trình, lịch khai giảng… (RAG theo tài liệu cơ sở)"
          className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
              onClick={stop}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold"
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
              Dừng
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message || 'AI đang bảo trì hoặc chưa cấu hình API key.'}
        </p>
      )}

      {completion && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">
          {completion}
        </div>
      )}
    </div>
  )
}
