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
import type { AttendanceWeekPoint } from '@/app/(dashboard)/actions'

// ============================================================
// Biểu đồ cột chồng: điểm danh 7 ngày gần nhất
// (Có mặt = present + late gộp sẵn từ RPC; Vắng; Có phép)
// ============================================================

const DAY_LABEL = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return `${DAY_LABEL[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`
}

export function WeeklyAttendanceChart({ data }: { data: AttendanceWeekPoint[] }) {
  const rows = data.map((point) => ({ ...point, label: formatDay(point.day) }))
  const summary = rows
    .map((r) => `${r.label}: ${r.present} có mặt, ${r.absent} vắng, ${r.excused} có phép`)
    .join('; ')

  return (
    <figure>
      <figcaption className="sr-only">
        Biểu đồ điểm danh 7 ngày gần nhất. {summary}
      </figcaption>
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: '#f3f1ed' }}
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #a5b5f7',
                background: 'rgba(255,255,255,0.92)',
                boxShadow: '0 16px 40px -12px rgba(28,25,23,0.25)',
                fontSize: 13,
              }}
            />
            <Legend
              iconType="circle"
              iconSize={9}
              wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
            />
            <Bar
              dataKey="present"
              name="Có mặt"
              stackId="att"
              fill="#059669"
              maxBarSize={44}
              isAnimationActive={false}
            />
            <Bar
              dataKey="excused"
              name="Có phép"
              stackId="att"
              fill="#d97706"
              maxBarSize={44}
              isAnimationActive={false}
            />
            <Bar
              dataKey="absent"
              name="Vắng"
              stackId="att"
              fill="#e11d48"
              radius={[8, 8, 0, 0]}
              maxBarSize={44}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
