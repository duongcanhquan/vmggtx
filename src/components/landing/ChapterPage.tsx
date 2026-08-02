'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { CHAPTERS, getChapter } from './chapters'
import { MarketingShell, StaggerWords, useRevealRoot } from './MarketingShell'

export function ChapterPage({ slug }: { slug: string }) {
  const chapter = getChapter(slug)
  const rootRef = useRevealRoot()
  if (!chapter) return null

  const idx = CHAPTERS.findIndex((c) => c.slug === chapter.slug)
  const prev = idx > 0 ? CHAPTERS[idx - 1] : null
  const next = idx < CHAPTERS.length - 1 ? CHAPTERS[idx + 1] : null
  const Icon = chapter.icon

  return (
    <MarketingShell activeSlug={chapter.slug}>
      <article ref={rootRef}>
        {/* Hero — gradient + tech, không ảnh stock trùng */}
        <section className="relative min-h-[68dvh] overflow-hidden">
          <div className="absolute inset-0 bg-[#060912]" aria-hidden="true" />
          <div
            className={`absolute inset-0 bg-gradient-to-br ${chapter.accent} opacity-40`}
            aria-hidden="true"
          />
          <div className="lp-grid-tech absolute inset-0" aria-hidden="true" />
          <div className="lp-scan" aria-hidden="true" />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
            aria-hidden="true"
          >
            <path
              className="lp-circuit"
              d="M40 200 H180 V80 H360 V220 H520 V120 H780 V260 H1100"
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.5"
            />
            <circle cx="180" cy="200" r="4" fill="rgba(94,234,212,0.8)" />
            <circle cx="360" cy="80" r="4" fill="rgba(236,199,90,0.7)" />
            <circle cx="520" cy="220" r="4" fill="rgba(94,234,212,0.8)" />
          </svg>

          <div className="relative mx-auto flex min-h-[68dvh] max-w-6xl flex-col justify-end px-4 pb-14 pt-24 sm:px-6">
            <Link
              href="/login"
              className="lp-reveal mb-6 inline-flex w-fit items-center gap-2 text-base font-medium text-white/70 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Về trang chủ
            </Link>
            <div className="lp-reveal lp-d1 flex items-center gap-4">
              <span
                className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${chapter.accent} shadow-lg`}
              >
                <Icon className="h-7 w-7 text-white" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-teal-200/90">
                {chapter.eyebrow}
              </p>
            </div>
            <h1 className="lp-reveal lp-d2 mt-5 max-w-4xl font-heading text-5xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl md:text-7xl">
              <StaggerWords text={chapter.title} />
            </h1>
            <p className="lp-reveal lp-d3 mt-6 max-w-2xl text-lg leading-relaxed text-white/80 sm:text-xl">
              {chapter.teaser}
            </p>
            <p className="lp-reveal lp-d4 mt-4 font-heading text-sm font-bold uppercase tracking-[0.2em] text-amber-200/70">
              Chương {String(idx + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}
            </p>
          </div>
        </section>

        <div className="lp-shimmer-line" aria-hidden="true" />

        {/* Narrative + sticky tech panel */}
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.2fr] lg:gap-16 lg:py-24">
          <div className="hidden lg:block">
            <div className="lp-sticky-panel lp-reveal">
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#0a1224] p-7">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${chapter.accent} opacity-25`}
                  aria-hidden="true"
                />
                <div className="lp-grid-tech absolute inset-0 opacity-50" aria-hidden="true" />
                <div className="relative">
                  <span className="lp-big-num font-heading text-7xl font-bold">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-4 font-heading text-2xl font-bold text-white">{chapter.title}</p>
                  <p className="mt-2 text-base text-white/55">{chapter.eyebrow}</p>
                  <ol className="mt-8 space-y-3 border-t border-white/10 pt-6">
                    {chapter.sections.map((s, i) => (
                      <li key={s.title} className="flex items-start gap-3 text-base text-white/70">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-teal-400/30 text-xs font-bold text-teal-200">
                          {i + 1}
                        </span>
                        {s.title}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-20 sm:space-y-28">
            {chapter.sections.map((section, i) => (
              <section key={section.title} className="lp-reveal scroll-mt-28">
                <div className="flex items-baseline gap-4">
                  <span className="lp-big-num font-heading text-5xl font-bold sm:text-6xl">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-bold uppercase tracking-[0.25em] text-amber-200/80">
                    Phần {i + 1}
                  </span>
                </div>
                <h2 className="mt-4 font-heading text-3xl font-bold leading-tight text-white sm:text-4xl md:text-[2.75rem]">
                  {section.title}
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-white/70 sm:text-xl">
                  {section.body}
                </p>
                <ul className="mt-8 grid gap-2.5">
                  {section.bullets.map((b, bi) => {
                    const isSpotlight = bi < 2
                    return (
                      <li
                        key={b}
                        className={`lp-feat-item flex items-start gap-3 rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 ${
                          isSpotlight
                            ? 'lp-spotlight border border-amber-300/25 bg-gradient-to-r from-amber-400/12 via-teal-400/8 to-transparent text-lg font-semibold text-white sm:text-xl'
                            : 'border border-white/10 bg-white/[0.04] text-base text-white/90 sm:text-lg'
                        }`}
                        style={{ transitionDelay: `${0.05 + bi * 0.04}s` }}
                      >
                        <Check
                          className={`mt-1 h-5 w-5 shrink-0 ${isSpotlight ? 'text-amber-200' : 'text-teal-300'}`}
                          aria-hidden="true"
                        />
                        {b}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <nav
          aria-label="Chương tiếp theo"
          className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 sm:px-6"
        >
          {prev ? (
            <Link
              href={`/gioi-thieu/${prev.slug}`}
              className="lp-reveal lp-glass group flex flex-col rounded-3xl p-6 transition sm:p-7"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Chương trước
              </span>
              <span className="mt-2 flex items-center gap-2 font-heading text-xl font-bold text-white group-hover:text-teal-200">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={`/gioi-thieu/${next.slug}`}
              className="lp-reveal lp-glass group flex flex-col rounded-3xl p-6 text-right transition sm:items-end sm:p-7"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Chương tiếp
              </span>
              <span className="mt-2 flex items-center gap-2 font-heading text-xl font-bold text-white group-hover:text-teal-200">
                {next.title}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="lp-reveal lp-glass group flex flex-col rounded-3xl p-6 text-right transition sm:items-end sm:p-7"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Về trang chủ
              </span>
              <span className="mt-2 flex items-center gap-2 font-heading text-xl font-bold text-white group-hover:text-amber-200">
                Khám phá EDU SYSTEM
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </span>
            </Link>
          )}
        </nav>
      </article>
    </MarketingShell>
  )
}
