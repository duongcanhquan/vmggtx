'use client'

import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type ToastData = {
  type: 'success' | 'error'
  message: string
}

/**
 * Toast nhẹ theo design system (thay Shadcn Toast chưa cài):
 * cố định góc dưới phải, tự tắt sau 5s, không cướp focus (aria-live).
 */
export function Toast({ toast, onClose }: { toast: ToastData; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [toast, onClose])

  const isError = toast.type === 'error'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-lg ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <p className="flex-1 text-sm leading-relaxed">
        {isError && <span className="font-semibold">Lỗi: </span>}
        {toast.message}
      </p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onClose}
        className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          isError ? 'hover:bg-rose-100' : 'hover:bg-emerald-100'
        }`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
