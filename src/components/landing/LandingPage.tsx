'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Building2,
  CalendarRange,
  GraduationCap,
  Layers3,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react'
import './landing.css'

// ============================================================
// LANDING EDU SYSTEM — motion storytelling
// Cổng công khai: giới thiệu hệ thống. Superadmin vào qua
// icon sách mờ góc trái dưới → /login/admin
// ============================================================

const FEATURES = [
  {
    icon: Layers3,
    title: 'Đa tầng · Đa cơ sở',
    desc: 'Từ trường gốc đến chi nhánh, trung tâm — một cây tổ chức, phân quyền theo cấp, dữ liệu không lẫn.',
    tint: 'from-indigo-500/25 to-violet-500/10',
  },
  {
    icon: GraduationCap,
    title: 'Đào tạo & Khảo thí',
    desc: 'Lớp học, điểm danh, sổ đầu bài, lịch thi, giám thị, khóa sổ điểm, phúc khảo — khép kín.',
    tint: 'from-sky-500/25 to-cyan-500/10',
  },
  {
    icon: Users,
    title: 'Nhân sự & Lương',
    desc: 'Hồ sơ giảng viên, gán lớp, hợp đồng, tính lương theo buổi dạy, dự báo ngân sách.',
    tint: 'from-amber-500/25 to-orange-500/10',
  },
  {
    icon: BookOpen,
    title: 'LMS hiện đại',
    desc: 'Bài giảng, YouTube, bài tập, quiz chấm tự động, theo dõi học viên học / chưa học.',
    tint: 'from-emerald-500/25 to-teal-500/10',
  },
  {
    icon: Bot,
    title: 'AI Copilot & Tutor',
    desc: 'Chatbot RAG theo kiến thức cơ sở, hỗ trợ soạn bài, trả lời học viên trong phạm vi bài giảng.',
    tint: 'from-fuchsia-500/25 to-purple-500/10',
  },
  {
    icon: CalendarRange,
    title: 'Lịch dạy thông minh',
    desc: 'Giáo viên đề xuất / xin nghỉ; giáo vụ duyệt, dạy thay, dạy bù — kênh trao đổi hai chiều.',
    tint: 'from-rose-500/25 to-pink-500/10',
  },
  {
    icon: Wallet,
    title: 'Tài chính & Tài sản',
    desc: 'Học phí, công nợ tuổi nợ, biên lai, nhắc thu; quản lý tài sản, khấu hao, luân chuyển.',
    tint: 'from-lime-500/20 to-emerald-500/10',
  },
  {
    icon: ShieldCheck,
    title: 'Phân quyền linh hoạt',
    desc: 'Ma trận theo vai trò + kiêm nhiệm theo từng người. Admin cơ sở toàn quyền trong phạm vi mình.',
    tint: 'from-blue-500/25 to-indigo-500/10',
  },
] as const

const MARQUEE = [
  'Quản lý đào tạo',
  'Nhân sự',
  'Hành chính',
  'LMS',
  'AI Chatbot',
  'Điểm danh',
  'Khảo thí',
  'Tuyển sinh CRM',
  'Học phí',
  'Sổ liên lạc',
  'Tài sản',
  'All-in-one',
]

function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const nodes = el.querySelectorAll('.lp-reveal')
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
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
    )
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [])
  return ref
}

function SecretAdminBook() {
  const [near, setNear] = useState(false)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const zone = 110
      const inCorner = e.clientX <= zone && e.clientY >= window.innerHeight - zone
      setNear(inCorner)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <Link
      href="/login/admin"
      aria-label="Cổng quản trị hệ thống"
      title="Cổng quản trị hệ thống"
      className={`lp-secret-book fixed bottom-4 left-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80 shadow-lg backdrop-blur-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${
        near ? 'is-near' : ''
      }`}
    >
      <BookOpen className="h-5 w-5" aria-hidden="true" strokeWidth={1.6} />
    </Link>
  )
}

export function LandingPage() {
  const rootRef = useReveal<HTMLDivElement>()
  const [parallax, setParallax] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    function onMove(e: MouseEvent) {
      const x = (e.clientX / window.innerWidth - 0.5) * 12
      const y = (e.clientY / window.innerHeight - 0.5) * 8
      setParallax({ x, y })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div ref={rootRef} className="lp-root relative min-h-dvh">
      <div className="lp-mesh lp-grain fixed inset-0 -z-10" aria-hidden="true">
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
        <div className="lp-orb lp-orb-c" />
      </div>

      {/* ===== NAV ===== */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#070b1a]/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_8px_24px_-6px_rgba(93,104,232,0.7)]">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight text-white">
              EDU{' '}
              <span className="bg-gradient-to-r from-indigo-200 via-violet-200 to-amber-200 bg-clip-text text-transparent">
                SYSTEM
              </span>
            </span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/hdsd"
              className="hidden min-h-10 items-center rounded-xl px-3 text-sm font-medium text-white/70 transition hover:text-white sm:inline-flex"
            >
              Hướng dẫn
            </Link>
            <Link
              href="/coso"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#12122e] transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              Vào cổng cơ sở
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ===== HERO — brand first, full-bleed ===== */}
        <section className="relative min-h-[100dvh] overflow-hidden">
          <div className="absolute inset-0">
            <div
              className="absolute inset-0 scale-105"
              style={{
                transform: `translate3d(${parallax.x * -0.6}px, ${parallax.y * -0.4}px, 0)`,
              }}
            >
              <Image
                src="/landing/hero.png"
                alt=""
                fill
                priority
                sizes="100vw"
                className="lp-kenburns object-cover object-center"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#070b1a]/55 via-[#070b1a]/72 to-[#070b1a]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#070b1a]/80 via-transparent to-[#070b1a]/50" />
          </div>

          <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-24">
            <p className="lp-reveal font-heading text-sm font-semibold uppercase tracking-[0.28em] text-amber-200/90">
              EDU SYSTEM
            </p>
            <h1 className="lp-reveal lp-reveal-delay-1 mt-4 max-w-3xl font-heading text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
              Trường học đa tầng.
              <br />
              <span className="bg-gradient-to-r from-indigo-200 via-violet-200 to-amber-200 bg-clip-text text-transparent">
                Một hệ điều hành.
              </span>
            </h1>
            <p className="lp-reveal lp-reveal-delay-2 mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              Quản lý đào tạo, nhân sự, hành chính, LMS và AI — all-in-one cho mạng lưới cơ sở giáo dục.
            </p>
            <div className="lp-reveal lp-reveal-delay-3 mt-8 flex flex-wrap gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 text-sm font-semibold text-white shadow-[0_12px_40px_-10px_rgba(93,104,232,0.75)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Chọn cơ sở của bạn
              </Link>
              <a
                href="#tinh-nang"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white/90 backdrop-blur transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Khám phá tính năng
              </a>
            </div>

            {/* floating proof chips — outside first-viewport budget carefully placed near bottom */}
            <div className="lp-reveal lp-reveal-delay-4 mt-10 flex flex-wrap gap-2 sm:gap-3">
              {[
                { icon: Network, label: 'Đa cơ sở' },
                { icon: Sparkles, label: 'AI tích hợp' },
                { icon: ShieldCheck, label: 'Phân quyền sâu' },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="lp-float inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md"
                >
                  <Icon className="h-3.5 w-3.5 text-amber-200" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-shimmer-line" aria-hidden="true" />

        {/* ===== MARQUEE ===== */}
        <div className="overflow-hidden border-y border-white/5 bg-white/[0.02] py-4" aria-hidden="true">
          <div className="lp-marquee-track gap-8 px-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/35">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span key={`${item}-${i}`} className="flex items-center gap-8 whitespace-nowrap">
                {item}
                <span className="inline-block h-1 w-1 rounded-full bg-amber-300/50" />
              </span>
            ))}
          </div>
        </div>

        {/* ===== MULTI-TIER STORY ===== */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-teal-300/90">
              Kiến trúc đa tầng
            </p>
            <h2 className="lp-reveal lp-reveal-delay-1 mt-3 font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Một trường. Nhiều cơ sở.
              <br />
              Vận hành thống nhất.
            </h2>
            <p className="lp-reveal lp-reveal-delay-2 mt-4 text-base leading-relaxed text-white/65">
              Super Admin kiến tạo đơn vị và gói module. Admin cơ sở tự tổ chức nhánh con, phân quyền nhân
              sự, cá nhân hóa quy trình — học viên và giảng viên luôn thuộc đúng đơn vị, không nhầm lẫn.
            </p>
            <ul className="lp-reveal lp-reveal-delay-3 mt-8 space-y-3">
              {[
                'Cây tổ chức tối đa 3 cấp dưới đơn vị gốc',
                'License + module bán theo gói, bật/tắt linh hoạt',
                'Cổng đăng nhập theo cơ sở: /coso/[slug]/login',
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 text-sm text-white/80"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-reveal lp-reveal-delay-2 relative">
            <div className="lp-float-slow relative aspect-square overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
              <Image
                src="/landing/network.png"
                alt="Mạng lưới đa cơ sở EDU SYSTEM"
                fill
                sizes="(max-width: 1024px) 100vw, 480px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b1a]/70 via-transparent to-transparent" />
            </div>
          </div>
        </section>

        {/* ===== FEATURES BENTO ===== */}
        <section id="tinh-nang" className="relative px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-violet-300/90">
                All-in-one
              </p>
              <h2 className="lp-reveal lp-reveal-delay-1 mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
                Mọi thứ nhà trường cần — trong một hệ thống
              </h2>
              <p className="lp-reveal lp-reveal-delay-2 mt-4 text-base text-white/60">
                Không còn mảnh ghép rời. Từ tuyển sinh đến tốt nghiệp, từ lớp học đến kế toán.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => {
                const Icon = f.icon
                return (
                  <article
                    key={f.title}
                    className={`lp-reveal lp-reveal-delay-${(i % 4) + 1} lp-glass group rounded-3xl p-5 transition-all duration-300`}
                  >
                    <div
                      className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${f.tint}`}
                    >
                      <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <h3 className="font-heading text-base font-bold text-white">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{f.desc}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== AI + LMS ===== */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="lp-reveal relative order-2 lg:order-1">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
              <Image
                src="/landing/ai-lms.png"
                alt="LMS và AI Tutor hỗ trợ học tập"
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#070b1a]/50 via-transparent to-transparent" />
            </div>
            <div className="lp-float absolute -bottom-4 -right-2 max-w-[220px] rounded-2xl border border-white/15 bg-[#12122e]/85 p-4 shadow-xl backdrop-blur-md sm:right-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-teal-200">
                <Bot className="h-4 w-4" aria-hidden="true" />
                AI Tutor · RAG
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                Trả lời trong phạm vi bài giảng của cơ sở — an toàn, đúng ngữ cảnh.
              </p>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="lp-reveal text-xs font-bold uppercase tracking-[0.25em] text-amber-200/90">
              Trí tuệ nhân tạo
            </p>
            <h2 className="lp-reveal lp-reveal-delay-1 mt-3 font-heading text-3xl font-bold text-white sm:text-4xl">
              AI không thay thầy cô —
              <br />
              AI nâng tầm quản trị
            </h2>
            <p className="lp-reveal lp-reveal-delay-2 mt-4 text-base leading-relaxed text-white/65">
              Soạn bài, tạo câu hỏi, chatbot hỗ trợ học viên, cảnh báo sớm hành vi — tất cả gắn với dữ liệu
              từng cơ sở, không lẫn tenant.
            </p>
            <div className="lp-reveal lp-reveal-delay-3 mt-8 grid gap-3 sm:grid-cols-2">
              {[
                'Tự động sắp xếp & hỗ trợ lịch',
                'Cảnh báo tâm lý / bỏ học sớm',
                'Kiến thức riêng từng đơn vị',
                'Timeout & fallback an toàn',
              ].map((t) => (
                <div
                  key={t}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80"
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== CLOSING CTA ===== */}
        <section className="px-4 pb-24 pt-8 sm:px-6">
          <div className="lp-reveal relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/12 bg-gradient-to-br from-indigo-600/40 via-[#1c1b4b]/80 to-violet-900/50 px-6 py-14 text-center shadow-2xl sm:px-12">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl"
              aria-hidden="true"
            />
            <Sparkles className="mx-auto h-8 w-8 text-amber-200" aria-hidden="true" />
            <h2 className="mt-4 font-heading text-3xl font-bold text-white sm:text-4xl">
              Sẵn sàng vận hành trường học thông minh?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Chọn cổng cơ sở của bạn để đăng nhập. Hệ thống nhận diện đúng đơn vị ngay từ bước đầu.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/coso"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-6 text-sm font-bold text-[#12122e] transition hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                Vào cổng theo cơ sở
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/hdsd"
                className="inline-flex min-h-12 cursor-pointer items-center rounded-2xl border border-white/25 px-6 text-sm font-semibold text-white/90 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Xem hướng dẫn sử dụng
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/35">
        <p>
          © {new Date().getFullYear()} EDU SYSTEM — Hệ thống quản lý giáo dục đa cơ sở tích hợp AI
        </p>
      </footer>

      <SecretAdminBook />
    </div>
  )
}
