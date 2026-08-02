import type { LucideIcon } from 'lucide-react'

const TINT: Record<
  'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet',
  { card: string; icon: string }
> = {
  indigo: { card: 'bg-indigo-50 border-indigo-100', icon: 'bg-indigo-100 text-indigo-700' },
  emerald: { card: 'bg-emerald-50 border-emerald-100', icon: 'bg-emerald-100 text-emerald-700' },
  amber: { card: 'bg-amber-50 border-amber-100', icon: 'bg-amber-100 text-amber-800' },
  rose: { card: 'bg-rose-50 border-rose-100', icon: 'bg-rose-100 text-rose-700' },
  sky: { card: 'bg-sky-50 border-sky-100', icon: 'bg-sky-100 text-sky-700' },
  violet: { card: 'bg-violet-50 border-violet-100', icon: 'bg-violet-100 text-violet-700' },
}

export function ReportKpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tint = 'indigo',
  className = '',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  tint?: keyof typeof TINT
  className?: string
}) {
  const t = TINT[tint]
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${t.card} ${className}`}
    >
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${t.icon}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 font-heading text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
