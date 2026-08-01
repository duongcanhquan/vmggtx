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

// Tách riêng để lazy-load: recharts (~100kB) chỉ tải khi cần vẽ.
export type EvaluationChartRow = {
  name: string
  'Sư phạm': number
  'Thái độ': number
  'Đúng giờ': number
}

export default function EvaluationBarChart({ data }: { data: EvaluationChartRow[] }) {
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
        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Sư phạm" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Thái độ" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Đúng giờ" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
