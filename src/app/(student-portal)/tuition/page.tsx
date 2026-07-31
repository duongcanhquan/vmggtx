import { Wallet } from 'lucide-react'

export default function StudentTuitionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Học phí</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hóa đơn học phí và lịch sử đóng tiền của bạn.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Wallet className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          Tính năng đang được phát triển — sẽ hiển thị hóa đơn từ hệ thống Công
          nợ (bảng invoices/payments) trong bản cập nhật tới.
        </p>
      </div>
    </div>
  )
}
