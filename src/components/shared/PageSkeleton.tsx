// ============================================================
// SKELETON dùng cho loading.tsx của mọi route group.
// Hiện NGAY khi bấm chuyển trang (trước khi server trả dữ liệu)
// -> cảm giác bấm phản hồi tức thì, không "đơ".
// ============================================================
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Đang tải trang">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-200" />
        <div className="space-y-2">
          <div className="h-5 w-48 rounded-lg bg-slate-200" />
          <div className="h-3 w-72 rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-slate-100 bg-slate-50" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-slate-100 bg-slate-50" />
    </div>
  )
}
