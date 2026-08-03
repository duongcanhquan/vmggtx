'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/utils/org-tree'

// ============================================================
// MyOrgBadge — compact, đồng bộ style OrgTreeSelector
// ============================================================

type MyOrg = { name: string; type: OrgType }

export function MyOrgBadge() {
  const [org, setOrg] = useState<MyOrg | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .is('deleted_at', null)
          .maybeSingle()
        if (!profile?.org_id) return

        const { data: organization } = await supabase
          .from('organizations')
          .select('name, type')
          .eq('id', profile.org_id)
          .is('deleted_at', null)
          .maybeSingle()
        if (!cancelled && organization) {
          setOrg({ name: organization.name, type: organization.type as OrgType })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <div className="h-8 w-36 animate-pulse rounded-lg bg-stone-100" aria-hidden="true" />
  }
  if (!org) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-stone-200/90 bg-[#FCFAF7] px-2.5 py-1.5 text-[11px] text-stone-500 shadow-sm">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        Chưa gắn cơ sở
      </div>
    )
  }

  return (
    <div
      className="flex max-w-[min(16rem,42vw)] items-center gap-1.5 rounded-lg border border-stone-200/90 bg-[#FCFAF7] px-2.5 py-1.5 shadow-sm"
      title={org.name}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden="true" />
      <span className="text-[11px] font-medium leading-tight text-stone-800 line-clamp-2">
        {org.name}
      </span>
      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-700 ring-1 ring-slate-200/80">
        {ORG_TYPE_LABELS[org.type]}
      </span>
    </div>
  )
}
