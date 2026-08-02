'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react'
import './landing.css'

export function useRevealRoot<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nodes = el.querySelectorAll('.lp-reveal, .lp-clip')
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
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    )
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [])
  return ref
}

function ScrollProgress() {
  useEffect(() => {
    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? window.scrollY / max : 0
      document.documentElement.style.setProperty('--lp-progress', String(p))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return <div className="lp-progress" aria-hidden="true" />
}

function SecretAdminBook() {
  const [near, setNear] = useState(false)
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setNear(e.clientX <= 110 && e.clientY >= window.innerHeight - 110)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])
  return (
    <Link
      href="/login/admin"
      aria-label="Cổng quản trị hệ thống"
      className={`lp-secret-book fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 shadow-lg backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${
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
      <div className="lp-mesh lp-grain fixed inset-0 -z-10" aria-hidden="true">
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
        <div className="lp-orb lp-orb-c" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#060912]/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/login" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-[0_8px_24px_-6px_rgba(56,160,180,0.65)]">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight text-white">
              EDU{' '}
              <span className="bg-gradient-to-r from-teal-200 via-sky-200 to-amber-200 bg-clip-text text-transparent">
                SYSTEM
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/gioi-thieu/linh-hoat"
              className={`hidden min-h-10 items-center rounded-xl px-3 text-sm font-medium transition sm:inline-flex ${
                activeSlug
                  ? 'text-white/90'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Khám phá
            </Link>
            <Link
              href="/hdsd"
              className="hidden min-h-10 items-center rounded-xl px-3 text-sm font-medium text-white/60 transition hover:text-white md:inline-flex"
            >
              Hướng dẫn
            </Link>
            <Link
              href="/coso"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0a1224] transition hover:bg-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              Vào cổng cơ sở
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-white/5 py-10 text-center text-xs text-white/35">
        <p>© {new Date().getFullYear()} EDU SYSTEM — Quản lý trường học đa cơ sở, lấy con người làm trung tâm</p>
      </footer>

      <SecretAdminBook />
    </div>
  )
}

/** Tách headline thành từng từ để stagger khi .lp-reveal vào viewport */
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
          style={{ transitionDelay: `${0.05 + i * 0.045}s` }}
        >
          {w}
          {i < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </span>
  )
}
