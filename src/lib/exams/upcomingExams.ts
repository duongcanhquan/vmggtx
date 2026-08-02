'use server'

import { createClient } from '@/lib/supabase/server'

export type UpcomingExamRow = {
  id: string
  room: string | null
  start_time: string
  end_time: string
  assessment_name: string
  class_name: string
  role_label: string | null
}

function migHint(msg: string): string {
  if (/exam_schedules|exam_proctors|does not exist/i.test(msg)) {
    return 'Thiếu bảng lịch thi (migration 031). Chạy migration khảo thí trên Supabase.'
  }
  return msg
}

/** GV: lịch coi thi sắp tới (qua exam_proctors) */
export async function getMyUpcomingProctorExams(): Promise<{
  data: UpcomingExamRow[]
  error?: string
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Chưa đăng nhập.' }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('exam_schedules')
      .select(
        'id, room, start_time, end_time, assessments(name, classes(name)), exam_proctors!inner(role, teacher_id)'
      )
      .eq('exam_proctors.teacher_id', user.id)
      .is('deleted_at', null)
      .gte('start_time', now)
      .order('start_time')
      .limit(40)

    if (error) return { data: [], error: migHint(error.message) }

    const rows: UpcomingExamRow[] = (data ?? []).map((s) => {
      const asm = s.assessments as
        | { name?: string; classes?: { name?: string } | { name?: string }[] }
        | { name?: string; classes?: { name?: string } | { name?: string }[] }[]
        | null
      const a = Array.isArray(asm) ? asm[0] : asm
      const cls = a?.classes
      const className = Array.isArray(cls)
        ? cls[0]?.name ?? '—'
        : cls?.name ?? '—'
      const proctors = s.exam_proctors as
        | { role?: string; teacher_id?: string }
        | { role?: string; teacher_id?: string }[]
        | null
      const mine = Array.isArray(proctors)
        ? proctors.find((p) => p.teacher_id === user.id) ?? proctors[0]
        : proctors
      const role = mine?.role
      return {
        id: String(s.id),
        room: (s.room as string | null) ?? null,
        start_time: String(s.start_time),
        end_time: String(s.end_time),
        assessment_name: a?.name ?? '—',
        class_name: className,
        role_label:
          role === 'proctor_1'
            ? 'GT1'
            : role === 'proctor_2'
              ? 'GT2'
              : role ?? null,
      }
    })
    return { data: rows }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lịch coi thi.',
    }
  }
}

/** HV: lịch thi của lớp đang học */
export async function getMyUpcomingStudentExams(): Promise<{
  data: UpcomingExamRow[]
  error?: string
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Chưa đăng nhập.' }

    const { data: enrolls, error: eErr } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (eErr) return { data: [], error: eErr.message }
    const classIds = (enrolls ?? []).map((e) => e.class_id as string)
    if (classIds.length === 0) return { data: [] }

    const { data: assessments, error: aErr } = await supabase
      .from('assessments')
      .select('id, name, class_id, classes(name)')
      .in('class_id', classIds)
      .is('deleted_at', null)

    if (aErr) return { data: [], error: aErr.message }
    const assessmentIds = (assessments ?? []).map((a) => a.id as string)
    if (assessmentIds.length === 0) return { data: [] }

    const now = new Date().toISOString()
    const { data: schedules, error: sErr } = await supabase
      .from('exam_schedules')
      .select('id, room, start_time, end_time, assessment_id')
      .in('assessment_id', assessmentIds)
      .is('deleted_at', null)
      .gte('start_time', now)
      .order('start_time')
      .limit(40)

    if (sErr) return { data: [], error: migHint(sErr.message) }

    const asmMap = new Map(
      (assessments ?? []).map((a) => {
        const cls = a.classes as { name?: string } | { name?: string }[] | null
        const className = Array.isArray(cls)
          ? cls[0]?.name ?? '—'
          : cls?.name ?? '—'
        return [a.id as string, { name: a.name as string, className }]
      })
    )

    return {
      data: (schedules ?? []).map((s) => {
        const meta = asmMap.get(s.assessment_id as string)
        return {
          id: s.id as string,
          room: (s.room as string | null) ?? null,
          start_time: String(s.start_time),
          end_time: String(s.end_time),
          assessment_name: meta?.name ?? '—',
          class_name: meta?.className ?? '—',
          role_label: null,
        }
      }),
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Lỗi tải lịch thi.',
    }
  }
}
