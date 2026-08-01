'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { PublicCampus } from './[slug]/actions'

/**
 * Danh sách cơ sở công khai có slug — trang /coso chọn cơ sở để vào login.
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
        campuses: (rpcRows as PublicCampus[]).filter((r) => r.slug && r.name),
      }
    }

    if (rpcError && !/does not exist|schema cache|PGRST202/i.test(rpcError.message)) {
      return { campuses: [], error: `Không tải danh sách cơ sở: ${rpcError.message}` }
    }

    const { data, error } = await admin
      .from('organizations')
      .select('id, name, slug')
      .eq('type', 'campus')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      .order('name')

    if (error) {
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
      campuses: ((data ?? []) as PublicCampus[]).filter((r) => !!r.slug),
    }
  } catch (error) {
    return {
      campuses: [],
      error: error instanceof Error ? error.message : 'Lỗi không xác định.',
    }
  }
}
