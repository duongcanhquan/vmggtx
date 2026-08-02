import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// [QA-FIX C] Kiểm tra caller thuộc lớp — đồng bộ LMS /learn / AI
// Lead teacher | class_teachers | enrollment | cohort | academic_staff
// ============================================================

export async function assertClassAccess(
  supabase: SupabaseClient,
  userId: string,
  classId: string,
  classOrgId: string,
  leadTeacherId: string | null
): Promise<boolean> {
  if (leadTeacherId && leadTeacherId === userId) return true

  const [{ data: enrollment }, { data: coTeacher }, { data: staffAuthorized }] =
    await Promise.all([
      supabase
        .from('enrollments')
        .select('id')
        .eq('class_id', classId)
        .eq('student_id', userId)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('class_teachers')
        .select('id')
        .eq('class_id', classId)
        .eq('teacher_id', userId)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase.rpc('is_authorized', {
        p_user_id: userId,
        p_target_org_id: classOrgId,
        p_required_role: 'academic_staff',
      }),
    ])

  if (enrollment || coTeacher || staffAuthorized === true) return true

  // Cohort: class.group_id + class_group_members (064) — bỏ qua nếu chưa migrate
  try {
    const { data: cls } = await supabase
      .from('classes')
      .select('group_id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!cls?.group_id) return false

    const { data: member } = await supabase
      .from('class_group_members')
      .select('id')
      .eq('group_id', cls.group_id)
      .eq('student_id', userId)
      .is('deleted_at', null)
      .maybeSingle()
    return Boolean(member)
  } catch {
    return false
  }
}
