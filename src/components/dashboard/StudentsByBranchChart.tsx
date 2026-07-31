'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChildOrgStat } from '@/app/(dashboard)/actions'

export function StudentsByBranchChart({ data }: { data: ChildOrgStat[] }) {
  const summary = data
    .map((d) => `${d.name}: ${d.students.toLocaleString('vi-VN')} học viên`)
    .join('; ')

  return (
    <figure>
      {/* Bản tóm tắt chữ cho screen reader - chart SVG không tự đọc được */}
      <figcaption className="sr-only">
        Biểu đồ cột so sánh số học viên giữa các nhánh trực thuộc. {summary}
      </figcaption>
      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              interval={0}
              height={50}
              angle={data.length > 4 ? -20 : 0}
              textAnchor={data.length > 4 ? 'end' : 'middle'}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={48}
            />
            <Tooltip
              cursor={{ fill: '#eef2ff' }}
              formatter={(value) => [
                `${Number(value ?? 0).toLocaleString('vi-VN')} học viên`,
                'Số học viên',
              ]}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
                fontSize: 13,
              }}
            />
            <Bar
              dataKey="students"
              name="Số học viên"
              fill="#4f46e5"
              radius={[8, 8, 0, 0]}
              maxBarSize={56}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
