'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// Thông báo đẩy của Học viên (user_notifications - migration 040)
// ============================================================

export type MyNotification = {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

/** 10 thông báo mới nhất của học viên đang đăng nhập (RLS tự lọc) */
export async function getMyNotifications(): Promise<MyNotification[]> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
      .from('user_notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .eq('recipient_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)
    return (data ?? []) as MyNotification[]
  } catch {
    return []
  }
}

/** Đánh dấu TẤT CẢ thông báo là đã đọc */
export async function markAllNotificationsRead(): Promise<void> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .is('read_at', null)
    revalidatePath('/portal')
  } catch {
    /* không chặn UI vì lỗi đánh dấu đã đọc */
  }
}
