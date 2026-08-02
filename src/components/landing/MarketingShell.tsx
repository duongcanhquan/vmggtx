'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react'
import './landing.css'

/** Công thức mờ làm nền — mép/góc viewport (tránh vùng chữ giữa trang) */
const FORMULA_FIELD: {
  text: string
  top?: string
  left?: string
  right?: string
  bottom?: string
  size: string
  delay: string
  dur: string
  drift: 'a' | 'b' | 'c'
}[] = [
  { text: 'E = mc²', top: '14%', left: '2%', size: '1.5rem', delay: '0s', dur: '10s', drift: 'a' },
  { text: 'a² + b² = c²', top: '32%', left: '1%', size: '1.15rem', delay: '1.8s', dur: '13s', drift: 'b' },
  { text: '∫ f(x) dx', top: '50%', left: '3%', size: '1.3rem', delay: '3.5s', dur: '11s', drift: 'c' },
  { text: 'F = ma', top: '68%', left: '1.5%', size: '1.25rem', delay: '0.6s', dur: '12s', drift: 'a' },
  { text: 'lim x→∞', top: '84%', left: '4%', size: '1.05rem', delay: '5s', dur: '14s', drift: 'b' },
  { text: 'H₂O', top: '16%', right: '3%', size: '1.55rem', delay: '1s', dur: '9s', drift: 'c' },
  { text: 'V = IR', top: '34%', right: '1.5%', size: '1.2rem', delay: '4s', dur: '11s', drift: 'a' },
  { text: 'PV = nRT', top: '52%', right: '2.5%', size: '1.1rem', delay: '2.2s', dur: '13s', drift: 'b' },
  { text: 'C₆H₁₂O₆', top: '70%', right: '1%', size: '1.05rem', delay: '3s', dur: '10s', drift: 'c' },
  { text: 'λ = h / p', top: '86%', right: '3%', size: '1rem', delay: '6s', dur: '15s', drift: 'a' },
  { text: 'Present Perfect', top: '22%', right: '14%', size: '0.95rem', delay: '2.5s', dur: '14s', drift: 'b' },
  { text: 'Subject + Verb', bottom: '12%', left: '12%', size: '0.95rem', delay: '4.5s', dur: '13s', drift: 'c' },
  { text: 'NaCl → Na⁺ + Cl⁻', bottom: '18%', right: '12%', size: '0.95rem', delay: '1.5s', dur: '12s', drift: 'a' },
  { text: '√(x² + y²)', top: '44%', left: '6%', size: '1rem', delay: '7s', dur: '16s', drift: 'b' },
  { text: 'Δx · Δp ≥ ℏ/2', top: '58%', right: '7%', size: '0.95rem', delay: '0.9s', dur: '12s', drift: 'c' },
  { text: 'e^(iπ) + 1 = 0', top: '8%', left: '18%', size: '1rem', delay: '5.5s', dur: '15s', drift: 'a' },
  { text: 'CO₂ + H₂O', top: '78%', left: '8%', size: '1.05rem', delay: '3.8s', dur: '11s', drift: 'b' },
  { text: 'Past Simple', top: '40%', right: '5%', size: '0.95rem', delay: '8s', dur: '14s', drift: 'c' },
  { text: 'Σ (1/n²) = π²/6', bottom: '28%', left: '2%', size: '0.9rem', delay: '2.8s', dur: '17s', drift: 'a' },
  { text: 'adverb · adjective', bottom: '8%', right: '20%', size: '0.9rem', delay: '4.2s', dur: '16s', drift: 'b' },
  { text: 'sin²θ + cos²θ = 1', top: '26%', left: '5%', size: '0.95rem', delay: '6.5s', dur: '13s', drift: 'c' },
  { text: 'pH = −log[H⁺]', top: '62%', left: '4%', size: '0.95rem', delay: '1.2s', dur: '12s', drift: 'a' },
]

function FormulaField() {
  return (
    <div className="lp-formula-field" aria-hidden="true">
      {FORMULA_FIELD.map((f, i) => (
        <span
          key={`${f.text}-${i}`}
          className={`lp-formula lp-formula-${f.drift}`}
          style={
            {
              top: f.top,
              left: f.left,
              right: f.right,
              bottom: f.bottom,
              fontSize: f.size,
              '--lp-f-delay': f.delay,
              '--lp-f-dur': f.dur,
            } as CSSProperties
          }
        >
          {f.text}
        </span>
      ))}
    </div>
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
      <div className="lp-mesh fixed inset-0 z-0" aria-hidden="true">
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
        <div className="lp-orb lp-orb-c" />
        <Particles />
      </div>
      {/* Công thức nền: trên mesh, dưới nội dung — thấy ở mép trang */}
      <FormulaField />

      <header className="relative z-20 sticky top-0 border-b border-white/5 bg-[#060912]/90">
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
      </header>

      <div className="relative z-10">{children}</div>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center text-xs text-white/35">
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
