'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { OrgBrandMark } from '@/components/shared/OrgBrandMark'
import {
  clearOrgLogo,
  getOrgLogo,
  uploadOrgLogo,
} from '@/app/(dashboard)/settings/actions'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { patchLogoInTree } from '@/lib/branding/orgBrand'

export function OrgLogoCard({
  orgId,
  onToast,
}: {
  orgId: string
  onToast: (t: { type: 'success' | 'error'; message: string }) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [r2Ready, setR2Ready] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const orgTree = useOrgStore((s) => s.orgTree)
  const userOrgId = useOrgStore((s) => s.userOrgId)
  const initializeOrg = useOrgStore((s) => s.initializeOrg)

  function syncStoreLogo(nextUrl: string | null) {
    initializeOrg(patchLogoInTree(orgTree, orgId, nextUrl), userOrgId)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getOrgLogo(orgId)
    setLogoUrl(r.logoUrl)
    setR2Ready(r.r2Ready)
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  async function onPick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.set('orgId', orgId)
    fd.set('file', file)
    const result = await uploadOrgLogo(fd)
    setBusy(false)
    if (result.error !== undefined) {
      onToast({ type: 'error', message: result.error })
      return
    }
    setLogoUrl(result.logoUrl)
    syncStoreLogo(result.logoUrl)
    onToast({
      type: 'success',
      message: 'Đã cập nhật logo — dùng thống nhất từ cổng login đến trong hệ thống.',
    })
  }

  async function onClear() {
    setBusy(true)
    const result = await clearOrgLogo(orgId)
    setBusy(false)
    if (result.error !== undefined) {
      onToast({ type: 'error', message: result.error })
      return
    }
    setLogoUrl(null)
    syncStoreLogo(null)
    onToast({ type: 'success', message: 'Đã gỡ logo — quay về biểu tượng EDU SYSTEM.' })
  }
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold text-foreground">Logo thương hiệu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Logo hiển thị trên cổng đăng nhập cơ sở và thanh điều hướng trong hệ thống.
            PNG / JPG / WebP / SVG — tối đa 2MB.
            {!r2Ready && (
              <span className="mt-1 block text-amber-700">
                R2 chưa cấu hình: chỉ nhận ảnh ≤ 200KB (lưu tạm trong DB).
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <OrgBrandMark logoUrl={logoUrl} size="lg" tone="light" alt="Logo cơ sở" />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          className="hidden"
          onChange={(e) => {
            void onPick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          )}
          {logoUrl ? 'Đổi logo' : 'Tải logo lên'}
        </button>
        {logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onClear()}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Gỡ logo
          </button>
        )}
      </div>
    </section>
  )
}
