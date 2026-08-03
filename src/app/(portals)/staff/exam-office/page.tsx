'use client'

import Link from 'next/link'
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  FileSpreadsheet,
  FileStack,
  GraduationCap,
  PenSquare,
  ShieldCheck,
  BarChart3,
  RefreshCcw,
  CheckSquare,
} from 'lucide-react'
import { ExamOpsTabs } from '@/components/shared/ExamOpsTabs'
import { ModuleAiInline } from '@/components/ai/ModuleAiInline'

const STEPS = [
  {
    step: '1',
    title: 'Nhận / làm đề',
    desc: 'Ngân hàng đề + phát đề theo lịch; quiz LMS bổ sung làm đề trực tuyến.',
    href: '/staff/exam-bank',
    icon: FileStack,
  },
  {
    step: '2',
    title: 'Sắp xếp thi',
    desc: 'Phòng thi, khung giờ, giám thị GT1/GT2, tổ chức mã đề & thi lại.',
    href: '/staff/exam-schedule',
    icon: ShieldCheck,
  },
  {
    step: '3',
    title: 'Nhập & kiểm soát điểm',
    desc: 'Tạo cột điểm chính thức, nhập điểm, hạn chấm — quyền cao nhất thuộc Khảo thí.',
    href: '/staff/exam-grades',
    icon: PenSquare,
  },
  {
    step: '4',
    title: 'Công bố điểm',
    desc: 'Chỉ sau khi công bố, học viên / phụ huynh mới xem được điểm trên cổng.',
    href: '/staff/exam-grades',
    icon: CheckSquare,
  },
  {
    step: '5',
    title: 'Xuất & báo cáo',
    desc: 'Danh sách phòng thi, SBD, bảng điểm tổng, báo cáo đậu–rớt.',
    href: '/staff/exam-export',
    icon: FileSpreadsheet,
  },
  {
    step: '6',
    title: 'Lộ trình học tập',
    desc: 'Theo dõi mốc đầu ra / tín chỉ theo chương trình của từng học viên.',
    href: '/staff/learning-pathways',
    icon: GraduationCap,
  },
]

const QUICK = [
  { label: 'Kỳ thi đang mở', href: '/staff/exams', icon: ClipboardList },
  { label: 'Tổ chức thi & thi lại', href: '/staff/assessments', icon: RefreshCcw },
  { label: 'Bảng điểm tổng', href: '/academic/transcripts', icon: BookOpenCheck },
  { label: 'Báo cáo thi cử', href: '/reports/exams', icon: BarChart3 },
]

export default function ExamOfficePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Trung tâm Khảo thí</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Module riêng biệt khỏi Đào tạo / Học vụ. Kiểm soát toàn bộ vòng đời thi cử: đề → lịch →
          điểm → công bố → xuất báo cáo → lộ trình học tập.
        </p>
      </div>

      <ExamOpsTabs />

      <ModuleAiInline moduleKey="exams" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.step + item.title}
              href={item.href}
              className="group rounded-2xl border border-border bg-surface p-4 transition hover:border-indigo-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700">
                  {item.step}
                </span>
                <Icon className="h-5 w-5 text-indigo-500" aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-sm font-bold text-foreground">{item.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 group-hover:underline">
                Mở <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Link>
          )
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-slate-50/70 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Lối tắt nghiệp vụ
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((q) => {
            const Icon = q.icon
            return (
              <Link
                key={q.href}
                href={q.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:border-indigo-300 hover:bg-indigo-50"
              >
                <Icon className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                {q.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
