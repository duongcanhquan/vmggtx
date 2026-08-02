'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Cpu,
  GraduationCap,
  HeartHandshake,
  Sparkles,
  Users,
} from 'lucide-react'
import { EDU_JOURNEY, FEATURE_GROUPS, HUB_PILLARS } from './chapters'
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

const ROLE_CARDS = [
  {
    icon: GraduationCap,
    label: 'Thầy cô',
    title: 'Ít giấy tờ hơn mỗi buổi dạy',
    line: 'Lịch hai chiều, điểm danh, sổ đầu bài và LMS — một chỗ, trên điện thoại.',
    tone: 'from-sky-500/25 to-transparent',
  },
  {
    icon: Users,
    label: 'Học viên',
    title: 'Hồ sơ 360° + học số',
    line: 'Bài giảng, bài tập, quiz, AI tutor — tiến độ học được ghi nhận rõ ràng.',
    tone: 'from-teal-500/25 to-transparent',
  },
  {
    icon: HeartHandshake,
    label: 'Gia đình',
    title: 'Sổ liên lạc trên điện thoại',
    line: 'Lịch học, điểm, học phí, dặn dò — phụ huynh nắm mà không cần hỏi thầy cô.',
    tone: 'from-amber-500/20 to-transparent',
  },
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
        {/* ===== HERO — ảnh duy nhất trên hub ===== */}
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
            <h1 className="lp-instant mt-4 max-w-4xl font-heading text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-7xl">
              <StaggerWords text="Trường học linh hoạt." />
              <br />
              <span className="bg-gradient-to-r from-teal-200 via-sky-200 to-amber-200 bg-clip-text text-transparent">
                <StaggerWords text="Con người là trung tâm." />
              </span>
            </h1>
            <p className="lp-instant mt-5 max-w-2xl text-lg leading-relaxed text-white/80 sm:text-xl">
              Một dòng chảy: tuyển sinh → xếp lớp → giảng dạy → đánh giá → gia đình → vận hành.
              <span className="lp-mark ml-1 font-semibold text-white">Tất cả trên một hệ thống.</span>
            </p>
            <div className="lp-instant mt-8 flex flex-wrap gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-teal-600 px-7 text-base font-semibold text-white shadow-[0_12px_36px_-10px_rgba(45,160,170,0.65)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Building2 className="h-5 w-5" aria-hidden="true" />
                Chọn cơ sở của bạn
              </Link>
              <a
                href="#hanh-trinh"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-7 text-base font-semibold text-white/90 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Xem dòng chảy giáo dục
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

        {/* ===== DÒNG CHẢY GIÁO DỤC — storytelling ===== */}
        <section id="hanh-trinh" className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24">
          <div className="lp-grid-tech pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="lp-reveal text-sm font-bold uppercase tracking-[0.28em] text-teal-300">
                Dòng chảy giáo dục
              </p>
              <h2 className="lp-reveal lp-d1 mt-4 font-heading text-4xl font-bold leading-[1.1] text-white sm:text-5xl md:text-6xl">
                Từ tuyển sinh đến{' '}
                <span className="bg-gradient-to-r from-amber-200 to-teal-200 bg-clip-text text-transparent">
                  vận hành nhà trường
                </span>
              </h2>
              <p className="lp-reveal lp-d2 mt-5 text-lg leading-relaxed text-white/65 sm:text-xl">
                Không phải danh sách module rời rạc — mà một hành trình mà mỗi bước kéo theo bước
                tiếp theo. Hệ thống ghi nhận{' '}
                <span className="font-semibold text-white">đúng lúc, đúng người, đúng cơ sở.</span>
              </p>
            </div>

            <div className="lp-reveal lp-d3 relative mt-14 pl-2 sm:pl-4">
              <div className="lp-journey-line" aria-hidden="true" />
              <ol className="space-y-0">
                {EDU_JOURNEY.map((step, i) => (
                  <li
                    key={step.step}
                    className={`lp-node lp-reveal lp-d${(i % 5) + 1} grid gap-3 border-b border-white/5 py-8 pl-12 last:border-0 sm:grid-cols-[7rem_1fr] sm:items-baseline sm:gap-8 sm:pl-16`}
                  >
                    <span className="lp-big-num font-heading text-5xl font-bold sm:text-6xl">
                      {step.step}
                    </span>
                    <div>
                      <h3 className="font-heading text-2xl font-bold text-white sm:text-3xl">
                        {step.title}
                      </h3>
                      <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
                        {step.line}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ===== BA VAI TRÒ — icon + typography, không ảnh ===== */}
        <section className="px-4 py-12 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="lp-reveal text-sm font-bold uppercase tracking-[0.28em] text-amber-200/90">
              Ba vòng đời
            </p>
            <h2 className="lp-reveal lp-d1 mt-4 max-w-3xl font-heading text-4xl font-bold text-white sm:text-5xl">
              Thầy cô · Học viên · Gia đình
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-5">
              {ROLE_CARDS.map((card, i) => {
                const Icon = card.icon
                return (
                  <div
                    key={card.label}
                    className={`lp-reveal lp-d${i + 1} lp-glass relative overflow-hidden rounded-[1.5rem] p-6 sm:p-8`}
                  >
                    <div
                      className={`pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gradient-to-br ${card.tone} blur-2xl`}
                      aria-hidden="true"
                    />
                    <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-teal-200">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="relative mt-5 text-xs font-bold uppercase tracking-[0.2em] text-white/45">
                      {card.label}
                    </p>
                    <h3 className="relative mt-2 font-heading text-2xl font-bold text-white">
                      {card.title}
                    </h3>
                    <p className="relative mt-3 text-base leading-relaxed text-white/65">{card.line}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== TECH STRIP ===== */}
        <section className="px-4 py-8 sm:px-6">
          <div className="lp-reveal relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-teal-400/20 bg-[#0a1224]">
            <div className="lp-grid-tech absolute inset-0 opacity-60" aria-hidden="true" />
            <div className="lp-scan" aria-hidden="true" />
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
              aria-hidden="true"
            >
              <path
                className="lp-circuit"
                d="M0 80 H120 V40 H280 V120 H420 V60 H640 V100 H900"
                fill="none"
                stroke="rgba(94,234,212,0.55)"
                strokeWidth="1.5"
              />
              <path
                className="lp-circuit"
                d="M0 160 H90 V200 H260 V140 H480 V180 H800"
                fill="none"
                stroke="rgba(236,199,90,0.4)"
                strokeWidth="1.5"
              />
            </svg>
            <div className="relative grid gap-8 px-6 py-12 sm:grid-cols-[auto_1fr] sm:items-center sm:px-10 sm:py-14">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400/30 to-sky-600/30 text-teal-200">
                <Cpu className="h-8 w-8" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-3xl font-bold text-white sm:text-4xl">
                  Công nghệ phục vụ giáo dục — không phải ngược lại
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/65 sm:text-lg">
                  Đa tầng tổ chức, phân quyền theo cây, dữ liệu gắn{' '}
                  <span className="lp-mark font-semibold text-white">org_id</span>, LMS + AI trong phạm
                  vi từng cơ sở. Nhà trường thấy kết quả; kỹ thuật nằm phía sau.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FEATURE CATALOG ===== */}
        <section id="tinh-nang" className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="lp-reveal text-sm font-bold uppercase tracking-[0.28em] text-teal-300/90">
                Danh mục tính năng
              </p>
              <h2 className="lp-reveal lp-d1 mt-4 font-heading text-4xl font-bold text-white sm:text-5xl">
                Liệt kê rõ — bạn dùng được gì mỗi ngày
              </h2>
              <p className="lp-reveal lp-d2 mt-4 text-lg text-white/60">
                Chọn nhóm bên trái. Mỗi dòng là một việc nhà trường làm thật — không slogan mơ hồ.
              </p>
            </div>

            <div className="lp-reveal lp-d3 mt-10 grid gap-5 lg:grid-cols-[260px_1fr]">
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
                    className={`lp-tab min-h-12 shrink-0 cursor-pointer rounded-xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white/65 sm:text-base ${
                      i === activeGroup ? 'is-active' : 'hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {g.title}
                  </button>
                ))}
              </div>

              <div
                key={group.title}
                role="tabpanel"
                className={`lp-glass lp-feat-panel rounded-[1.5rem] p-5 sm:p-8 ${
                  panelReady ? 'is-show' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-heading text-2xl font-bold text-white sm:text-3xl md:text-4xl">
                    {group.title}
                  </h3>
                  <Link
                    href={`/gioi-thieu/${group.chapter}`}
                    className="inline-flex items-center gap-1.5 text-base font-semibold text-teal-200 transition hover:gap-2.5"
                  >
                    Đọc câu chuyện đầy đủ
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </div>

                {/* Điểm nhấn — khối lớn, nổi bật */}
                <div className="mt-6 grid gap-3">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-amber-200/90">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Điểm nhấn
                  </p>
                  {group.highlights.map((h, hi) => (
                    <div
                      key={h}
                      className="lp-feat-item lp-spotlight relative overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-400/15 via-teal-400/10 to-transparent px-4 py-4 sm:px-5 sm:py-5"
                      style={{ transitionDelay: `${0.05 + hi * 0.06}s` }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-300/20 font-heading text-sm font-bold text-amber-200">
                          {String(hi + 1).padStart(2, '0')}
                        </span>
                        <p className="font-heading text-lg font-bold leading-snug text-white sm:text-xl">
                          {h}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <ul className="mt-6 grid gap-2 border-t border-white/10 pt-5 sm:grid-cols-2">
                  {group.items.map((item, idx) => (
                    <li
                      key={item}
                      className="lp-feat-item flex items-start gap-2.5 rounded-xl px-3 py-3 text-base leading-snug text-white/85"
                      style={{
                        transitionDelay: `${0.2 + idx * 0.03}s`,
                      }}
                    >
                      <Check
                        className="mt-1 h-4 w-4 shrink-0 text-teal-300"
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

        {/* ===== CHAPTERS — gradient / tech, không ảnh ===== */}
        <section id="chuong" className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="lp-reveal text-sm font-bold uppercase tracking-[0.28em] text-amber-200/90">
                Năm chương trải nghiệm
              </p>
              <h2 className="lp-reveal lp-d1 mt-4 font-heading text-4xl font-bold text-white sm:text-5xl">
                Đào sâu từng phần — thiết kế & câu chuyện, không ảnh trùng
              </h2>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {HUB_PILLARS.map((pillar, i) => {
                const Icon = pillar.icon
                return (
                  <Link
                    key={pillar.slug}
                    href={`/gioi-thieu/${pillar.slug}`}
                    className={`lp-reveal lp-d${(i % 5) + 1} lp-glass lp-chapter group relative flex min-h-[280px] flex-col overflow-hidden rounded-[1.5rem] ${
                      i === 0
                        ? 'sm:col-span-2 lg:col-span-3'
                        : i === 1
                          ? 'lg:col-span-3'
                          : 'lg:col-span-2'
                    }`}
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${pillar.tone}`}
                      aria-hidden="true"
                    />
                    <div className="lp-grid-tech absolute inset-0 opacity-40" aria-hidden="true" />
                    <div className="relative flex h-full flex-col p-6 sm:p-7">
                      <div className="flex items-start justify-between">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="lp-big-num font-heading text-4xl font-bold">
                          {pillar.numeral}
                        </span>
                      </div>
                      <div className="mt-auto pt-10">
                        <h3 className="font-heading text-2xl font-bold text-white">{pillar.title}</h3>
                        <p className="mt-2 text-base text-white/65">{pillar.desc}</p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-base font-semibold text-teal-200 transition group-hover:gap-2.5">
                          Đọc chương
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="lp-reveal relative mx-auto max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/12 bg-gradient-to-br from-sky-700/35 via-[#0a1224]/95 to-teal-900/35 px-6 py-14 text-center sm:px-12">
            <div className="lp-grid-tech absolute inset-0 opacity-30" aria-hidden="true" />
            <h2 className="relative font-heading text-4xl font-bold text-white sm:text-5xl">
              Sẵn sàng đưa nhà trường lên số?
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
              Chọn cổng cơ sở để đăng nhập. Hệ thống nhận diện đúng đơn vị ngay từ bước đầu.
            </p>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-7 text-base font-bold text-[#0a1224] transition hover:bg-amber-50"
              >
                Vào cổng theo cơ sở
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <a
                href="#hanh-trinh"
                className="inline-flex min-h-12 cursor-pointer items-center rounded-2xl border border-white/25 px-7 text-base font-semibold text-white/90 transition hover:bg-white/10"
              >
                Xem lại dòng chảy
              </a>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  )
}
