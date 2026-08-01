'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  Flag,
  Loader2,
  RadarIcon,
  Send,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  getWarnings,
  runEarlyWarningSystem,
  sendParentNotification,
  type WarningRow,
  type WarningStatus,
  type WarningType,
} from './actions'

// ============================================================
// Cảnh báo học vụ sớm (/academic/warnings) - Campus Admin/Giáo vụ
// - Cờ ĐỎ  : vắng nhiều (chuyên cần)
// - Cờ CAM : học yếu (ĐTB < 5.0)
// - "Quét cảnh báo" chạy runEarlyWarningSystem trên org đang chọn.
// - "Gửi thông báo Phụ huynh" bắn sang n8n -> tin nhắn Zalo.
// ============================================================

const TYPE_META: Record<
  WarningType,
  { label: string; badgeClass: string; flagClass: string }
> = {
  attendance: {
    label: 'Vắng nhiều',
    badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
    flagClass: 'text-rose-600',
  },
  grade: {
    label: 'Yếu kém',
    badgeClass: 'bg-orange-50 text-orange-700 border border-orange-200',
    flagClass: 'text-orange-500',
  },
}

const STATUS_META: Record<WarningStatus, { label: string; className: string }> = {
  new: { label: 'Chưa gửi', className: 'bg-slate-100 text-slate-700' },
  notified: { label: 'Đã báo PH', className: 'bg-emerald-50 text-emerald-700' },
  resolved: { label: 'Đã xử lý', className: 'bg-indigo-50 text-indigo-700' },
}

export default function AcademicWarningsPage() {
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [warnings, setWarnings] = useState<WarningRow[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadWarnings = useCallback(async () => {
    if (!currentOrgId) return
    setLoading(true)
    const result = await getWarnings(currentOrgId)
    setWarnings(result.data)
    setIsDemo(result.demo)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadWarnings()
  }, [loadWarnings])

  const newWarnings = useMemo(
    () => warnings.filter((w) => w.status === 'new'),
    [warnings]
  )
  const attendanceCount = warnings.filter((w) => w.warning_type === 'attendance').length
  const gradeCount = warnings.filter((w) => w.warning_type === 'grade').length

  async function handleScan() {
    if (!currentOrgId) {
      setToast({ type: 'error', message: 'Vui lòng chọn cấp quản lý ở góc trên bên phải.' })
      return
    }
    setScanning(true)
    const result = await runEarlyWarningSystem(currentOrgId)
    setScanning(false)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Quét xong: ${result.attendance} cảnh báo chuyên cần, ${result.grade} cảnh báo học lực.`,
    })
    loadWarnings()
  }

  async function handleSend(ids: string[]) {
    if (ids.length === 0) {
      setToast({ type: 'error', message: 'Không có cảnh báo nào ở trạng thái "Chưa gửi".' })
      return
    }
    const result = await sendParentNotification(ids)

    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setToast({
      type: 'success',
      message: `Đã gửi ${result.sent} thông báo Zalo cho phụ huynh qua n8n.`,
    })
    loadWarnings()
  }

  async function handleSendOne(id: string) {
    setSendingIds((prev) => new Set(prev).add(id))
    await handleSend([id])
    setSendingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function handleSendAll() {
    setSendingAll(true)
    await handleSend(newWarnings.map((w) => w.id))
    setSendingAll(false)
  }

  return (
    <div className="space-y-6">
      {/* ===== Header ===== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Cảnh báo học vụ sớm
          </h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RadarIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {scanning ? 'Đang quét…' : 'Quét cảnh báo'}
          </button>
          <button
            type="button"
            onClick={handleSendAll}
            disabled={sendingAll || newWarnings.length === 0}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <BellRing className="h-4 w-4" aria-hidden="true" />
            )}
            Gửi thông báo Phụ huynh ({newWarnings.length})
          </button>
        </div>
      </div>

      {isDemo && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang hiển thị dữ liệu demo (chưa đăng nhập hoặc database trống).
        </p>
      )}

      {/* ===== Thẻ tổng hợp ===== */}
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rose-700">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Vắng nhiều
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-rose-700">
            {attendanceCount}
          </p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Yếu kém
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-orange-700">
            {gradeCount}
          </p>
        </div>
      </div>

      {/* ===== Bảng cảnh báo ===== */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải danh sách cảnh báo…
          </div>
        ) : warnings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Chưa có cảnh báo nào.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-indigo-50/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-semibold">Học sinh</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Lớp</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Cờ cảnh báo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Chi tiết</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {warnings.map((warning) => {
                  const typeMeta = TYPE_META[warning.warning_type]
                  const statusMeta = STATUS_META[warning.status]
                  const isSending = sendingIds.has(warning.id)
                  return (
                    <tr
                      key={warning.id}
                      className={`border-b border-border last:border-b-0 ${
                        warning.warning_type === 'attendance'
                          ? 'bg-rose-50/40'
                          : 'bg-orange-50/30'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{warning.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {warning.student_phone ?? 'Chưa có SĐT'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{warning.class_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{warning.org_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${typeMeta.badgeClass}`}
                        >
                          <Flag className={`h-3.5 w-3.5 ${typeMeta.flagClass}`} aria-hidden="true" />
                          {typeMeta.label}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-muted-foreground">
                        {warning.description}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {warning.status === 'new' ? (
                          <button
                            type="button"
                            onClick={() => handleSendOne(warning.id)}
                            disabled={isSending}
                            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-700 transition-colors duration-150 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Send className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Gửi PH
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
