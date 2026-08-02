'use server'

import { createClient } from '@/lib/supabase/server'

export type TeacherClassInsight = {
  classId: string
  className: string
  studentCount: number
  presentRate: number
  avgScore: number | null
  atRisk: { id: string; name: string; reason: string }[]
}

export async function getTeacherInsights(): Promise<{
  classes: TeacherClassInsight[]
  loadError?: string | null
}> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { classes: [], loadError: 'Bạn chưa đăng nhập.' }

    const { data: classes, error: cErr } = await supabase
      .from('classes')
      .select('id, name, org_id')
      .eq('teacher_id', user.id)
      .is('deleted_at', null)
      .order('name')
    if (cErr) return { classes: [], loadError: cErr.message }
    if (!classes || classes.length === 0) return { classes: [], loadError: null }

    const results: TeacherClassInsight[] = []

    for (const cls of classes) {
      const { data: sessionRows } = await supabase
        .from('class_sessions')
        .select('id')
        .eq('class_id', cls.id)
        .is('deleted_at', null)
        .limit(200)
      const sessionIds = (sessionRows ?? []).map((s) => s.id)

      const [enrollRes, attendRes, gradeRes, warnRes] = await Promise.all([
        supabase
          .from('enrollments')
          .select('student_id, profiles!enrollments_student_id_fkey(id, full_name)')
          .eq('class_id', cls.id)
          .eq('status', 'active')
          .is('deleted_at', null),
        sessionIds.length > 0
          ? supabase
              .from('attendance')
              .select('student_id, status')
              .in('session_id', sessionIds)
              .is('deleted_at', null)
              .limit(2000)
          : Promise.resolve({ data: [] as { student_id: string; status: string }[] }),
        supabase
          .from('grades')
          .select('score, assessments!inner(class_id)')
          .eq('assessments.class_id', cls.id)
          .is('deleted_at', null)
          .limit(2000),
        supabase
          .from('student_warnings')
          .select(
            'student_id, warning_type, profiles!student_warnings_student_id_fkey(full_name)'
          )
          .eq('class_id', cls.id)
          .neq('status', 'resolved')
          .is('deleted_at', null)
          .limit(20),
      ])

      const students = enrollRes.data ?? []
      let present = 0
      let total = 0
      for (const a of attendRes.data ?? []) {
        total += 1
        if (a.status === 'present') present += 1
      }
      const presentRate = total > 0 ? Math.round((present / total) * 100) : 100

      const scores = (gradeRes.data ?? []).map((g) => Number(g.score))
      const avgScore =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null

      const atRisk: TeacherClassInsight['atRisk'] = []
      for (const w of warnRes.data ?? []) {
        const p = w.profiles as
          | { full_name?: string }
          | { full_name?: string }[]
          | null
        const name = Array.isArray(p) ? p[0]?.full_name : p?.full_name
        atRisk.push({
          id: w.student_id,
          name: name ?? 'Học viên',
          reason:
            w.warning_type === 'attendance' ? 'Vắng nhiều' : 'Điểm yếu',
        })
      }

      // Absent-heavy students without warning yet
      if (atRisk.length < 5 && attendRes.data) {
        const absentByStudent = new Map<string, number>()
        for (const a of attendRes.data) {
          if (a.status !== 'absent') continue
          absentByStudent.set(
            a.student_id,
            (absentByStudent.get(a.student_id) ?? 0) + 1
          )
        }
        const nameById = new Map<string, string>()
        for (const row of students) {
          const profile = row.profiles as
            | { id?: string; full_name?: string }
            | { id?: string; full_name?: string }[]
            | null
          const p = Array.isArray(profile) ? profile[0] : profile
          if (p?.id) nameById.set(p.id, p.full_name ?? '—')
        }
        for (const [sid, count] of absentByStudent) {
          if (count < 3) continue
          if (atRisk.some((x) => x.id === sid)) continue
          atRisk.push({
            id: sid,
            name: nameById.get(sid) ?? 'Học viên',
            reason: `Vắng ${count} buổi`,
          })
          if (atRisk.length >= 5) break
        }
      }

      results.push({
        classId: cls.id,
        className: cls.name,
        studentCount: students.length,
        presentRate,
        avgScore,
        atRisk: atRisk.slice(0, 5),
      })
    }

    return { classes: results, loadError: null }
  } catch (e) {
    return {
      classes: [],
      loadError: e instanceof Error ? e.message : 'Không tải được báo cáo lớp.',
    }
  }
}
