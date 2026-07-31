'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ORG_TYPE_LABELS, type OrgType } from '@/lib/utils/org-tree'

// ============================================================
// MyOrgBadge — hiển thị TĨNH tên Cơ sở user trực thuộc trên header
// (dành cho Staff: KHÔNG được đổi cơ sở, khác OrgTreeSelector).
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
          data: { user },
        } = await supabase.auth.getUser()
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
    return <div className="h-11 w-44 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
  }
  if (!org) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-muted-foreground shadow-sm">
        <Building2 className="h-4 w-4" aria-hidden="true" />
        Chưa gắn cơ sở
      </div>
    )
  }

  return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm shadow-sm">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="max-w-48 truncate font-medium text-foreground">{org.name}</span>
      <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
        {ORG_TYPE_LABELS[org.type]}
      </span>
    </div>
  )
}
