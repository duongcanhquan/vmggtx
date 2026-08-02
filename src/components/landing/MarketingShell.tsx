'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react'
import { KNOWLEDGE_STREAM } from './chapters'
import './landing.css'

function KnowledgeRiver() {
  const row = [...KNOWLEDGE_STREAM, ...KNOWLEDGE_STREAM]
  return (
    <>
      {/* Dải ngang — luôn chạy trên mọi trang marketing */}
      <div className="lp-knowledge-bar" aria-hidden="true">
        <div className="lp-knowledge-track">
          {row.map((term, i) => (
            <span key={`k-${i}`} className="lp-knowledge-chip">
              {term}
              <span className="lp-knowledge-dot" />
            </span>
          ))}
        </div>
      </div>
      {/* Cột dọc hai bên (desktop) — dòng chảy kiến thức không ngừng */}
      <div className="lp-knowledge-rail lp-knowledge-rail-l" aria-hidden="true">
        <div className="lp-knowledge-rail-track">
          {[...row, ...row].map((term, i) => (
            <span key={`l-${i}`}>{term}</span>
          ))}
        </div>
      </div>
      <div className="lp-knowledge-rail lp-knowledge-rail-r" aria-hidden="true">
        <div className="lp-knowledge-rail-track lp-knowledge-rail-track-rev">
          {[...row, ...row].map((term, i) => (
            <span key={`r-${i}`}>{term}</span>
          ))}
        </div>
      </div>
    </>
  )
}

export function useRevealRoot<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Hero / above-fold: hiện ngay, không chờ scroll
    el.querySelectorAll('.lp-instant').forEach((n) => n.classList.add('is-in'))

    const nodes = el.querySelectorAll('.lp-reveal:not(.is-in), .lp-clip:not(.is-in)')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' }
    )
    nodes.forEach((n) => io.observe(n))
    // Fallback: phần tử đã trong viewport lúc mount
    requestAnimationFrame(() => {
      nodes.forEach((n) => {
        const r = n.getBoundingClientRect()
        if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
          n.classList.add('is-in')
          io.unobserve(n)
        }
      })
    })
    return () => io.disconnect()
  }, [])
  return ref
}

function ScrollProgress() {
  useEffect(() => {
    let raf = 0
    function tick() {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? window.scrollY / max : 0
      document.documentElement.style.setProperty('--lp-progress', String(p))
      raf = 0
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return <div className="lp-progress" aria-hidden="true" />
}

function Particles() {
  const dots = Array.from({ length: 14 }, (_, i) => i)
  return (
    <div className="lp-particles pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {dots.map((i) => (
        <span
          key={i}
          style={{
            left: `${6 + ((i * 17) % 88)}%`,
            bottom: `${(i * 11) % 40}%`,
            animationDuration: `${7 + (i % 5)}s`,
            animationDelay: `${(i % 7) * 0.6}s`,
            width: i % 3 === 0 ? 4 : 2,
            height: i % 3 === 0 ? 4 : 2,
            background:
              i % 2 === 0 ? 'rgba(94,234,212,0.45)' : 'rgba(236,199,90,0.4)',
          }}
        />
      ))}
    </div>
  )
}

function SecretAdminBook() {
  const [near, setNear] = useState(false)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setNear(e.clientX <= 100 && e.clientY >= window.innerHeight - 100)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  return (
    <Link
      href="/login/admin"
      aria-label="Cổng quản trị hệ thống"
      className={`lp-secret-book fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${
        near ? 'is-near' : ''
      }`}
    >
      <BookOpen className="h-5 w-5" aria-hidden="true" strokeWidth={1.6} />
    </Link>
  )
}

export function MarketingShell({
  children,
  activeSlug,
}: {
  children: ReactNode
  activeSlug?: string
}) {
  return (
    <div className="lp-root relative min-h-dvh">
      <ScrollProgress />
      <div className="lp-mesh fixed inset-0 -z-10" aria-hidden="true">
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
        <div className="lp-orb lp-orb-c" />
        <Particles />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#060912]/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/login" className="flex items-center gap-2.5">
            <span className="lp-pulse-ring flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-teal-600 text-white">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-heading text-xl font-bold tracking-tight text-white sm:text-2xl">
              EDU{' '}
              <span className="bg-gradient-to-r from-teal-200 via-sky-200 to-amber-200 bg-clip-text text-transparent">
                SYSTEM
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/gioi-thieu/linh-hoat"
              className={`hidden min-h-10 items-center rounded-xl px-3 text-sm font-semibold transition sm:inline-flex ${
                activeSlug ? 'text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Khám phá
            </Link>
            <a
              href="/login#tinh-nang"
              className="hidden min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-white/60 transition hover:text-white md:inline-flex"
            >
              Tính năng
            </a>
            <Link
              href="/coso"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#0a1224] transition hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              Vào cổng cơ sở
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
        <KnowledgeRiver />
      </header>

      {children}

      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/35">
        <p>© {new Date().getFullYear()} EDU SYSTEM — Quản lý trường học đa cơ sở</p>
      </footer>

      <SecretAdminBook />
    </div>
  )
}

export function StaggerWords({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const words = text.split(' ')
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          className="lp-word"
          style={{ transitionDelay: `${0.04 + i * 0.04}s` }}
        >
          {w}
          {i < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </span>
  )
}
