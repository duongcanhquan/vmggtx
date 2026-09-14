'use server'

import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveLogoSrc } from '@/lib/branding/orgBrand'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { orgSlugSchema } from '@/lib/utils/orgSlug'
import {
  getSupabaseAnonKey,
  getSupabaseServiceKey,
  getSupabaseUrl,
} from '@/lib/supabase/env'
import type { ActionResult } from '@/lib/validation/schemas'

/** Client anon không cookie — đủ gọi RPC công khai get_public_campus_by_slug. */
function createPublicAnonClient() {
  return createSupabaseJsClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type OrgQueryClient = {
  from: ReturnType<typeof createAdminClient>['from']
}

/** Logo của campus hoặc tổ tiên gần nhất có logo */
async function resolveCampusLogoUrl(
  db: OrgQueryClient,
  orgId: string,
  seedUrl?: string | null,
  seedKey?: string | null
): Promise<string | null> {
  const seeded = resolveLogoSrc({
    id: orgId,
    logo_url: seedUrl,
    logo_key: seedKey,
  })
  if (seeded) return seeded

  type OrgLogoRow = {
    id: string
    parent_id: string | null
    logo_url: string | null
    logo_key: string | null
  }
  let cursorId: string | null = orgId
  for (let i = 0; i < 8 && cursorId; i++) {
    const { data } = await db
      .from('organizations')
      .select('id, parent_id, logo_url, logo_key')
      .eq('id', cursorId)
      .is('deleted_at', null)
      .maybeSingle()
    const org = data as OrgLogoRow | null
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
}

export type PublicCampus = {
  id: string
  name: string
  slug: string
  /** Tên các đơn vị CẤP TRÊN (gần nhất trước): ["Trường A"] — để hiển thị "thuộc Trường A" */
  parentNames?: string[]
  logoUrl?: string | null
}

/**
 * Đi ngược cây tổ chức lấy tên các cấp trên (gần nhất trước, tối đa 4 cấp).
 * BỎ QUA gốc hệ thống (node không có cha) — "Trực thuộc: Hệ thống" là
 * thông tin vô nghĩa với người dùng cuối.
 */
async function getAncestorNames(
  db: OrgQueryClient,
  orgId: string
): Promise<string[]> {
  const names: string[] = []
  const { data: self } = await db
    .from('organizations')
    .select('parent_id')
    .eq('id', orgId)
    .maybeSingle()
  let nextId: string | null = self?.parent_id ?? null
  for (let i = 0; i < 4 && nextId; i++) {
    const { data: parent } = await db
      .from('organizations')
      .select('name, parent_id')
      .eq('id', nextId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parent) break
    if ((parent.parent_id ?? null) === null) break // gốc hệ thống -> không hiển thị
    names.push(parent.name)
    nextId = parent.parent_id ?? null
  }
  return names
}

/**
 * Tra cứu cơ sở/nhánh công khai theo slug.
 * Dùng RPC 045 qua ANON key (không cần service role) — cổng /{slug}/login
 * vẫn mở được khi Vercel thiếu SUPABASE_SERVICE_ROLE_KEY.
 */
export async function getPublicCampusBySlug(
  slug: string
): Promise<{ campus: PublicCampus | null; error?: string }> {
  const parsed = orgSlugSchema.safeParse(slug)
  if (!parsed.success) {
    return { campus: null, error: 'Đường dẫn cơ sở không hợp lệ.' }
  }

  try {
    const anon = createPublicAnonClient()
    const { data: rpcRows, error: rpcError } = await anon.rpc(
      'get_public_campus_by_slug',
      { p_slug: parsed.data }
    )

    if (!rpcError && Array.isArray(rpcRows) && rpcRows[0]) {
      const row = rpcRows[0] as {
        id: string
        name: string
        slug: string
        logo_url?: string | null
      }
      let parentNames: string[] | undefined
      let logoUrl: string | null | undefined = row.logo_url ?? null
      if (getSupabaseServiceKey()) {
        try {
          const admin = createAdminClient()
          parentNames = await getAncestorNames(admin, row.id)
          logoUrl = await resolveCampusLogoUrl(admin, row.id, row.logo_url, null)
        } catch {
          /* enrich tùy chọn — không chặn cổng login */
        }
      }
      return {
        campus: {
          id: row.id,
          name: row.name,
          slug: row.slug,
          parentNames,
          logoUrl,
        },
      }
    }

    const rpcMissing =
      !!rpcError && /does not exist|schema cache|PGRST202/i.test(rpcError.message)
    if (rpcError && !rpcMissing) {
      return { campus: null, error: `Không tra cứu được cơ sở: ${rpcError.message}` }
    }

    // Fallback admin: nhánh (branch), hoặc khi chưa có RPC 045
    if (!getSupabaseServiceKey()) {
      if (rpcMissing) {
        return {
          campus: null,
          error:
            'Chưa chạy migration 045_org_slugs.sql trên database. Hãy chạy trong Supabase SQL Editor.',
        }
      }
      return {
        campus: null,
        error: `Không có đơn vị nào với mã «${parsed.data}». Hãy seed/tạo đơn vị, hoặc thêm SUPABASE_SERVICE_ROLE_KEY trên Vercel rồi thử lại.`,
      }
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .select('id, name, slug, logo_url, logo_key')
      .eq('slug', parsed.data)
      .in('type', ['campus', 'branch'])
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
    if (!data?.slug) {
      return {
        campus: null,
        error: `Không có đơn vị nào với mã «${parsed.data}». Kiểm tra lại đường dẫn hoặc tạo/seed đơn vị trên Supabase.`,
      }
    }
    const parentNames = await getAncestorNames(admin, data.id)
    const row = data as {
      id: string
      name: string
      slug: string
      logo_url?: string | null
      logo_key?: string | null
    }
    return {
      campus: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        parentNames,
        logoUrl: await resolveCampusLogoUrl(
          admin,
          row.id,
          row.logo_url,
          row.logo_key
        ),
      },
    }
  } catch (error) {
    return {
      campus: null,
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

export type PublicBranchChain = {
  campus: PublicCampus
  /** Chuỗi nhánh từ cao xuống thấp khớp với từng đoạn URL */
  chain: { id: string; name: string; slug: string }[]
}

/**
 * Cổng công khai theo slug: /{slug}/login…
 * (Legacy /coso/{slug}/… vẫn resolve qua middleware redirect.)
 */
export async function getPublicBranchChain(
  campusSlug: string,
  segments: string[]
): Promise<{ data: PublicBranchChain | null; error?: string }> {
  if (segments.length === 0 || segments.length > 4) {
    return { data: null }
  }
  for (const segment of segments) {
    if (!orgSlugSchema.safeParse(segment).success) return { data: null }
  }

  const { campus, error } = await getPublicCampusBySlug(campusSlug)
  if (!campus) return { data: null, error }

  try {
    if (!getSupabaseServiceKey()) {
      return {
        data: null,
        error:
          'Cần SUPABASE_SERVICE_ROLE_KEY trên Vercel để mở đường dẫn nhánh lồng nhau.',
      }
    }
    const admin = createAdminClient()
    const chain: { id: string; name: string; slug: string }[] = []
    let parentId = campus.id
    for (const segment of segments) {
      const { data: node } = await admin
        .from('organizations')
        .select('id, name, slug')
        .eq('parent_id', parentId)
        .eq('slug', segment)
        .is('deleted_at', null)
        .maybeSingle()
      if (!node?.slug) return { data: null }
      chain.push({ id: node.id, name: node.name, slug: node.slug })
      parentId = node.id
    }
    return { data: { campus, chain } }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}

/**
 * Sau khi đăng nhập: xác nhận user thuộc cây cơ sở.
 * Super Admin bị từ chối (D36 — chỉ /login/admin).
 */
export async function assertUserInCampus(
  campusId: string,
  userId?: string
): Promise<
  ActionResult & {
    campusId?: string
    campusName?: string
    /** Đơn vị TRỰC TIẾP của user (có thể là trung tâm/chi nhánh dưới cơ sở) */
    userOrgId?: string
    userOrgName?: string
    /** Chuỗi trực thuộc từ đơn vị của user lên trên: ["Cơ sở A1", "Trường A"] */
    orgChainNames?: string[]
  }
> {
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
    // D36: Super Admin không vào cổng cơ sở — dùng /login/admin
    if (profile.role === 'super_admin') {
      return {
        error:
          'Super Admin đăng nhập tại /login/admin. Không dùng link cổng cơ sở.',
      }
    }
    if (!profile.org_id) {
      return { error: 'Tài khoản chưa được gắn cơ sở.' }
    }

    const subtree = await getDescendantOrgIds(admin, campus.id)
    if (!subtree.includes(profile.org_id)) {
      return {
        error: `Tài khoản không thuộc cơ sở "${campus.name}". Dùng đúng link /…/login do nhà trường gửi.`,
      }
    }

    // Đơn vị trực tiếp + chuỗi trực thuộc để hiển thị ngay sau đăng nhập
    const { data: userOrg } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', profile.org_id)
      .maybeSingle()
    const orgChainNames = await getAncestorNames(admin, profile.org_id)

    return {
      campusId: campus.id,
      campusName: campus.name,
      userOrgId: userOrg?.id ?? profile.org_id,
      userOrgName: userOrg?.name,
      orgChainNames,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
