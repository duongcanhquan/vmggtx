import { FacilityBoard } from '@/components/shared/FacilityBoard'
import { ModuleAiInline } from '@/components/ai/ModuleAiInline'

export default function StaffFacilitiesPage() {
  return (
    <div className="space-y-4">
      <ModuleAiInline moduleKey="admin" />
      <FacilityBoard
        title="Đặt phòng, thiết bị & xe"
        subtitle="Cán bộ đặt CSVC / xe công vụ. Quản lý duyệt các lượt chờ (pending). Dùng AI góc phải hoặc khối trên để hỏi quy chế CSVC (KB category=admin)."
      />
    </div>
  )
}
