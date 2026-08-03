'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarRange,
  ChevronRight,
  Inbox,
  Loader2,
  Plus,
  Vote,
  X,
} from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { campaignSchema, type CampaignValues } from '@/lib/validation/schemas'
import { createCampaign, getCampaigns, type CampaignRow } from './actions'
import { FunLoader } from '@/components/shared/FunLoader'

// ============================================================
// DANH SÁCH ĐỢT KHẢO SÁT GIÁO VIÊN (/academic/campaigns)
// Tạo đợt mới + đi vào trang phân phối mã ([id]).
// ============================================================

function formatVnDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export default function CampaignsPage() {
  const router = useRouter()
  const currentOrgId = useOrgStore((state) => state.currentOrgId)

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CampaignValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { orgId: currentOrgId ?? '', name: '', startDate: '', endDate: '' },
  })

  const loadData = useCallback(async () => {
    if (!currentOrgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    const result = await getCampaigns(currentOrgId)
    if (result.error !== undefined) {
      setLoadError(result.error)
      setCampaigns([])
    } else {
      setCampaigns(result.campaigns)
    }
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function onSubmit(values: CampaignValues) {
    const result = await createCampaign({ ...values, orgId: currentOrgId ?? '' })
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    const tokenHint =
      result.createdTokenCount > 0
        ? ` Đã phát ${result.createdTokenCount} phiếu cho ${result.classCount} lớp.`
        : ' Có thể đồng bộ lại mã trên trang chi tiết nếu chưa có phiếu.'
    setToast({ type: 'success', message: `Đã mở đợt khảo sát.${tokenHint}` })
    setShowForm(false)
    reset()
    router.push(`/academic/campaigns/${result.id}`)
  }

  return (
    <RoleGuard
      allowedRoles={['campus_admin', 'academic_staff']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Quản lý cơ sở / Giáo vụ được quản lý đợt khảo sát.
        </p>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              <Vote className="h-7 w-7 text-primary" aria-hidden="true" />
              Đợt khảo sát Giáo viên
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Mở đợt = bật đánh giá trong kỳ. Hệ thống tự phát phiếu cho học sinh các lớp đang học
              (mỗi lớp 1 lần / kỳ).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Mở đợt khảo sát
          </button>
        </div>

        {loadError && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {loadError}
          </p>
        )}

        {loading ? (
          <FunLoader label="Đang tải danh sách đợt khảo sát…" />
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Chưa có đợt khảo sát nào.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/academic/campaigns/${campaign.id}`}
                className="group rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      campaign.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {campaign.status === 'active' ? 'Đang mở' : 'Đã đóng'}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-3 font-heading text-base font-bold text-foreground group-hover:text-primary">
                  {campaign.name}
                </h2>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarRange className="h-4 w-4" aria-hidden="true" />
                  {formatVnDate(campaign.startDate)} – {formatVnDate(campaign.endDate)}
                </p>
              </Link>
            ))}
          </div>
        )}

        {/* ===== Modal tạo đợt ===== */}
        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Tạo đợt khảo sát"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-bold">Mở đợt khảo sát (1 kỳ)</h2>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  aria-label="Đóng"
                  className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="name" className="text-sm font-semibold">
                    Tên đợt khảo sát
                  </label>
                  <input
                    id="name"
                    {...register('name')}
                    placeholder="VD: Đánh giá GV — Học kỳ 1/2026"
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="startDate" className="text-sm font-semibold">
                      Từ ngày
                    </label>
                    <input
                      id="startDate"
                      type="date"
                      {...register('startDate')}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {errors.startDate && (
                      <p className="mt-1 text-xs text-rose-600">{errors.startDate.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="endDate" className="text-sm font-semibold">
                      Đến ngày
                    </label>
                    <input
                      id="endDate"
                      type="date"
                      {...register('endDate')}
                      className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {errors.endDate && (
                      <p className="mt-1 text-xs text-rose-600">{errors.endDate.message}</p>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Mở đợt & phát phiếu cho học sinh
                </button>
              </form>
            </div>
          </div>
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
