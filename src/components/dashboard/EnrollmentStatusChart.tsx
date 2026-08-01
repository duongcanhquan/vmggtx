'use client'

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

// ============================================================
// Donut vòng đời ghi danh: active / paused / dropped / completed
// ============================================================

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'Đang học', color: '#059669' },
  paused: { label: 'Bảo lưu', color: '#d97706' },
  dropped: { label: 'Thôi học', color: '#e11d48' },
  completed: { label: 'Hoàn thành', color: '#4f46e5' },
}

const FALLBACK_COLORS = ['#78716c', '#0ea5e9', '#a855f7']

export function EnrollmentStatusChart({ data }: { data: Record<string, number> }) {
  let fallbackIndex = 0
  const rows = Object.entries(data)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => {
      const meta = STATUS_META[status]
      const color =
        meta?.color ?? FALLBACK_COLORS[fallbackIndex++ % FALLBACK_COLORS.length]
      return { name: meta?.label ?? status, value: count, color }
    })

  if (rows.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center rounded-xl bg-stone-50 text-sm text-muted-foreground">
        Chưa có dữ liệu ghi danh.
      </p>
    )
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const summary = rows.map((r) => `${r.name}: ${r.value}`).join('; ')

  return (
    <figure>
      <figcaption className="sr-only">
        Biểu đồ trạng thái ghi danh, tổng {total}. {summary}
      </figcaption>
      <div className="relative h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(value, name) => [
                `${Number(value ?? 0).toLocaleString('vi-VN')} lượt`,
                String(name),
              ]}
              contentStyle={{
                borderRadius: 14,
                border: '1px solid #e5c369',
                background: '#fffdfa',
                boxShadow: '0 16px 40px -12px rgba(28,25,23,0.25)',
                fontSize: 13,
              }}
            />
            <Legend
              iconType="circle"
              iconSize={9}
              wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            />
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell key={row.name} fill={row.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Tổng ở tâm donut */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-7">
          <p className="font-heading text-2xl font-bold tabular-nums">
            {total.toLocaleString('vi-VN')}
          </p>
          <p className="text-xs text-muted-foreground">lượt ghi danh</p>
        </div>
      </div>
    </figure>
  )
}
