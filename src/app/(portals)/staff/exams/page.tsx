import { getExamBoard } from './actions'
import { ExamBoard } from './ExamBoard'
import { ExamOpsTabs } from '@/components/shared/ExamOpsTabs'

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
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Kỳ thi &amp; hạn nhập điểm
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi hạn chấm, gia hạn và chốt sổ. Công bố điểm cho HV/PH nằm ở &quot;Điểm &amp;
          công bố&quot;.
        </p>
      </div>
      <ExamOpsTabs />

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
