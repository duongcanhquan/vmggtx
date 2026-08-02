'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLogoSrc } from '@/lib/branding/orgBrand'

/** Logo đơn vị của user đang đăng nhập (leo cây tổ chức). Dùng khi shell không có orgTree. */
export async function getMyBrandLogo(): Promise<string | null> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!profile?.org_id) return null

    let cursorId: string | null = profile.org_id
    for (let i = 0; i < 8 && cursorId; i++) {
      const { data: org } = await admin
        .from('organizations')
        .select('id, parent_id, logo_url, logo_key')
        .eq('id', cursorId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!org) break
      const src = resolveLogoSrc({
        id: org.id,
        logo_url: org.logo_url,
        logo_key: org.logo_key,
      })
      if (src) return src
      cursorId = org.parent_id
    }
    return null
  } catch {
    return null
  }
}
