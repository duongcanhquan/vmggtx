'use client'

import Image from 'next/image'
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
        {/* Hero */}
        <section className="relative min-h-[70dvh] overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src={chapter.heroImage}
              alt=""
              fill
              priority
              sizes="100vw"
              className="lp-kenburns object-cover object-[center_30%]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060912]/50 via-[#060912]/75 to-[#060912]" />
          </div>
          <div className="relative mx-auto flex min-h-[70dvh] max-w-6xl flex-col justify-end px-4 pb-14 pt-24 sm:px-6">
            <Link
              href="/login"
              className="lp-reveal mb-6 inline-flex w-fit items-center gap-2 text-sm font-medium text-white/70 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Về trang chủ
            </Link>
            <p className="lp-reveal lp-d1 text-xs font-bold uppercase tracking-[0.28em] text-teal-200/90">
              {chapter.eyebrow}
            </p>
            <h1 className="lp-reveal lp-d2 mt-3 max-w-3xl font-heading text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              <StaggerWords text={chapter.title} />
            </h1>
            <p className="lp-reveal lp-d3 mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
              {chapter.teaser}
            </p>
            <div
              className={`lp-reveal lp-d4 mt-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${chapter.accent}`}
            >
              <Icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
          </div>
        </section>

        <div className="lp-shimmer-line" aria-hidden="true" />

        {/* Story sections — sticky visual + scrolling narrative */}
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:py-24">
          <div className="hidden lg:block">
            <div className="lp-sticky-panel lp-reveal lp-reveal-scale">
              <div className="lp-clip relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl">
                <Image
                  src={chapter.heroImage}
                  alt={chapter.heroAlt}
                  fill
                  sizes="420px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060912]/80 via-transparent to-transparent" />
                <p className="absolute bottom-5 left-5 right-5 font-heading text-lg font-bold text-white">
                  {chapter.title}
                </p>
              </div>
              <ol className="mt-6 space-y-3">
                {chapter.sections.map((s, i) => (
                  <li key={s.title} className="flex items-center gap-3 text-sm text-white/55">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-xs font-bold text-teal-200">
                      {i + 1}
                    </span>
                    {s.title}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="space-y-16 sm:space-y-24">
            {chapter.sections.map((section, i) => (
              <section key={section.title} className="lp-reveal scroll-mt-28">
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200/80">
                  Phần {i + 1}
                </span>
                <h2 className="mt-3 font-heading text-2xl font-bold text-white sm:text-3xl">
                  {section.title}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-white/65">{section.body}</p>
                {section.bullets && (
                  <ul className="mt-6 space-y-3">
                    {section.bullets.map((b) => (
                      <li
                        key={b}
                        className="lp-glass flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm text-white/80"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Chapter nav */}
        <nav
          aria-label="Chương tiếp theo"
          className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 sm:px-6"
        >
          {prev ? (
            <Link
              href={`/gioi-thieu/${prev.slug}`}
              className="lp-reveal lp-glass group flex flex-col rounded-3xl p-6 transition"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Chương trước
              </span>
              <span className="mt-2 flex items-center gap-2 font-heading text-lg font-bold text-white group-hover:text-teal-200">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {prev.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={`/gioi-thieu/${next.slug}`}
              className="lp-reveal lp-glass group flex flex-col rounded-3xl p-6 text-right transition sm:items-end"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Chương tiếp
              </span>
              <span className="mt-2 flex items-center gap-2 font-heading text-lg font-bold text-white group-hover:text-teal-200">
                {next.title}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          ) : (
            <Link
              href="/coso"
              className="lp-reveal lp-glass group flex flex-col rounded-3xl p-6 text-right transition sm:items-end"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Bắt đầu
              </span>
              <span className="mt-2 flex items-center gap-2 font-heading text-lg font-bold text-white group-hover:text-amber-200">
                Vào cổng cơ sở của bạn
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          )}
        </nav>
      </article>
    </MarketingShell>
  )
}
