'use client'

import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { resolveLogoFromTree } from '@/lib/branding/orgBrand'
import { getMyBrandLogo } from '@/lib/branding/getMyBrandLogo'
import { findOrgNode } from '@/lib/utils/org-tree'

/** Emblem mặc định EDU SYSTEM (login kính) */
export function EmblemFallback({ className = 'h-[84px] w-[84px]' }: { className?: string }) {
  return (
    <span className={`mx-auto block drop-shadow-[0_4px_14px_rgba(93,104,232,0.35)] ${className}`}>
      <svg viewBox="0 0 96 96" role="img" aria-label="EDU SYSTEM" className="h-full w-full">
        <defs>
          <linearGradient id="au-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fdf0c2" />
            <stop offset="45%" stopColor="#eecf6d" />
            <stop offset="100%" stopColor="#b98a2e" />
          </linearGradient>
          <radialGradient id="au-glow" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="rgba(255,240,190,0.28)" />
            <stop offset="100%" stopColor="rgba(255,240,190,0)" />
          </radialGradient>
        </defs>
        <circle cx="48" cy="48" r="46" fill="url(#au-glow)" />
        <circle
          cx="48"
          cy="48"
          r="42"
          fill="rgba(255,255,255,0.06)"
          stroke="url(#au-gold)"
          strokeWidth="2.5"
        />
        <circle cx="48" cy="48" r="36.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        <path
          d="M48 17.5l3.3 7 7.6 1.1-5.5 5.3 1.3 7.6L48 34.9l-6.7 3.6 1.3-7.6-5.5-5.3 7.6-1.1z"
          fill="url(#au-gold)"
        />
        <path
          d="M27.5 49c7.5-4.2 14-4.2 20.5 0v20c-6.5-4.2-13-4.2-20.5 0z"
          fill="rgba(255,255,255,0.95)"
        />
        <path
          d="M68.5 49c-7.5-4.2-14-4.2-20.5 0v20c6.5-4.2 13-4.2 20.5 0z"
          fill="rgba(255,255,255,0.8)"
        />
        <path d="M48 49v20" stroke="url(#au-gold)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

type MarkProps = {
  /** URL tường minh (cổng login theo slug) */
  logoUrl?: string | null
  /** alt cho logo trường */
  alt?: string
  /** Kích thước khung logo */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Nền tối (sidebar) hay sáng */
  tone?: 'dark' | 'light' | 'glass'
  /** Hiện chữ EDU SYSTEM bên cạnh (shell) */
  showWordmark?: boolean
  /** Dòng phụ (Teacher Portal…) */
  subtitle?: string
  className?: string
}

const SIZE: Record<NonNullable<MarkProps['size']>, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
  xl: 'h-[72px] w-[72px]',
}

/**
 * Logo trường nếu có; không thì emblem / GraduationCap.
 * Khi không truyền logoUrl → lấy từ org đang chọn trong Zustand (leo cây).
 */
export function OrgBrandMark({
  logoUrl,
  alt = 'Logo',
  size = 'md',
  tone = 'dark',
  showWordmark = false,
  subtitle,
  className = '',
}: MarkProps) {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const orgTree = useOrgStore((s) => s.orgTree)
  const fromStore = logoUrl === undefined ? resolveLogoFromTree(currentOrgId, orgTree) : null
  const [fetched, setFetched] = useState<string | null>(null)
  const src = logoUrl === undefined ? fromStore || fetched : logoUrl
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    if (logoUrl !== undefined) return
    if (fromStore) return
    let alive = true
    getMyBrandLogo().then((url) => {
      if (alive) setFetched(url)
    })
    return () => {
      alive = false
    }
  }, [logoUrl, fromStore, currentOrgId])

  const box = SIZE[size]
  const frame =
    tone === 'glass'
      ? 'bg-white/15 ring-1 ring-white/40'
      : tone === 'light'
        ? 'bg-primary text-primary-foreground'
        : 'bg-gradient-to-br from-[#5d68e8] to-[#833ce6] text-white'

  const mark =
    src && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`${box} rounded-xl object-contain ${tone === 'glass' ? 'bg-white/90 p-1' : 'bg-white p-0.5'} shadow`}
        onError={() => setBroken(true)}
      />
    ) : size === 'xl' || tone === 'glass' ? (
      <EmblemFallback className={box} />
    ) : (
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-xl ${frame} shadow`}
      >
        <GraduationCap className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
    )

  const orgName =
    currentOrgId && orgTree.length > 0
      ? findOrgNode(orgTree, currentOrgId)?.name
      : null

  if (!showWordmark && !subtitle) {
    return <span className={className}>{mark}</span>
  }

  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      {mark}
      <span className="min-w-0">
        <span
          className={`block truncate font-heading text-base font-bold leading-tight tracking-tight ${
            tone === 'dark' ? 'text-white' : 'text-foreground'
          }`}
        >
          {src && orgName ? (
            orgName
          ) : (
            <>
              EDU{' '}
              <span
                className={
                  tone === 'dark'
                    ? 'bg-gradient-to-r from-[#a5b5f7] via-[#c9b5fc] to-[#ecc75a] bg-clip-text text-transparent'
                    : 'text-primary'
                }
              >
                SYSTEM
              </span>
            </>
          )}
        </span>
        {subtitle && (
          <span
            className={`block truncate text-[11px] font-semibold uppercase tracking-widest ${
              tone === 'dark' ? 'text-white/50' : 'text-muted-foreground'
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  )
}
