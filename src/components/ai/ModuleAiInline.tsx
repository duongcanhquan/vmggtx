'use client'

import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { MODULE_AI_PRESETS, type ModuleAiKey } from '@/lib/ai/moduleAssist'
import { useEffectiveOrgId } from '@/lib/ai/useEffectiveOrgId'
import { AskAiPanel } from '@/components/ai/AskAiPanel'

/** Khối AI thu gọn trên đầu trang module (CRM, HR, finance…). */
export function ModuleAiInline({
  moduleKey,
  defaultOpen = false,
}: {
  moduleKey: ModuleAiKey
  defaultOpen?: boolean
}) {
  const orgId = useEffectiveOrgId()
  const [open, setOpen] = useState(defaultOpen)
  const preset = MODULE_AI_PRESETS[moduleKey]

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">
            {preset.title} — hỏi nhanh trong trang này
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-border/60 px-3 pb-3 pt-1 sm:px-4">
          <AskAiPanel orgId={orgId} preset={preset} variant="compact" />
        </div>
      )}
    </div>
  )
}
