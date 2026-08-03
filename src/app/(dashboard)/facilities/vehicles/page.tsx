'use client'

import { FacilityBoard } from '@/components/shared/FacilityBoard'
import { AdminOpsTabs } from '@/components/admin/AdminOpsTabs'

export default function VehicleBookingPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <AdminOpsTabs />
      </div>
      <FacilityBoard
        title="Đặt xe công vụ"
        subtitle="Đăng ký xe theo khung giờ — chống trùng lịch. Thêm xe mới trong danh mục (loại Xe) hoặc form bên dưới nếu bạn có quyền quản trị."
        defaultTypeFilter="vehicle"
        manageTypeDefault="vehicle"
      />
    </div>
  )
}
