import { FacilityBoard } from '@/components/shared/FacilityBoard'

// ============================================================
// Đặt phòng / thiết bị / xe — Teacher Portal
// GV đặt CSVC cho buổi dạy; quản lý duyệt lượt pending.
// ============================================================

export default function TeacherFacilitiesPage() {
  return (
    <FacilityBoard
      title="Đặt phòng, thiết bị & xe"
      subtitle="Xem lịch trống và đặt trước. Lượt của giáo viên chờ quản lý duyệt khi cần."
    />
  )
}
