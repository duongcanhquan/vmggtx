import { Bot } from 'lucide-react'

export default function StudentAssistantPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Trợ lý AI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gia sư AI hỗ trợ ôn tập dựa trên tài liệu của lớp bạn đang học.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Bot className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          Tính năng đang được phát triển — sẽ kết nối Chat Gia sư RAG
          (/api/chat/tutor) theo lớp bạn ghi danh trong bản cập nhật tới.
        </p>
      </div>
    </div>
  )
}
