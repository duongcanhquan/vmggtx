'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyLayoutTemplate,
  getDashboardLayout,
  saveDashboardLayout,
  type TemplateRoleTarget,
  type WidgetLayoutItem,
} from '@/app/(portals)/staff/dashboard-actions'

// ============================================================
// useDashboardLayout - hook CÁ NHÂN HÓA dashboard (migration 034)
// - Fetch layout: user_preferences -> fallback global_layout_templates
//   theo role (server action lo phần ưu tiên + is_forced).
// - saveLayout: gọi sau mỗi lần kéo thả xong (onDragStop/onResizeStop).
// - hide/show widget + applyTemplate cho QTV.
// Pattern dùng chung: mọi portal chỉ cần truyền defaultLayout riêng.
// ============================================================

export type UseDashboardLayoutResult = {
  /** Layout đang hiển thị (đã lọc widget không tồn tại) */
  layout: WidgetLayoutItem[]
  /** Widget đã ẩn (có trong danh mục nhưng không nằm trong layout) */
  hiddenWidgetIds: string[]
  loading: boolean
  /** Chế độ tùy biến (viền nét đứt + rung nhẹ + nút X) */
  customizing: boolean
  setCustomizing: (value: boolean) => void
  /** true = QTV ép layout, user thường bị khóa tùy biến */
  isForced: boolean
  /** true = được áp layout cho toàn bộ nhân sự 1 role */
  canPushTemplate: boolean
  /** Database chưa chạy migration 034 (vẫn dùng được, không lưu) */
  migrationMissing: boolean
  /** Cập nhật layout sau kéo thả + LƯU server */
  handleLayoutChange: (next: WidgetLayoutItem[]) => void
  hideWidget: (widgetId: string) => void
  showWidget: (widgetId: string) => void
  resetLayout: () => void
  /** QTV áp layout hiện tại cho toàn bộ nhân sự role đích */
  pushTemplate: (
    roleTarget: TemplateRoleTarget,
    isForced: boolean
  ) => Promise<{ error?: string }>
  /** Lỗi lưu gần nhất (hiện toast) */
  saveError: string | null
  clearSaveError: () => void
}

export function useDashboardLayout(options: {
  /** Toàn bộ widget khả dụng của portal này */
  widgetIds: string[]
  /** Layout mặc định khi user chưa có cấu hình nào */
  defaultLayout: WidgetLayoutItem[]
}): UseDashboardLayoutResult {
  const { widgetIds, defaultLayout } = options
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(defaultLayout)
  const [loading, setLoading] = useState(true)
  const [customizing, setCustomizing] = useState(false)
  const [isForced, setIsForced] = useState(false)
  const [canPushTemplate, setCanPushTemplate] = useState(false)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getDashboardLayout().then((result) => {
      if (cancelled) return
      if (result.error === undefined) {
        if (result.layout) {
          // Chỉ giữ widget còn tồn tại trong danh mục hiện tại
          const valid = result.layout.filter((item) => widgetIds.includes(item.i))
          if (valid.length > 0) setLayout(valid)
        }
        setIsForced(result.isForced)
        setCanPushTemplate(result.canPushTemplate)
        setMigrationMissing(result.migrationMissing)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hiddenWidgetIds = useMemo(
    () => widgetIds.filter((id) => !layout.some((item) => item.i === id)),
    [widgetIds, layout]
  )

  const persist = useCallback((next: WidgetLayoutItem[]) => {
    void saveDashboardLayout(next).then((result) => {
      if (result.error !== undefined) setSaveError(result.error)
    })
  }, [])

  const handleLayoutChange = useCallback(
    (next: WidgetLayoutItem[]) => {
      const clean = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
      setLayout(clean)
      persist(clean)
    },
    [persist]
  )

  const hideWidget = useCallback(
    (widgetId: string) => {
      setLayout((prev) => {
        const next = prev.filter((item) => item.i !== widgetId)
        persist(next)
        return next
      })
    },
    [persist]
  )

  const showWidget = useCallback(
    (widgetId: string) => {
      const template = defaultLayout.find((item) => item.i === widgetId)
      setLayout((prev) => {
        if (prev.some((item) => item.i === widgetId)) return prev
        const maxY = prev.reduce((max, item) => Math.max(max, item.y + item.h), 0)
        const next = [
          ...prev,
          { i: widgetId, x: 0, y: maxY, w: template?.w ?? 4, h: template?.h ?? 4 },
        ]
        persist(next)
        return next
      })
    },
    [defaultLayout, persist]
  )

  const resetLayout = useCallback(() => {
    setLayout(defaultLayout)
    persist(defaultLayout)
  }, [defaultLayout, persist])

  const pushTemplate = useCallback(
    async (roleTarget: TemplateRoleTarget, forced: boolean) => {
      const result = await applyLayoutTemplate(roleTarget, layout, forced)
      return result.error !== undefined ? { error: result.error } : {}
    },
    [layout]
  )

  return {
    layout,
    hiddenWidgetIds,
    loading,
    customizing,
    setCustomizing,
    isForced,
    canPushTemplate,
    migrationMissing,
    handleLayoutChange,
    hideWidget,
    showWidget,
    resetLayout,
    pushTemplate,
    saveError,
    clearSaveError: () => setSaveError(null),
  }
}
