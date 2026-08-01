import { ServiceDesk } from '@/components/shared/ServiceDesk'

// ============================================================
// Cổng dịch vụ GIÁO VIÊN (/teacher/services) - E-Ticketing 032.
// (Khác /teacher/requests: nơi này dành cho các yêu cầu NGOẠI LỆ
// theo mẫu đơn động; /teacher/requests là đề xuất lịch/xin nghỉ
// gắn thẳng vào thời khóa biểu.)
// ============================================================

export default function TeacherServicesPage() {
  return <ServiceDesk audience="teachers" />
}
