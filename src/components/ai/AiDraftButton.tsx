'use client'

import { useCompletion } from 'ai/react'
import { Loader2, Sparkles } from 'lucide-react'
import { useRef } from 'react'
import type { DraftMode } from '@/lib/ai/draftAssist'
import { AI_NOT_ACTIVATED_MESSAGE } from '@/lib/ai/aiMessages'
import { getAiAssistStatus } from '@/lib/ai/getAiAssistStatus'

type Props = {
  orgId: string | null
  draftMode: DraftMode
  /** Ngữ cảnh form: đối tượng nhận, loại nghỉ, mô tả cảnh báo… */
  contextHint?: string
  /** Prompt gửi AI (mặc định theo mode) */
  prompt?: string
  label?: string
  disabled?: boolean
  className?: string
  onDraft: (text: string) => void
  onError?: (message: string) => void
}

const DEFAULT_PROMPTS: Record<DraftMode, string> = {
  announcement: 'Soạn thông báo nội bộ ngắn gọn, rõ ràng, lịch sự.',
  parent_warning:
    'Soạn ghi chú xử lý / nội dung nhắn phụ huynh về cảnh báo học vụ, lịch sự, không đổ lỗi.',
  contact_book: 'Soạn dặn dò phụ huynh ngắn cho sổ liên lạc điện tử.',
  exam_paper: 'Soạn khung đề kiểm tra (câu hỏi + điểm gợi ý) theo thông tin môn/khối.',
  invoice_note: 'Soạn nội dung khoản thu học phí ngắn, rõ ràng.',
  leave_reason: 'Soạn lý do xin nghỉ phép ngắn gọn, chuyên nghiệp.',
  session_note: 'Soạn nhận xét buổi học nội bộ ngắn gọn cho sổ đầu bài.',
}

/**
 * Nút «AI soạn» — gọi draft_assist, trả plain text để điền form.
 */
export function AiDraftButton({
  orgId,
  draftMode,
  contextHint = '',
  prompt,
  label = 'AI soạn',
  disabled,
  className = '',
  onDraft,
  onError,
}: Props) {
  const onDraftRef = useRef(onDraft)
  const onErrorRef = useRef(onError)
  onDraftRef.current = onDraft
  onErrorRef.current = onError

  const { isLoading, complete } = useCompletion({
    api: '/api/ai/copilot',
    body: {
      taskType: 'draft_assist',
      orgId,
      draftMode,
      contextHint: contextHint.slice(0, 2500),
    },
    onFinish: (_prompt, completionText) => {
      const text = completionText.trim()
      if (text) onDraftRef.current(text)
      else onErrorRef.current?.('AI không trả về nội dung.')
    },
    onError: (err) => {
      onErrorRef.current?.(err.message || AI_NOT_ACTIVATED_MESSAGE)
    },
  })

  async function run() {
    if (!orgId || isLoading || disabled) {
      if (!orgId) onErrorRef.current?.('Chọn cơ sở trên header trước khi dùng AI.')
      return
    }
    const status = await getAiAssistStatus(orgId)
    if (!status.ready) {
      onErrorRef.current?.(status.message || AI_NOT_ACTIVATED_MESSAGE)
      return
    }
    await complete(prompt?.trim() || DEFAULT_PROMPTS[draftMode], {
      body: {
        taskType: 'draft_assist',
        orgId,
        draftMode,
        contextHint: contextHint.slice(0, 2500),
      },
    })
  }

  return (
    <button
      type="button"
      disabled={disabled || isLoading || !orgId}
      onClick={() => void run()}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {isLoading ? 'Đang soạn…' : label}
    </button>
  )
}
