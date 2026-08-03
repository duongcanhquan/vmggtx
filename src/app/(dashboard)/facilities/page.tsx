'use client'

import { FacilityBoard } from '@/components/shared/FacilityBoard'
import { AdminOpsTabs } from '@/components/admin/AdminOpsTabs'

export default function FacilitiesBookingPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <AdminOpsTabs />
      </div>
      <FacilityBoard
        title="Đặt phòng & thiết bị"
        subtitle="Lịch tuần CSVC — đặt trước, hệ thống chống trùng giờ. Xe công vụ xem tab Đặt xe."
      />
    </div>
  )
}
