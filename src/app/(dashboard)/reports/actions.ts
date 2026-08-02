'use server'

import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

async function resolveOrgScope(orgId: string | null): Promise<
  | { error: string }
  | { error?: undefined; orgIds: string[]; userId: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  let target = orgId
  if (!target) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    target = profile?.org_id ?? null
  }
  if (!target) return { error: 'Chưa chọn cơ sở.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  const { data: authorized } = await supabase.rpc('is_authorized', {
    p_user_id: user.id,
    p_target_org_id: target,
    p_required_role: 'academic_staff',
  })
  let allowed = authorized === true
  if (!allowed) {
    const { data: accOk } = await supabase.rpc('is_authorized', {
      p_user_id: user.id,
      p_target_org_id: target,
      p_required_role: 'accountant',
    })
    allowed = accOk === true
  }
  // Fail-safe khi RPC chưa có accountant (pre-049): cho kế toán cùng subtree
  if (
    !allowed &&
    profile?.role === 'accountant' &&
    profile.org_id
  ) {
    const mine = await getDescendantOrgIds(supabase, profile.org_id)
    allowed = mine.includes(target) || profile.org_id === target
  }
  if (!allowed) {
    return { error: 'Bạn không có quyền xem báo cáo cơ sở này.' }
  }

  const orgIds = await getDescendantOrgIds(supabase, target)
  if (!orgIds.includes(target)) orgIds.push(target)
  return { orgIds, userId: user.id }
}

export type CampusReport = {
  students: number
  activeClasses: number
  collected: number
  outstanding: number
  warningsOpen: number
  presentRateWeek: number
  byBranch: { name: string; students: number }[]
  attendanceWeek: { day: string; present: number; absent: number }[]
  enrollPie: { name: string; value: number }[]
  warningPie: { name: string; value: number }[]
}

export async function getCampusReport(
  orgId: string | null
): Promise<{ data: CampusReport | null; error?: string }> {
  const empty: CampusReport = {
    students: 0,
    activeClasses: 0,
    collected: 0,
    outstanding: 0,
    warningsOpen: 0,
    presentRateWeek: 100,
    byBranch: [],
    attendanceWeek: [],
    enrollPie: [],
    warningPie: [],
  }
  try {
    const scope = await resolveOrgScope(orgId)
    if (scope.error !== undefined) return { data: null, error: scope.error }
    const supabase = createClient()
    const { orgIds } = scope
    const today = new Date().toISOString().slice(0, 10)

    const [
      studentsRes,
      classesRes,
      paymentsRes,
      invoicesRes,
      warningsRes,
      enrollRes,
      attendRes,
      orgsRes,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, org_id')
        .eq('role', 'student')
        .in('org_id', orgIds)
        .is('deleted_at', null),
      supabase
        .from('classes')
        .select('id', { count: 'exact', head: true })
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .or(`end_date.is.null,end_date.gte.${today}`),
      supabase
        .from('payments')
        .select('amount_paid')
        .in('org_id', orgIds)
        .is('deleted_at', null),
      supabase
        .from('invoices')
        .select('amount, status')
        .in('org_id', orgIds)
        .neq('status', 'cancelled')
        .is('deleted_at', null),
      supabase
        .from('student_warnings')
        .select('id, status, warning_type')
        .in('org_id', orgIds)
        .is('deleted_at', null),
      supabase
        .from('enrollments')
        .select('status')
        .in('org_id', orgIds)
        .is('deleted_at', null),
      supabase
        .from('attendance')
        .select('status, created_at')
        .in('org_id', orgIds)
        .is('deleted_at', null)
        .gte(
          'created_at',
          new Date(Date.now() - 7 * 86400000).toISOString()
        ),
      supabase
        .from('organizations')
        .select('id, name, parent_id')
        .in('id', orgIds)
        .is('deleted_at', null),
    ])

    const students = studentsRes.data ?? []
    const collected = (paymentsRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount_paid ?? 0),
      0
    )
    const invoiced = (invoicesRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0
    )
    const outstanding = Math.max(0, invoiced - collected)

    const warnings = warningsRes.data ?? []
    const warningsOpen = warnings.filter((w) => w.status !== 'resolved').length
    const warnAtt = warnings.filter((w) => w.warning_type === 'attendance').length
    const warnGrade = warnings.filter((w) => w.warning_type === 'grade').length

    const enrollCounts = new Map<string, number>()
    for (const e of enrollRes.data ?? []) {
      const k = e.status || 'other'
      enrollCounts.set(k, (enrollCounts.get(k) ?? 0) + 1)
    }
    const ENROLL_LABEL: Record<string, string> = {
      active: 'Đang học',
      paused: 'Tạm dừng',
      dropped: 'Nghỉ',
      completed: 'Hoàn thành',
    }

    const dayMap = new Map<string, { present: number; absent: number }>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      dayMap.set(d.toISOString().slice(0, 10), { present: 0, absent: 0 })
    }
    let present = 0
    let totalAtt = 0
    for (const row of attendRes.data ?? []) {
      const day = String(row.created_at).slice(0, 10)
      const bucket = dayMap.get(day)
      if (!bucket) continue
      totalAtt += 1
      if (row.status === 'present') {
        bucket.present += 1
        present += 1
      } else if (row.status === 'absent') {
        bucket.absent += 1
      }
    }

    const rootId = orgId ?? orgIds[0]
    const byBranchMap = new Map<string, number>()
    const orgName = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name]))
    for (const s of students) {
      if (!s.org_id) continue
      byBranchMap.set(s.org_id, (byBranchMap.get(s.org_id) ?? 0) + 1)
    }
    const byBranch = [...byBranchMap.entries()]
      .map(([id, count]) => ({
        name: (orgName.get(id) ?? '—').slice(0, 16),
        students: count,
      }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 8)

    void rootId

    return {
      data: {
        students: students.length,
        activeClasses: classesRes.count ?? 0,
        collected,
        outstanding,
        warningsOpen,
        presentRateWeek: totalAtt > 0 ? Math.round((present / totalAtt) * 100) : 100,
        byBranch,
        attendanceWeek: [...dayMap.entries()].map(([day, v]) => ({
          day: day.slice(5),
          present: v.present,
          absent: v.absent,
        })),
        enrollPie: [...enrollCounts.entries()].map(([k, value]) => ({
          name: ENROLL_LABEL[k] ?? k,
          value,
        })),
        warningPie: [
          { name: 'Vắng', value: warnAtt },
          { name: 'Điểm', value: warnGrade },
        ].filter((x) => x.value > 0),
      },
    }
  } catch (e) {
    return {
      data: empty,
      error: e instanceof Error ? e.message : 'Lỗi tải báo cáo.',
    }
  }
}

export type AcademicWarningReport = {
  total: number
  attendance: number
  grade: number
  statusNew: number
  statusNotified: number
  statusResolved: number
  byClass: { name: string; count: number }[]
  trend: { day: string; count: number }[]
}

export async function getAcademicWarningReport(
  orgId: string | null
): Promise<{ data: AcademicWarningReport | null; error?: string }> {
  try {
    const scope = await resolveOrgScope(orgId)
    if (scope.error !== undefined) return { data: null, error: scope.error }
    const supabase = createClient()

    const { data: warnings, error } = await supabase
      .from('student_warnings')
      .select('id, warning_type, status, created_at, classes(name)')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return { data: null, error: error.message }

    const rows = warnings ?? []
    const byClass = new Map<string, number>()
    const trendMap = new Map<string, number>()
    for (let i = 29; i >= 0; i--) {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - i)
      trendMap.set(d.toISOString().slice(0, 10), 0)
    }

    for (const w of rows) {
      const cls = w.classes as { name?: string } | { name?: string }[] | null
      const name = Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—'
      byClass.set(name, (byClass.get(name) ?? 0) + 1)
      const day = String(w.created_at).slice(0, 10)
      if (trendMap.has(day)) trendMap.set(day, (trendMap.get(day) ?? 0) + 1)
    }

    return {
      data: {
        total: rows.length,
        attendance: rows.filter((w) => w.warning_type === 'attendance').length,
        grade: rows.filter((w) => w.warning_type === 'grade').length,
        statusNew: rows.filter((w) => w.status === 'new').length,
        statusNotified: rows.filter((w) => w.status === 'notified').length,
        statusResolved: rows.filter((w) => w.status === 'resolved').length,
        byClass: [...byClass.entries()]
          .map(([name, count]) => ({ name: name.slice(0, 18), count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        trend: [...trendMap.entries()].map(([day, count]) => ({
          day: day.slice(5),
          count,
        })),
      },
    }
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Lỗi tải cảnh báo.',
    }
  }
}

export type ExamAnalyticsReport = {
  gradeCount: number
  avgScore: number
  passRate: number
  failCount: number
  distribution: { name: string; value: number }[]
  byClass: { name: string; avg: number }[]
}

export async function getExamAnalyticsReport(
  orgId: string | null
): Promise<{ data: ExamAnalyticsReport | null; error?: string }> {
  try {
    const scope = await resolveOrgScope(orgId)
    if (scope.error !== undefined) return { data: null, error: scope.error }
    // Exam analytics needs academic_staff+
    const supabase = createClient()
    const { data: authz } = await supabase.rpc('is_authorized', {
      p_user_id: scope.userId,
      p_target_org_id: scope.orgIds[0],
      p_required_role: 'academic_staff',
    })
    if (authz !== true) {
      return { data: null, error: 'Báo cáo khảo thí dành cho Giáo vụ trở lên.' }
    }

    const { data: grades, error } = await supabase
      .from('grades')
      .select('score, assessments(classes(name))')
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .limit(2000)
    if (error) return { data: null, error: error.message }

    const scores = (grades ?? []).map((g) => Number(g.score))
    const gradeCount = scores.length
    const avgScore =
      gradeCount > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / gradeCount) * 10) / 10
        : 0
    const passCount = scores.filter((s) => s >= 5).length
    const failCount = scores.filter((s) => s < 5).length
    const passRate =
      gradeCount > 0 ? Math.round((passCount / gradeCount) * 100) : 0

    const buckets = [
      { name: '<5', value: 0 },
      { name: '5–6.5', value: 0 },
      { name: '6.5–8', value: 0 },
      { name: '8–10', value: 0 },
    ]
    for (const s of scores) {
      if (s < 5) buckets[0].value += 1
      else if (s < 6.5) buckets[1].value += 1
      else if (s < 8) buckets[2].value += 1
      else buckets[3].value += 1
    }

    const classMap = new Map<string, { sum: number; n: number }>()
    for (const g of grades ?? []) {
      const assessment = (
        Array.isArray(g.assessments) ? g.assessments[0] : g.assessments
      ) as { classes?: { name?: string } | { name?: string }[] | null } | null
      const cls = Array.isArray(assessment?.classes)
        ? assessment?.classes[0]
        : assessment?.classes
      const name = cls?.name ?? '—'
      const entry = classMap.get(name) ?? { sum: 0, n: 0 }
      entry.sum += Number(g.score)
      entry.n += 1
      classMap.set(name, entry)
    }

    return {
      data: {
        gradeCount,
        avgScore,
        passRate,
        failCount,
        distribution: buckets,
        byClass: [...classMap.entries()]
          .map(([name, v]) => ({
            name: name.slice(0, 18),
            avg: Math.round((v.sum / v.n) * 10) / 10,
          }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 10),
      },
    }
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : 'Lỗi tải khảo thí.',
    }
  }
}
