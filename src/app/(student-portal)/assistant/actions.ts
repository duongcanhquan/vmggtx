'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// TRỢ LÝ AI HỌC VIÊN (/assistant)
// Lấy danh sách lớp học viên ĐANG GHI DANH để chọn ngữ cảnh chat
// (API /api/chat/tutor đã enforce: chỉ học viên ghi danh mới hỏi được).
// ============================================================

export type MyClass = {
  id: string
  name: string
}

export type MyClassesResult =
  | { error: string }
  | { error?: undefined; classes: MyClass[] }

export async function getMyEnrolledClasses(): Promise<MyClassesResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Bạn chưa đăng nhập.' }

    // RLS enrollments: học viên chỉ thấy ghi danh của chính mình
    const { data, error } = await supabase
      .from('enrollments')
      .select('class_id, classes(id, name, deleted_at)')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .is('deleted_at', null)
    if (error) return { error: `Không tải được danh sách lớp: ${error.message}` }

    const rows = (data ?? []) as unknown as {
      class_id: string
      classes: { id: string; name: string; deleted_at?: string | null } | null
    }[]

    const classes: MyClass[] = []
    const seen = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.class_id)) continue
      if (!row.classes || row.classes.deleted_at) continue
      seen.add(row.class_id)
      classes.push({ id: row.class_id, name: row.classes.name ?? 'Lớp học' })
    }
    classes.sort((a, b) => a.name.localeCompare(b.name, 'vi'))

    return { classes }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
