'use client'

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'

// Tách riêng để lazy-load recharts ở Dashboard Phụ huynh (mobile-first)
export default function AttendanceRadialChart({
  data,
  presentRate,
}: {
  data: { name: string; value: number }[]
  presentRate: number
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart
        innerRadius="72%"
        outerRadius="100%"
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={10}
          fill={presentRate >= 80 ? '#10b981' : '#f43f5e'}
          background={{ fill: '#e2e8f0' }}
        />
      </RadialBarChart>
    </ResponsiveContainer>
  )
}
