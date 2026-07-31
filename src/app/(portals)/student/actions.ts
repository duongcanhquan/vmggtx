'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================
// WORKSPACE HỌC SINH (/student) — dữ liệu trang chủ mobile.
// Dùng Admin client nhưng MỌI query đều khóa cứng student_id =
// auth.uid() (pattern như Parent Portal — RLS một số bảng tài
// chính/cảnh báo không mở cho học sinh đọc trực tiếp).
// ============================================================

export type NextLesson = {
  sessionId: string
  classId: string
  className: string
  room: string | null
  teacherName: string | null
  startTime: string
  endTime: string
}

export type StudentAlert = {
  id: string
  kind: 'tuition' | 'attendance' | 'grade'
  title: string
  description: string
  /** Cảnh báo mức đỏ (quá hạn / vắng nhiều) hay vàng */
  severe: boolean
  href: string
}

export type StudentHomeResult =
  | { error: string }
  | {
      error?: undefined
      studentName: string
      nextLesson: NextLesson | null
      alerts: StudentAlert[]
    }

const vndFormat = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})
const dueDateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
})

export async function getStudentHome(): Promise<StudentHomeResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const today = new Date().toISOString().slice(0, 10)

    const [profileResult, enrollmentsResult, invoicesResult, warningsResult] =
      await Promise.all([
        admin
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .is('deleted_at', null)
          .maybeSingle(),
        admin
          .from('enrollments')
          .select('class_id')
          .eq('student_id', user.id)
          .is('deleted_at', null),
        // Học phí chưa đóng đủ
        admin
          .from('invoices')
          .select('id, amount, status, due_date')
          .eq('student_id', user.id)
          .in('status', ['pending', 'partial'])
          .is('deleted_at', null)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(5),
        // Cảnh báo học vụ chưa xử lý xong
        admin
          .from('student_warnings')
          .select('id, warning_type, description, classes(name)')
          .eq('student_id', user.id)
          .neq('status', 'resolved')
          .is('deleted_at', null)
          .limit(5),
      ])

    // ===== Bài học kế tiếp (buổi chưa kết thúc, gần nhất) =====
    let nextLesson: NextLesson | null = null
    const classIds = [
      ...new Set((enrollmentsResult.data ?? []).map((e) => e.class_id as string)),
    ]
    if (classIds.length > 0) {
      const { data: sessions } = await admin
        .from('class_sessions')
        .select('id, class_id, room, start_time, end_time, teacher_id, classes(name)')
        .in('class_id', classIds)
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .gt('end_time', nowIso)
        .order('start_time')
        .limit(1)
      const session = (sessions ?? [])[0] as unknown as
        | {
            id: string
            class_id: string
            room: string | null
            start_time: string
            end_time: string
            teacher_id: string | null
            classes: { name: string } | null
          }
        | undefined

      if (session) {
        let teacherName: string | null = null
        if (session.teacher_id) {
          const { data: teacher } = await admin
            .from('profiles')
            .select('full_name')
            .eq('id', session.teacher_id)
            .maybeSingle()
          teacherName = teacher?.full_name ?? null
        }
        nextLesson = {
          sessionId: session.id,
          classId: session.class_id,
          className: session.classes?.name ?? 'Lớp học',
          room: session.room,
          teacherName,
          startTime: session.start_time,
          endTime: session.end_time,
        }
      }
    }

    // ===== Khối cảnh báo (học phí lên trước, rồi học vụ) =====
    const alerts: StudentAlert[] = []
    for (const invoice of invoicesResult.data ?? []) {
      const overdue = invoice.due_date !== null && (invoice.due_date as string) < today
      alerts.push({
        id: `invoice-${invoice.id}`,
        kind: 'tuition',
        title: overdue ? 'Học phí QUÁ HẠN' : 'Nhắc đóng học phí',
        description: `${vndFormat.format(Number(invoice.amount))}${
          invoice.due_date
            ? ` · hạn ${dueDateFormat.format(new Date(invoice.due_date as string))}`
            : ''
        }${invoice.status === 'partial' ? ' (đã đóng một phần)' : ''}`,
        severe: overdue,
        href: '/tuition',
      })
    }
    for (const warning of warningsResult.data ?? []) {
      const className =
        (warning.classes as unknown as { name: string } | null)?.name ?? ''
      alerts.push({
        id: `warning-${warning.id}`,
        kind: warning.warning_type === 'attendance' ? 'attendance' : 'grade',
        title:
          warning.warning_type === 'attendance'
            ? 'Cảnh báo chuyên cần'
            : 'Cảnh báo kết quả học tập',
        description: `${className ? `${className}: ` : ''}${warning.description}`,
        severe: warning.warning_type === 'attendance',
        href: '/grades',
      })
    }
    // Cảnh báo đỏ nổi lên trước
    alerts.sort((a, b) => Number(b.severe) - Number(a.severe))

    return {
      studentName: profileResult.data?.full_name ?? 'bạn',
      nextLesson,
      alerts,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
