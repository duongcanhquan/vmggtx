'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOrgStore } from '@/lib/store/useOrgStore'

/**
 * org đang thao tác: ưu tiên store (Dashboard selector),
 * fallback org_id trên profiles (Staff/Teacher portal).
 */
export function useEffectiveOrgId(): string | null {
  const storeOrgId = useOrgStore((s) => s.currentOrgId)
  const [profileOrgId, setProfileOrgId] = useState<string | null>(null)

  useEffect(() => {
    if (storeOrgId) return
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', session.user.id)
          .is('deleted_at', null)
          .maybeSingle()
        if (!cancelled) setProfileOrgId(profile?.org_id ?? null)
      } catch {
        if (!cancelled) setProfileOrgId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeOrgId])

  return storeOrgId ?? profileOrgId
}
