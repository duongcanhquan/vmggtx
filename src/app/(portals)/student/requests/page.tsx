import { ServiceDesk } from '@/components/shared/ServiceDesk'

// ============================================================
// Cổng dịch vụ HỌC SINH (/student/requests) - E-Ticketing 032.
// Form sinh động từ form_schema của từng loại đơn.
// ============================================================

export default function StudentRequestsPage() {
  return (
    <div className="px-4 pt-6">
      <ServiceDesk audience="students" />
    </div>
  )
}
