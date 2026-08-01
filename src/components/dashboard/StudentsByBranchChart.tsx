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
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2da" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#78716c' }}
              tickLine={false}
              axisLine={{ stroke: '#e7e2da' }}
              interval={0}
              height={50}
              angle={data.length > 4 ? -20 : 0}
              textAnchor={data.length > 4 ? 'end' : 'middle'}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#78716c' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={48}
            />
            <defs>
              {/* Cột gradient than chì -> ánh gold ở chân, tông luxury */}
              <linearGradient id="branchBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#292524" />
                <stop offset="72%" stopColor="#44403c" />
                <stop offset="100%" stopColor="#a16207" />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={{ fill: '#f3f1ed' }}
              formatter={(value) => [
                `${Number(value ?? 0).toLocaleString('vi-VN')} học viên`,
                'Số học viên',
              ]}
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #e5c369',
                background: '#fffdfa',
                boxShadow: '0 16px 40px -12px rgba(28,25,23,0.25)',
                fontSize: 13,
              }}
            />
            <Bar
              dataKey="students"
              name="Số học viên"
              fill="url(#branchBarGradient)"
              radius={[10, 10, 0, 0]}
              maxBarSize={56}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
