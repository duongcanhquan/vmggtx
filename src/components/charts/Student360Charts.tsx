'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Tách riêng để lazy-load: recharts chỉ tải khi mở tab có biểu đồ.

const PIE_COLORS: Record<string, string> = {
  present: '#10b981',
  excused: '#f59e0b',
  absent: '#f43f5e',
}

export function SubjectRadarChart({ data }: { data: { subject: string; score: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#475569' }} />
        <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
        <Radar name="Điểm TB" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export function AttendancePieChart({
  data,
}: {
  data: { key: string; name: string; value: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="50%"
          outerRadius="75%"
          paddingAngle={3}
        >
          {data.map((slice) => (
            <Cell key={slice.key} fill={PIE_COLORS[slice.key] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Legend />
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function DebtBarChart({
  data,
  formatValue,
}: {
  data: Record<string, unknown>[]
  formatValue: (value: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `${Math.round(value / 1_000_000)}tr`}
        />
        <Tooltip formatter={(value) => formatValue(Number(value ?? 0))} />
        <Legend />
        <Bar dataKey="Đã thu" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Còn nợ" stackId="a" fill="#f43f5e" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
