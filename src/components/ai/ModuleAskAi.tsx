'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, X } from 'lucide-react'
import { resolveModuleAiFromPath } from '@/lib/ai/moduleAssist'
import { useEffectiveOrgId } from '@/lib/ai/useEffectiveOrgId'
import { AskAiPanel } from './AskAiPanel'

/**
 * Nút nổi "Hỏi AI" trên dashboard — đổi ngữ cảnh theo route (CRM, đào tạo, HR…).
 * Ẩn trên /admin (Super Admin kiến trúc) và khi chưa chọn org.
 */
export function ModuleAskAi() {
  const pathname = usePathname() || '/'
  const orgId = useEffectiveOrgId()
  const [open, setOpen] = useState(false)

  const preset = resolveModuleAiFromPath(pathname)
  const hide =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/settings/layout')

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (hide) return null

  return (
    <>
      <button
        type="button"
        aria-label={`Mở ${preset.title}`}
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-4 z-40 inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6 sm:right-6"
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
        <span className="hidden sm:inline">Hỏi AI</span>
        <span className="max-w-[9rem] truncate text-xs font-medium opacity-90 sm:max-w-[11rem]">
          · {preset.title.replace(/^AI\s*/, '')}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-end sm:p-6">
          <button
            type="button"
            aria-label="Đóng trợ lý AI"
            className="absolute inset-0 cursor-pointer bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="module-ask-ai-title"
            className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-xl sm:max-h-[80vh] sm:w-full sm:max-w-lg sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="module-ask-ai-title" className="text-sm font-semibold">
                {preset.title}
              </h2>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl hover:bg-muted"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <AskAiPanel orgId={orgId} preset={preset} variant="full" />
              <p className="mt-3 text-xs text-muted-foreground">
                Nạp tài liệu đúng category tại{' '}
                <a href="/ai/knowledge-base" className="font-medium text-primary underline">
                  Kho tri thức AI
                </a>
                . API theo đơn vị: Cài đặt → AI.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
