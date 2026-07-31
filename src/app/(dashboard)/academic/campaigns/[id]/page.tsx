'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Inbox,
  KeyRound,
  Link2,
  Loader2,
  Users,
  Vote,
} from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { Toast, type ToastData } from '@/components/shared/Toast'
import {
  generateEvaluationTokens,
  type IssuedToken,
} from '@/lib/actions/evaluations'
import {
  getCampaignDetail,
  type CampaignClassRow,
  type CampaignRow,
} from '../actions'

// ============================================================
// PHÂN PHỐI MÃ ĐÁNH GIÁ (/academic/campaigns/[id])
// Admin bấm "Sinh mã đánh giá cho Lớp X" -> danh sách học sinh kèm
// link public domain.com/evaluations/TOKEN -> "Copy link gửi Zalo".
// Link này cũng tự hiện trên Dashboard Cổng học sinh (/portal).
// ============================================================

function formatVnDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const campaignId = params.id

  const [campaign, setCampaign] = useState<CampaignRow | null>(null)
  const [classes, setClasses] = useState<CampaignClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [activeClass, setActiveClass] = useState<CampaignClassRow | null>(null)
  const [tokens, setTokens] = useState<IssuedToken[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  const loadData = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setLoadError(null)
    const result = await getCampaignDetail(campaignId)
    if (result.error !== undefined) {
      setLoadError(result.error)
      setCampaign(null)
      setClasses([])
    } else {
      setCampaign(result.campaign)
      setClasses(result.classes)
    }
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function buildLink(token: string): string {
    return `${window.location.origin}/evaluations/${token}`
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000)
    } catch {
      setToast({ type: 'error', message: 'Không copy được - trình duyệt chặn clipboard.' })
    }
  }

  async function handleGenerate(cls: CampaignClassRow) {
    setGeneratingFor(cls.classId)
    const result = await generateEvaluationTokens(campaignId, cls.classId)
    setGeneratingFor(null)
    if (result.error !== undefined) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setActiveClass(cls)
    setTokens(result.tokens)
    setToast({
      type: 'success',
      message:
        result.createdCount > 0
          ? `Đã sinh ${result.createdCount} mã mới cho lớp ${cls.className}.`
          : `Lớp ${cls.className} đã có đủ mã - hiển thị lại mã cũ.`,
    })
    loadData()
  }

  function copyAllLinks() {
    const lines = tokens
      .filter((t) => !t.isUsed)
      .map((t) => `${t.studentName}: ${buildLink(t.token)}`)
      .join('\n')
    copyToClipboard(lines, '__all__')
  }

  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Campus Admin / Super Admin được phân phối mã khảo sát.
        </p>
      }
    >
      <div className="space-y-6">
        <div>
          <Link
            href="/academic/campaigns"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Tất cả đợt khảo sát
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            <Vote className="h-7 w-7 text-primary" aria-hidden="true" />
            {campaign ? campaign.name : 'Đợt khảo sát'}
          </h1>
          {campaign && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatVnDate(campaign.startDate)} – {formatVnDate(campaign.endDate)} ·{' '}
              <span
                className={
                  campaign.status === 'active'
                    ? 'font-semibold text-emerald-600'
                    : 'font-semibold text-slate-500'
                }
              >
                {campaign.status === 'active' ? 'Đang mở' : 'Đã đóng'}
              </span>
            </p>
          )}
        </div>

        {loadError && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {loadError}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải dữ liệu đợt khảo sát…
          </div>
        ) : (
          campaign && (
            <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
              {/* ===== Danh sách lớp trong phạm vi đợt ===== */}
              <div className="space-y-3">
                {classes.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
                    <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      Không có lớp học nào trong phạm vi của đợt khảo sát này.
                    </p>
                  </div>
                ) : (
                  classes.map((cls) => (
                    <div
                      key={cls.classId}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface p-4 shadow-sm ${
                        activeClass?.classId === cls.classId
                          ? 'border-indigo-300 ring-1 ring-indigo-200'
                          : 'border-border'
                      }`}
                    >
                      <div>
                        <p className="font-heading text-sm font-bold text-foreground">
                          {cls.className}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          GV: {cls.teacherName} · {cls.enrolledCount} HS ghi danh ·{' '}
                          {cls.issuedCount > 0
                            ? `${cls.usedCount}/${cls.issuedCount} đã đánh giá`
                            : 'chưa phát mã'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGenerate(cls)}
                        disabled={generatingFor !== null || campaign.status !== 'active'}
                        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 text-sm font-semibold text-primary hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {generatingFor === cls.classId ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                        )}
                        Sinh mã đánh giá cho Lớp {cls.className}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* ===== Panel token + copy link Zalo ===== */}
              <div>
                {!activeClass ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
                    <Users className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      Bấm &quot;Sinh mã đánh giá&quot; ở một lớp để nhận danh sách link
                      gửi cho học sinh.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-heading text-base font-bold">
                        Link đánh giá — Lớp {activeClass.className}
                      </h2>
                      <button
                        type="button"
                        onClick={copyAllLinks}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {copiedKey === '__all__' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Copy tất cả
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Gửi mỗi link cho đúng học sinh đó qua Zalo. Link cũng tự hiện trên
                      Cổng học sinh (/portal). Mỗi mã dùng đúng 1 lần.
                    </p>

                    <ul className="mt-3 max-h-[480px] space-y-2 overflow-y-auto pr-1">
                      {tokens.map((tokenRow) => (
                        <li
                          key={tokenRow.studentId}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {tokenRow.studentName}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {tokenRow.token}
                              {tokenRow.isUsed && (
                                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-sans font-semibold text-emerald-700">
                                  Đã đánh giá
                                </span>
                              )}
                            </p>
                          </div>
                          {!tokenRow.isUsed && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(buildLink(tokenRow.token), tokenRow.token)
                                }
                                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {copiedKey === tokenRow.token ? (
                                  <>
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                    Đã copy
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Copy link gửi Zalo
                                  </>
                                )}
                              </button>
                              <a
                                href={`/evaluations/${tokenRow.token}`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Mở form đánh giá"
                                className="rounded-lg p-2 text-muted-foreground hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      </div>
    </RoleGuard>
  )
}
