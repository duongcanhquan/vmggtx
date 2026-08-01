'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { orgSlugSchema } from '@/lib/utils/orgSlug'
import type { ActionResult } from '@/lib/validation/schemas'

export type PublicCampus = {
  id: string
  name: string
  slug: string
}

/**
 * Tra cứu cơ sở công khai theo slug (RPC 045; fallback admin nếu RPC chưa chạy).
 */
export async function getPublicCampusBySlug(
  slug: string
): Promise<{ campus: PublicCampus | null; error?: string }> {
  const parsed = orgSlugSchema.safeParse(slug)
  if (!parsed.success) {
    return { campus: null, error: 'Đường dẫn cơ sở không hợp lệ.' }
  }

  try {
    const admin = createAdminClient()

    // Ưu tiên RPC công khai (anon cũng gọi được sau khi chạy 045)
    const { data: rpcRows, error: rpcError } = await admin.rpc(
      'get_public_campus_by_slug',
      { p_slug: parsed.data }
    )
    if (!rpcError && Array.isArray(rpcRows) && rpcRows[0]) {
      const row = rpcRows[0] as PublicCampus
      return { campus: { id: row.id, name: row.name, slug: row.slug } }
    }

    // Fallback khi chưa chạy migration 045 / RPC thiếu
    if (rpcError && !/does not exist|schema cache|PGRST202/i.test(rpcError.message)) {
      return { campus: null, error: `Không tra cứu được cơ sở: ${rpcError.message}` }
    }

    const { data, error } = await admin
      .from('organizations')
      .select('id, name, slug')
      .eq('type', 'campus')
      .eq('slug', parsed.data)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      if (/slug|42703|PGRST204|does not exist|schema cache/i.test(error.message)) {
        return {
          campus: null,
          error:
            'Chưa chạy migration 045_org_slugs.sql trên database. Hãy chạy trong Supabase SQL Editor.',
        }
      }
      return { campus: null, error: `Không tra cứu được cơ sở: ${error.message}` }
    }
    if (!data?.slug) return { campus: null }
    return {
      campus: { id: data.id, name: data.name, slug: data.slug },
    }
  } catch (error) {
    return {
      campus: null,
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

/**
 * Sau khi đăng nhập: xác nhận user thuộc cây cơ sở (super_admin luôn được).
 * Truyền `userId` từ client (sau signIn) để KHÔNG phụ thuộc cookie session
 * (tránh race cookie chưa kịp → "Bạn chưa đăng nhập").
 */
export async function assertUserInCampus(
  campusId: string,
  userId?: string
): Promise<ActionResult & { campusId?: string; campusName?: string }> {
  if (!campusId || campusId.length < 30) {
    return { error: 'Cơ sở không hợp lệ.' }
  }

  try {
    let uid = userId && userId.length > 30 ? userId : null
    if (!uid) {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      uid = user?.id ?? null
    }
    if (!uid) return { error: 'Bạn chưa đăng nhập.' }

    const admin = createAdminClient()
    const [{ data: profile }, { data: campus }] = await Promise.all([
      admin
        .from('profiles')
        .select('role, org_id')
        .eq('id', uid)
        .is('deleted_at', null)
        .maybeSingle(),
      admin
        .from('organizations')
        .select('id, name, type')
        .eq('id', campusId)
        .eq('type', 'campus')
        .is('deleted_at', null)
        .maybeSingle(),
    ])

    if (!campus) return { error: 'Cơ sở không tồn tại hoặc đã bị xóa.' }
    if (!profile) return { error: 'Không tìm thấy hồ sơ người dùng.' }
    if (profile.role === 'super_admin') {
      return { campusId: campus.id, campusName: campus.name }
    }
    if (!profile.org_id) {
      return { error: 'Tài khoản chưa được gắn cơ sở.' }
    }

    const subtree = await getDescendantOrgIds(admin, campus.id)
    if (!subtree.includes(profile.org_id)) {
      return {
        error: `Tài khoản không thuộc cơ sở "${campus.name}". Vào đúng /coso/… của bạn hoặc dùng /login.`,
      }
    }

    return { campusId: campus.id, campusName: campus.name }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
