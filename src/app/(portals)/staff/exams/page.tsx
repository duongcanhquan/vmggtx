import { getExamBoard } from './actions'
import { ExamBoard } from './ExamBoard'

export const dynamic = 'force-dynamic'

/**
 * QUẢN LÝ KHẢO THÍ (Staff Portal)
 * - Danh sách bài thi + trạng thái 3 màu:
 *   Xanh  = đang mở nhập điểm (còn hạn)
 *   Vàng  = quá hạn, chờ Khảo thí duyệt
 *   Đỏ    = đã duyệt (chốt sổ)
 * - Action: "Gia hạn nhập điểm" / "Chốt sổ điểm".
 */
export default async function StaffExamsPage() {
  const result = await getExamBoard()

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-slate-900">
        Quản lý Khảo thí
      </h1>

      {result.error !== undefined ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-medium text-rose-700">
          {result.error}
        </div>
      ) : (
        <ExamBoard initialExams={result.exams} />
      )}
    </div>
  )
}
