'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Tách riêng để lazy-load: recharts (~100kB) chỉ tải khi vào /admin/budget.

export type SubjectChartRow = {
  subject: string
  sessions: number
  teachingCost: number
}

export type TeacherChartRow = {
  name: string
  'Lương cứng': number
  'Tiền tiết dạy': number
}

const compactVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )

const fullVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(value)) + ' ₫'

export function SubjectCostChart({ data }: { data: SubjectChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="subject"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={compactVnd} width={64} />
        <Tooltip formatter={(value) => fullVnd(Number(value ?? 0))} />
        <Legend />
        <Bar
          dataKey="teachingCost"
          name="Chi phí tiết dạy"
          fill="#8d6532"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TeacherCostChart({ data }: { data: TeacherChartRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={compactVnd} width={64} />
        <Tooltip formatter={(value) => fullVnd(Number(value ?? 0))} />
        <Legend />
        <Bar dataKey="Lương cứng" stackId="pay" fill="#3a7157" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Tiền tiết dạy" stackId="pay" fill="#5d68e8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function BudgetForecastCharts({
  bySubject,
  byTeacher,
}: {
  bySubject: SubjectChartRow[]
  byTeacher: TeacherChartRow[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="bento-card p-5">
        <h2 className="font-heading text-sm font-bold">Chi phí tiết dạy theo môn học</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Số buổi đã xếp lịch × đơn giá tiết của giáo viên phụ trách
        </p>
        <div className="mt-3 h-72">
          {bySubject.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Chưa có buổi học nào được xếp lịch trong tháng này.
            </p>
          ) : (
            <SubjectCostChart data={bySubject} />
          )}
        </div>
      </div>

      <div className="bento-card p-5">
        <h2 className="font-heading text-sm font-bold">Top giáo viên theo chi phí dự kiến</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Lương cứng + tiền tiết dạy (gross, trước khấu trừ)
        </p>
        <div className="mt-3 h-72">
          {byTeacher.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Chưa có dữ liệu chi phí giáo viên.
            </p>
          ) : (
            <TeacherCostChart data={byTeacher} />
          )}
        </div>
      </div>
    </div>
  )
}
