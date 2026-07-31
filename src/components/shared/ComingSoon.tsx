import { Construction } from 'lucide-react'

/** Placeholder cho module đã có trên menu nhưng chưa xây dựng. */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Construction className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="font-heading text-base font-bold text-foreground">
          Module đang phát triển
        </p>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description ??
            'Chức năng này đã có trên menu để hoàn thiện luồng nghiệp vụ và sẽ được xây dựng trong giai đoạn tiếp theo.'}
        </p>
      </div>
    </div>
  )
}
