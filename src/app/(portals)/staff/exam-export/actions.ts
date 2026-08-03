'use server'

import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { requiredId, zodFail } from '@/lib/validation/schemas'

export type ExamExportRoom = {
  scheduleId: string
  assessmentName: string
  className: string
  room: string
  startTime: string
  endTime: string
  capacity: number | null
  proctors: string[]
  students: { sbd: string; fullName: string; studentCode: string; phone: string | null }[]
}

export async function getExamExportBoard(
  orgId: string
): Promise<{ data: ExamExportRoom[]; error?: string; migrationMissing?: boolean }> {
  const orgParsed = requiredId('Chọn cơ sở.').safeParse(orgId)
  if (!orgParsed.success) return { data: [], error: zodFail(orgParsed.error).error }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Bạn chưa đăng nhập.' }

    const { data: authorized } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: orgParsed.data,
      p_required_role: 'academic_staff',
    })
    if (authorized !== true) {
      return { data: [], error: 'Không có quyền xuất thông tin thi.' }
    }

    const orgIds = await getDescendantOrgIds(supabase, orgParsed.data)
    const ids = orgIds.includes(orgParsed.data) ? orgIds : [orgParsed.data, ...orgIds]

    const { data: schedules, error } = await supabase
      .from('exam_schedules')
      .select(
        'id, room, capacity, start_time, end_time, assessment_id, assessments(name, class_id, classes(name)), exam_proctors(teacher_id, profiles(full_name))'
      )
      .in('org_id', ids)
      .is('deleted_at', null)
      .order('start_time', { ascending: true })
      .limit(200)

    if (error) return { data: [], error: error.message }
    if (!schedules?.length) return { data: [] }

    const classIds = [
      ...new Set(
        schedules
          .map((s) => {
            const a = s.assessments as { class_id?: string } | { class_id?: string }[] | null
            const row = Array.isArray(a) ? a[0] : a
            return row?.class_id
          })
          .filter(Boolean) as string[]
      ),
    ]

    const enrollByClass = new Map<
      string,
      { fullName: string; studentCode: string; phone: string | null }[]
    >()

    if (classIds.length > 0) {
      const { data: enrolls, error: enrollErr } = await supabase
        .from('enrollments')
        .select(
          'class_id, profiles!enrollments_student_id_fkey(full_name, phone, "MaSV", student_code)'
        )
        .in('class_id', classIds)
        .eq('status', 'active')
        .is('deleted_at', null)

      if (enrollErr) {
        return {
          data: [],
          error: `Không tải danh sách học viên: ${enrollErr.message}`,
        }
      }

      for (const row of enrolls ?? []) {
        const profile = row.profiles as
          | {
              full_name: string
              phone: string | null
              MaSV?: string | null
              student_code?: string | null
            }
          | {
              full_name: string
              phone: string | null
              MaSV?: string | null
              student_code?: string | null
            }[]
          | null
        const p = Array.isArray(profile) ? profile[0] : profile
        if (!p) continue
        const list = enrollByClass.get(row.class_id) ?? []
        list.push({
          fullName: p.full_name,
          studentCode: p.MaSV || p.student_code || '—',
          phone: p.phone,
        })
        enrollByClass.set(row.class_id, list)
      }
    }

    const data: ExamExportRoom[] = schedules.map((s) => {
      const assessment = (
        Array.isArray(s.assessments) ? s.assessments[0] : s.assessments
      ) as {
        name: string
        class_id: string
        classes: { name: string } | { name: string }[] | null
      } | null
      const cls = assessment?.classes
      const className = Array.isArray(cls) ? cls[0]?.name : cls?.name
      const roster = [...(enrollByClass.get(assessment?.class_id ?? '') ?? [])].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, 'vi')
      )
      const proctorsRaw = (s.exam_proctors ?? []) as {
        profiles: { full_name: string } | { full_name: string }[] | null
      }[]
      const proctors = proctorsRaw
        .map((p) => {
          const pr = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
          return pr?.full_name
        })
        .filter(Boolean) as string[]

      return {
        scheduleId: s.id,
        assessmentName: assessment?.name ?? '—',
        className: className ?? '—',
        room: s.room,
        startTime: String(s.start_time),
        endTime: String(s.end_time),
        capacity: s.capacity,
        proctors,
        students: roster.map((st, index) => ({
          sbd: String(index + 1).padStart(3, '0'),
          fullName: st.fullName,
          studentCode: st.studentCode,
          phone: st.phone,
        })),
      }
    })

    return { data }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Không tải được dữ liệu xuất thi.',
    }
  }
}
