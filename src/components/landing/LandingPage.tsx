'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Building2, Sparkles } from 'lucide-react'
import { HUB_PILLARS } from './chapters'
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

function ChapterCard({
  pillar,
  index,
}: {
  pillar: (typeof HUB_PILLARS)[number]
  index: number
}) {
  const Icon = pillar.icon

  function onMove(e: React.MouseEvent<HTMLAnchorElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    e.currentTarget.style.setProperty('--mx', `${x}%`)
    e.currentTarget.style.setProperty('--my', `${y}%`)
  }

  return (
    <Link
      href={`/gioi-thieu/${pillar.slug}`}
      onMouseMove={onMove}
      className={`lp-reveal lp-d${(index % 5) + 1} lp-glass lp-chapter group relative flex min-h-[280px] flex-col overflow-hidden rounded-[1.75rem] sm:min-h-[320px]`}
    >
      <div className="absolute inset-0">
        <Image
          src={pillar.image}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 40vw"
          className="object-cover opacity-55 transition duration-700 group-hover:scale-105 group-hover:opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060912] via-[#060912]/75 to-[#060912]/25" />
      </div>
      <div className="relative mt-auto flex flex-col p-6 sm:p-7">
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="font-heading text-xl font-bold text-white sm:text-2xl">{pillar.title}</h3>
        <p className="mt-2 text-sm text-white/65">{pillar.desc}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-200 transition group-hover:gap-2.5">
          Đọc chương này
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}

export function LandingPage() {
  const rootRef = useRevealRoot()
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    function onMove(e: MouseEvent) {
      setParallax({
        x: (e.clientX / window.innerWidth - 0.5) * 14,
        y: (e.clientY / window.innerHeight - 0.5) * 10,
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <MarketingShell>
      <div ref={rootRef}>
        {/* ===== HERO — people first ===== */}
        <section className="relative min-h-[100dvh] overflow-hidden">
          <div className="absolute inset-0">
            <div
              className="absolute inset-0 scale-105"
              style={{
                transform: `translate3d(${parallax.x * -0.5}px, ${parallax.y * -0.35}px, 0)`,
              }}
            >
              <Image
                src="/landing/students.png"
                alt=""
                fill
                priority
                sizes="100vw"
                className="lp-kenburns object-cover object-[center_25%]"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#060912]/40 via-[#060912]/70 to-[#060912]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#060912]/85 via-[#060912]/35 to-transparent" />
          </div>

          <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-24">
            <p className="lp-reveal font-heading text-sm font-semibold uppercase tracking-[0.28em] text-amber-200/90">
              EDU SYSTEM
            </p>
            <h1 className="lp-reveal lp-d1 mt-4 max-w-3xl font-heading text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl">
              <StaggerWords text="Trường học linh hoạt." />
              <br />
              <span className="bg-gradient-to-r from-teal-200 via-sky-200 to-amber-200 bg-clip-text text-transparent">
                <StaggerWords text="Con người là trung tâm." />
              </span>
            </h1>
            <p className="lp-reveal lp-d2 mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              Hệ thống quản lý đa cơ sở — đào tạo, nhân sự, LMS, AI, học phí — cấu hình theo từng đơn vị,
              sẵn sàng chuyển đổi số, mở rộng hay sát nhập.
            </p>
            <div className="lp-reveal lp-d3 mt-8 flex flex-wrap gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-teal-600 px-6 text-sm font-semibold text-white shadow-[0_12px_40px_-10px_rgba(45,160,170,0.7)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Chọn cơ sở của bạn
              </Link>
              <a
                href="#chuong"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Khám phá theo chương
              </a>
            </div>
          </div>
        </section>

        <div className="lp-shimmer-line" aria-hidden="true" />

        <div className="overflow-hidden border-y border-white/5 bg-white/[0.02] py-4" aria-hidden="true">
          <div className="lp-marquee-track gap-8 px-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/35">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span key={`${item}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
                {item}
                <span className="inline-block h-1 w-1 rounded-full bg-amber-300/50" />
              </span>
            ))}
          </div>
        </div>

        {/* ===== PEOPLE STRIP ===== */}
        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-3 sm:px-6 sm:py-20">
          {[
            {
              img: '/landing/teacher.png',
              alt: 'Giáo viên đang giảng bài',
              label: 'Thầy cô',
              line: 'Lịch dạy, điểm danh, LMS — ít giấy tờ hơn.',
            },
            {
              img: '/landing/students.png',
              alt: 'Học sinh cùng học nhóm',
              label: 'Học viên',
              line: 'Hồ sơ 360°, bài học số, AI hỗ trợ đúng bài.',
            },
            {
              img: '/landing/family.png',
              alt: 'Phụ huynh và con xem thông tin học tập',
              label: 'Gia đình',
              line: 'Sổ liên lạc, điểm, học phí — trên điện thoại.',
            },
          ].map((card, i) => (
            <figure
              key={card.label}
              className={`lp-reveal lp-d${i + 1} lp-clip relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-white/10`}
            >
              <Image src={card.img} alt={card.alt} fill sizes="33vw" className="object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-5">
                <p className="font-heading text-lg font-bold text-white">{card.label}</p>
                <p className="mt-1 text-sm text-white/70">{card.line}</p>
              </figcaption>
            </figure>
          ))}
        </section>

        {/* ===== FLEXIBILITY TEASER ===== */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-8 sm:px-6 lg:grid-cols-2 lg:pb-12">
          <div>
            <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-teal-300/90">
              Vì sao khác biệt
            </p>
            <h2 className="lp-reveal lp-d1 mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
              <StaggerWords text="Mỗi cơ sở một nhịp riêng." />
            </h2>
            <p className="lp-reveal lp-d2 mt-4 text-base leading-relaxed text-white/65">
              Không ép mọi đơn vị dùng một khuôn cứng. Bạn cấu hình mã học viên, biểu mẫu, quyền hạn, module
              — đủ độc lập để vận hành địa bàn, đủ thống nhất khi cần mở rộng hay sát nhập.
            </p>
            <Link
              href="/gioi-thieu/linh-hoat"
              className="lp-reveal lp-d3 mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-teal-300/30 bg-teal-400/10 px-5 text-sm font-semibold text-teal-100 transition hover:bg-teal-400/20"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Đọc về tính linh hoạt
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="lp-reveal lp-reveal-right lp-clip relative aspect-[16/11] overflow-hidden rounded-[1.75rem] border border-white/10">
            <Image
              src="/landing/campus.png"
              alt="Khuôn viên trường học hiện đại"
              fill
              sizes="(max-width: 1024px) 100vw, 560px"
              className="object-cover"
            />
          </div>
        </section>

        {/* ===== CHAPTERS GRID ===== */}
        <section id="chuong" className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-amber-200/90">
                Năm chương trải nghiệm
              </p>
              <h2 className="lp-reveal lp-d1 mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
                Khám phá từng phần — không vội vàng
              </h2>
              <p className="lp-reveal lp-d2 mt-4 text-base text-white/60">
                Mỗi chương là một câu chuyện riêng: đào sâu tính năng, hình ảnh con người, và cách hệ thống
                phục vụ nhà trường mỗi ngày.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {HUB_PILLARS.map((pillar, i) => (
                <div
                  key={pillar.slug}
                  className={
                    i === 0
                      ? 'sm:col-span-2 lg:col-span-3'
                      : i === 1
                        ? 'lg:col-span-3'
                        : 'lg:col-span-2'
                  }
                >
                  <ChapterCard pillar={pillar} index={i} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== CLOSING ===== */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="lp-reveal relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/12 bg-gradient-to-br from-sky-700/40 via-[#0a1224]/90 to-teal-900/40 px-6 py-14 text-center shadow-2xl sm:px-12">
            <div
              className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl"
              aria-hidden="true"
            />
            <h2 className="font-heading text-3xl font-bold text-white sm:text-4xl">
              Sẵn sàng đưa nhà trường lên số?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Chọn cổng cơ sở để đăng nhập. Hệ thống nhận diện đúng đơn vị của bạn ngay từ bước đầu.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-6 text-sm font-bold text-[#0a1224] transition hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                Vào cổng theo cơ sở
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/gioi-thieu/dao-tao"
                className="inline-flex min-h-12 cursor-pointer items-center rounded-2xl border border-white/25 px-6 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                Xem chương Đào tạo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  )
}
