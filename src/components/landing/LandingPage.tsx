'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Building2, Check, ChevronRight } from 'lucide-react'
import { FEATURE_GROUPS, HUB_PILLARS } from './chapters'
import { MarketingShell, StaggerWords, useRevealRoot } from './MarketingShell'

const MARQUEE = [
  'Cá nhân hóa từng cơ sở',
  'Đào tạo khép kín',
  'LMS & AI',
  'Sổ liên lạc phụ huynh',
  'Học phí minh bạch',
  'Lịch dạy linh hoạt',
  'Chuyển đổi số',
  'Sát nhập & mở rộng',
  'All-in-one',
]

export function LandingPage() {
  const rootRef = useRevealRoot()
  const [activeGroup, setActiveGroup] = useState(0)
  const [panelReady, setPanelReady] = useState(true)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setPanelReady(false)
    const id = requestAnimationFrame(() => setPanelReady(true))
    return () => cancelAnimationFrame(id)
  }, [activeGroup])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let latest = { x: 0, y: 0 }
    function onMove(e: MouseEvent) {
      latest = {
        x: (e.clientX / window.innerWidth - 0.5) * 10,
        y: (e.clientY / window.innerHeight - 0.5) * 7,
      }
      if (!raf) {
        raf = requestAnimationFrame(() => {
          setParallax(latest)
          raf = 0
        })
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Auto-rotate feature tabs (pause when reduced motion)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => {
      setActiveGroup((g) => (g + 1) % FEATURE_GROUPS.length)
    }, 7000)
    return () => clearInterval(id)
  }, [])

  const group = FEATURE_GROUPS[activeGroup]

  return (
    <MarketingShell>
      <div ref={rootRef}>
        {/* ===== HERO ===== */}
        <section className="relative min-h-[92dvh] overflow-hidden sm:min-h-[100dvh]">
          <div className="absolute inset-0">
            <div
              className="absolute inset-0"
              style={{
                transform: `translate3d(${parallax.x * -0.4}px, ${parallax.y * -0.3}px, 0)`,
              }}
            >
              <Image
                src="/landing/students.webp"
                alt=""
                fill
                priority
                quality={75}
                sizes="100vw"
                className="lp-kenburns object-cover object-[center_22%]"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#060912]/35 via-[#060912]/68 to-[#060912]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#060912]/88 via-[#060912]/40 to-transparent" />
          </div>

          <div className="relative mx-auto flex min-h-[92dvh] max-w-6xl flex-col justify-end px-4 pb-14 pt-24 sm:min-h-[100dvh] sm:px-6 sm:pb-20">
            <p className="lp-instant font-heading text-sm font-semibold uppercase tracking-[0.28em] text-amber-200/90">
              EDU SYSTEM
            </p>
            <h1 className="lp-instant mt-3 max-w-3xl font-heading text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl">
              <StaggerWords text="Trường học linh hoạt." />
              <br />
              <span className="bg-gradient-to-r from-teal-200 via-sky-200 to-amber-200 bg-clip-text text-transparent">
                <StaggerWords text="Con người là trung tâm." />
              </span>
            </h1>
            <p className="lp-instant mt-4 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              Quản lý đa cơ sở — đào tạo, nhân sự, LMS, AI, học phí — cấu hình theo từng đơn vị, sẵn sàng
              mở rộng hay sát nhập.
            </p>
            <div className="lp-instant mt-7 flex flex-wrap gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-teal-600 px-6 text-sm font-semibold text-white shadow-[0_12px_36px_-10px_rgba(45,160,170,0.65)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Chọn cơ sở của bạn
              </Link>
              <a
                href="#tinh-nang"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white/90 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Xem đầy đủ tính năng
              </a>
            </div>
          </div>
        </section>

        <div className="lp-shimmer-line" aria-hidden="true" />

        <div className="overflow-hidden border-y border-white/5 bg-white/[0.02] py-3.5" aria-hidden="true">
          <div className="lp-marquee-track gap-8 px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/35 sm:text-sm">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span key={`${item}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
                {item}
                <span className="inline-block h-1 w-1 rounded-full bg-amber-300/50" />
              </span>
            ))}
          </div>
        </div>

        {/* ===== PEOPLE STRIP ===== */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-3 sm:gap-5 sm:px-6 sm:py-16">
          {[
            {
              img: '/landing/teacher.webp',
              alt: 'Giáo viên đang giảng bài',
              label: 'Thầy cô',
              line: 'Lịch dạy, điểm danh, LMS — ít giấy tờ hơn.',
            },
            {
              img: '/landing/students.webp',
              alt: 'Học sinh cùng học nhóm',
              label: 'Học viên',
              line: 'Hồ sơ 360°, bài học số, AI hỗ trợ đúng bài.',
            },
            {
              img: '/landing/family.webp',
              alt: 'Phụ huynh và con xem thông tin học tập',
              label: 'Gia đình',
              line: 'Sổ liên lạc, điểm, học phí — trên điện thoại.',
            },
          ].map((card, i) => (
            <figure
              key={card.label}
              className={`lp-reveal lp-d${i + 1} lp-clip relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-white/10`}
            >
              <Image
                src={card.img}
                alt={card.alt}
                fill
                quality={70}
                sizes="(max-width:640px) 100vw, 33vw"
                className="object-cover transition duration-500 hover:scale-105"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5">
                <p className="font-heading text-lg font-bold text-white">{card.label}</p>
                <p className="mt-1 text-sm text-white/70">{card.line}</p>
              </figcaption>
            </figure>
          ))}
        </section>

        {/* ===== FEATURE CATALOG — chi tiết gạch đầu dòng ===== */}
        <section id="tinh-nang" className="px-4 py-10 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-teal-300/90">
                Danh mục tính năng
              </p>
              <h2 className="lp-reveal lp-d1 mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
                Không chỉ “có module” — liệt kê rõ bạn dùng được gì
              </h2>
              <p className="lp-reveal lp-d2 mt-3 text-base text-white/60">
                Chọn nhóm bên trái (hoặc vuốt tab trên mobile). Mỗi dòng là một việc nhà trường làm hàng ngày.
              </p>
            </div>

            <div className="lp-reveal lp-d3 mt-8 grid gap-5 lg:grid-cols-[240px_1fr]">
              {/* Tabs */}
              <div
                className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
                role="tablist"
                aria-label="Nhóm tính năng"
              >
                {FEATURE_GROUPS.map((g, i) => (
                  <button
                    key={g.title}
                    type="button"
                    role="tab"
                    aria-selected={i === activeGroup}
                    onClick={() => setActiveGroup(i)}
                    className={`lp-tab min-h-11 shrink-0 cursor-pointer rounded-xl border border-white/10 px-4 py-2.5 text-left text-sm font-semibold text-white/65 ${
                      i === activeGroup ? 'is-active' : 'hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {g.title}
                  </button>
                ))}
              </div>

              {/* Detail panel */}
              <div
                key={group.title}
                role="tabpanel"
                className={`lp-glass lp-feat-panel rounded-[1.5rem] p-5 sm:p-7 ${
                  panelReady ? 'is-show' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-heading text-xl font-bold text-white sm:text-2xl">
                    {group.title}
                  </h3>
                  <Link
                    href={`/gioi-thieu/${group.chapter}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-200 transition hover:gap-2.5"
                  >
                    Xem câu chuyện đầy đủ
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
                <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
                  {group.items.map((item, idx) => (
                    <li
                      key={item}
                      className="lp-feat-item flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm leading-snug text-white/80"
                      style={{ transitionDelay: `${0.04 + idx * 0.035}s` }}
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-teal-300"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CHAPTERS ===== */}
        <section id="chuong" className="px-4 py-12 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-amber-200/90">
                Năm chương trải nghiệm
              </p>
              <h2 className="lp-reveal lp-d1 mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
                Đào sâu từng phần — có hình, có motion, có chi tiết
              </h2>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {HUB_PILLARS.map((pillar, i) => {
                const Icon = pillar.icon
                return (
                  <Link
                    key={pillar.slug}
                    href={`/gioi-thieu/${pillar.slug}`}
                    className={`lp-reveal lp-d${(i % 5) + 1} lp-glass lp-chapter group relative flex min-h-[260px] flex-col overflow-hidden rounded-[1.5rem] ${
                      i === 0
                        ? 'sm:col-span-2 lg:col-span-3'
                        : i === 1
                          ? 'lg:col-span-3'
                          : 'lg:col-span-2'
                    }`}
                  >
                    <div className="absolute inset-0">
                      <Image
                        src={pillar.image}
                        alt=""
                        fill
                        quality={65}
                        sizes="(max-width:768px) 100vw, 40vw"
                        className="object-cover opacity-50 transition duration-500 group-hover:scale-105 group-hover:opacity-65"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#060912] via-[#060912]/70 to-transparent" />
                    </div>
                    <div className="relative mt-auto p-6">
                      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h3 className="font-heading text-xl font-bold text-white">{pillar.title}</h3>
                      <p className="mt-1.5 text-sm text-white/65">{pillar.desc}</p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-200 transition group-hover:gap-2.5">
                        Đọc chương
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="lp-reveal relative mx-auto max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/12 bg-gradient-to-br from-sky-700/35 via-[#0a1224]/95 to-teal-900/35 px-6 py-12 text-center sm:px-12">
            <h2 className="font-heading text-3xl font-bold text-white sm:text-4xl">
              Sẵn sàng đưa nhà trường lên số?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
              Chọn cổng cơ sở để đăng nhập. Hệ thống nhận diện đúng đơn vị ngay từ bước đầu.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-6 text-sm font-bold text-[#0a1224] transition hover:bg-amber-50"
              >
                Vào cổng theo cơ sở
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#tinh-nang"
                className="inline-flex min-h-12 cursor-pointer items-center rounded-2xl border border-white/25 px-6 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                Xem lại danh mục tính năng
              </a>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  )
}
