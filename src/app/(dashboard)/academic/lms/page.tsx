'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Building2, Inbox, MonitorPlay } from 'lucide-react'
import { useOrgStore } from '@/lib/store/useOrgStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { FunLoader } from '@/components/shared/FunLoader'
import { LmsManager } from '@/app/(portals)/teacher/lms/LmsManager'
import { listAccessibleLmsClasses, type LmsClassOption } from '@/app/(portals)/teacher/lms/actions'

function AcademicLmsInner() {
  const currentOrgId = useOrgStore((s) => s.currentOrgId)
  const searchParams = useSearchParams()
  const classIdParam = searchParams.get('classId')

  const [classes, setClasses] = useState<LmsClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    const result = await listAccessibleLmsClasses(currentOrgId)
    setClasses(result.classes)
    setError(result.error)
    setLoading(false)
  }, [currentOrgId])

  useEffect(() => {
    void load()
  }, [load])

  if (!currentOrgId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center">
        <Building2 className="h-8 w-8 text-amber-600" aria-hidden="true" />
        <p className="font-heading text-lg font-bold">Chưa chọn cơ sở</p>
        <p className="text-sm text-muted-foreground">Chọn tổ chức ở góc trên để mở LMS.</p>
      </div>
    )
  }

  if (loading) return <FunLoader label="Đang tải lớp LMS…" />

  if (error) {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </p>
    )
  }

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-12 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Chưa có học phần nào trong cơ sở đang chọn.
        </p>
      </div>
    )
  }

  return <LmsManager classes={classes} initialClassId={classIdParam} />
}

export default function AcademicLmsPage() {
  return (
    <RoleGuard
      allowedRoles={['super_admin', 'campus_admin', 'academic_staff', 'teacher']}
      fallback={
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Chỉ Giáo vụ / Quản lý / Giáo viên được mở LMS.
        </p>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <MonitorPlay className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold">LMS Online — bài giảng, bài tập, kiểm tra theo học phần</p>
            <p className="mt-0.5 text-xs text-indigo-800/80">
              Học viên học tại cổng <strong>Học Online</strong> (`/learn`). Chọn cơ sở trên
              thanh tổ chức để xem đúng danh sách lớp.
            </p>
          </div>
        </div>
        <Suspense fallback={<FunLoader label="Đang tải LMS…" />}>
          <AcademicLmsInner />
        </Suspense>
      </div>
    </RoleGuard>
  )
}
