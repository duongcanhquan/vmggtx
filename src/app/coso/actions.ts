'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { PublicCampus } from './[slug]/actions'

function mapCampus(row: {
  id: string
  name: string
  slug: string
  logo_url?: string | null
  logo_key?: string | null
}): PublicCampus {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url || (row.logo_key ? `/api/org-logo/${row.id}` : null),
  }
}

/**
 * Danh sách cơ sở công khai có slug (admin/internal). Hub /coso công khai đã bỏ (D14).
 */
export async function listPublicCampuses(): Promise<{
  campuses: PublicCampus[]
  error?: string
}> {
  try {
    const admin = createAdminClient()

    const { data: rpcRows, error: rpcError } = await admin.rpc('list_public_campuses')
    if (!rpcError && Array.isArray(rpcRows)) {
      return {
        campuses: (rpcRows as { id: string; name: string; slug: string; logo_url?: string | null }[])
          .filter((r) => r.slug && r.name)
          .map((r) => mapCampus(r)),
      }
    }

    if (rpcError && !/does not exist|schema cache|PGRST202/i.test(rpcError.message)) {
      return { campuses: [], error: `Không tải danh sách cơ sở: ${rpcError.message}` }
    }

    const { data, error } = await admin
      .from('organizations')
      .select('id, name, slug, logo_url, logo_key')
      .eq('type', 'campus')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      .order('name')

    if (error) {
      if (/logo_url|logo_key/i.test(error.message)) {
        const { data: legacy, error: err2 } = await admin
          .from('organizations')
          .select('id, name, slug')
          .eq('type', 'campus')
          .is('deleted_at', null)
          .not('slug', 'is', null)
          .order('name')
        if (err2) {
          if (/slug|42703|PGRST204|does not exist|schema cache/i.test(err2.message)) {
            return {
              campuses: [],
              error:
                'Chưa chạy migration 045_org_slugs.sql trên database. Hãy chạy trong Supabase SQL Editor.',
            }
          }
          return { campuses: [], error: `Không tải danh sách cơ sở: ${err2.message}` }
        }
        return {
          campuses: ((legacy ?? []) as PublicCampus[]).filter((r) => !!r.slug),
        }
      }
      if (/slug|42703|PGRST204|does not exist|schema cache/i.test(error.message)) {
        return {
          campuses: [],
          error:
            'Chưa chạy migration 045_org_slugs.sql trên database. Hãy chạy trong Supabase SQL Editor.',
        }
      }
      return { campuses: [], error: `Không tải danh sách cơ sở: ${error.message}` }
    }

    return {
      campuses: ((data ?? []) as Parameters<typeof mapCampus>[0][])
        .filter((r) => !!r.slug)
        .map(mapCampus),
    }
  } catch (error) {
    return {
      campuses: [],
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
