'use client'

import { useMemo, useState } from 'react'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  Lock,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  X,
} from 'lucide-react'
import type {
  TemplateRoleTarget,
  WidgetLayoutItem,
} from '@/app/(portals)/staff/dashboard-actions'

// ============================================================
// WidgetContainer - kho chứa widget kéo thả (react-grid-layout).
// - "Tùy biến trang": widget hiện viền nét đứt + RUNG NHẸ, có nút X
//   để ẩn; widget đã ẩn hiện thành chip "+ Thêm lại".
// - QTV: nút "Áp dụng layout cho toàn bộ nhân sự cùng cấp" -> ghi
//   global_layout_templates (kèm tùy chọn KHÓA user tự sửa).
// Dùng chung mọi portal: truyền widgets + hook useDashboardLayout.
// ============================================================

export type DashboardWidget = {
  id: string
  title: string
  node: React.ReactNode
}

const ROLE_OPTIONS: { value: TemplateRoleTarget; label: string }[] = [
  { value: 'academic_staff', label: 'Giáo vụ' },
  { value: 'admission_staff', label: 'Tuyển sinh' },
  { value: 'accountant', label: 'Kế toán' },
  { value: 'teacher', label: 'Giáo viên' },
  { value: 'campus_admin', label: 'Quản lý cơ sở' },
]

export function WidgetContainer({
  widgets,
  layout,
  hiddenWidgetIds,
  customizing,
  setCustomizing,
  isForced,
  canPushTemplate,
  onLayoutChange,
  onHideWidget,
  onShowWidget,
  onResetLayout,
  onPushTemplate,
}: {
  widgets: DashboardWidget[]
  layout: WidgetLayoutItem[]
  hiddenWidgetIds: string[]
  customizing: boolean
  setCustomizing: (value: boolean) => void
  isForced: boolean
  canPushTemplate: boolean
  onLayoutChange: (next: WidgetLayoutItem[]) => void
  onHideWidget: (widgetId: string) => void
  onShowWidget: (widgetId: string) => void
  onResetLayout: () => void
  onPushTemplate: (roleTarget: TemplateRoleTarget, isForced: boolean) => Promise<{ error?: string }>
}) {
  const [pushRole, setPushRole] = useState<TemplateRoleTarget>('academic_staff')
  const [pushForced, setPushForced] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMessage, setPushMessage] = useState<string | null>(null)
  // v2 API: đo width container bằng ResizeObserver (thay WidthProvider cũ)
  const { width, containerRef, mounted } = useContainerWidth()

  const widgetById = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets]
  )
  const titleById = (id: string) => widgetById.get(id)?.title ?? id

  const handleStop = (next: Layout) => {
    onLayoutChange(next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))
  }

  const handlePush = async () => {
    setPushing(true)
    setPushMessage(null)
    const result = await onPushTemplate(pushRole, pushForced)
    setPushing(false)
    setPushMessage(
      result.error !== undefined
        ? `Lỗi: ${result.error}`
        : `Đã áp layout cho toàn bộ nhân sự "${ROLE_OPTIONS.find((r) => r.value === pushRole)?.label}"${pushForced ? ' (khóa tự sửa)' : ''}.`
    )
  }

  return (
    <div className="space-y-4">
      {/* ===== Thanh công cụ tùy biến ===== */}
      <div className="flex flex-wrap items-center gap-2">
        {isForced ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Layout do Quản trị viên áp đặt — không thể tự thay đổi.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setCustomizing(!customizing)}
            aria-pressed={customizing}
            className={`flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition-colors ${
              customizing
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-surface text-foreground hover:border-indigo-300'
            }`}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            {customizing ? 'Xong — thoát tùy biến' : 'Tùy biến trang'}
          </button>
        )}

        {customizing && (
          <>
            <button
              type="button"
              onClick={onResetLayout}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Về mặc định
            </button>
            {hiddenWidgetIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onShowWidget(id)}
                className="flex min-h-10 items-center gap-1 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {titleById(id)}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ===== QTV: áp layout cho nhân sự cùng cấp ===== */}
      {customizing && canPushTemplate && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <span className="text-xs font-semibold text-amber-800">
            Áp dụng layout này cho toàn bộ nhân sự:
          </span>
          <select
            value={pushRole}
            onChange={(e) => setPushRole(e.target.value as TemplateRoleTarget)}
            className="min-h-9 rounded-xl border border-amber-200 bg-white px-2.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <input
              type="checkbox"
              checked={pushForced}
              onChange={(e) => setPushForced(e.target.checked)}
              className="h-4 w-4 rounded border-amber-300"
            />
            Khóa (user không được tự sửa)
          </label>
          <button
            type="button"
            onClick={() => void handlePush()}
            disabled={pushing}
            className="flex min-h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {pushing ? 'Đang áp dụng…' : 'Áp dụng'}
          </button>
          {pushMessage && (
            <span
              className={`text-xs font-medium ${pushMessage.startsWith('Lỗi') ? 'text-rose-700' : 'text-emerald-700'}`}
            >
              {pushMessage}
            </span>
          )}
        </div>
      )}

      {/* ===== Lưới kéo thả ===== */}
      {/* Cast ref: thư viện build theo types React 19, dự án dùng React 18 */}
      <div ref={containerRef as React.RefObject<HTMLDivElement>}>
        {mounted && (
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: 12, rowHeight: 56, margin: [16, 16], containerPadding: [0, 0] }}
            dragConfig={{ enabled: customizing && !isForced, cancel: '.no-drag' }}
            resizeConfig={{ enabled: customizing && !isForced }}
            onDragStop={handleStop}
            onResizeStop={handleStop}
          >
            {layout.map((item) => {
              const widget = widgetById.get(item.i)
              if (!widget) return <div key={item.i} className="hidden" />
              return (
                <div key={item.i} className={customizing ? 'cursor-grab active:cursor-grabbing' : ''}>
                  {/* Wiggle đặt ở lớp trong để không đè transform định vị của RGL */}
                  <div
                    className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-sm transition-shadow ${
                      customizing ? 'widget-wiggle border-dashed border-indigo-400' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                      <h2 className="truncate font-heading text-sm font-bold">{widget.title}</h2>
                      {customizing && !isForced && (
                        <button
                          type="button"
                          aria-label={`Ẩn widget ${widget.title}`}
                          onClick={() => onHideWidget(item.i)}
                          className="no-drag flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-4">{widget.node}</div>
                  </div>
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>

      {layout.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          Mọi widget đang ẩn — bấm &quot;Tùy biến trang&quot; rồi thêm lại widget bạn cần.
        </div>
      )}
    </div>
  )
}
