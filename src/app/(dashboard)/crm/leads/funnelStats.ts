import {
  LEAD_SOURCES,
  type LeadSource,
} from '@/lib/validation/schemas'
import type { LeadCard, LeadFunnelStats, LeadStatus } from './actions'

const SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: 'Walk-in',
  hotline: 'Hotline',
  facebook: 'Facebook',
  zalo: 'Zalo',
  website: 'Website',
  referral: 'Giới thiệu',
  school_event: 'Sự kiện trường',
  ads: 'Quảng cáo',
  other: 'Khác',
}

function emptyFunnel(): LeadFunnelStats {
  return {
    total: 0,
    byStatus: { new: 0, contacted: 0, test_scheduled: 0, enrolled: 0, lost: 0 },
    bySource: [
      ...LEAD_SOURCES.map((s) => ({ source: s, label: SOURCE_LABELS[s], count: 0 })),
      { source: 'unknown' as const, label: 'Chưa ghi', count: 0 },
    ],
    byCounselor: [],
    overdueFollowUps: 0,
    upcomingAppointments: 0,
    conversionRate: 0,
  }
}

/** Tính funnel trên client từ leads đã tải — tránh gọi getLeads lần 2 */
export function buildFunnelFromLeads(leads: LeadCard[]): LeadFunnelStats {
  const stats = emptyFunnel()
  stats.total = leads.length
  const counselorMap = new Map<string, LeadFunnelStats['byCounselor'][number]>()
  const now = Date.now()
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000

  for (const lead of leads) {
    const status = lead.status as LeadStatus
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1

    if (lead.source) {
      const src = stats.bySource.find((s) => s.source === lead.source)
      if (src) src.count += 1
    } else {
      const unk = stats.bySource.find((s) => s.source === 'unknown')
      if (unk) unk.count += 1
    }

    if (lead.is_overdue) stats.overdueFollowUps += 1
    if (
      lead.appointment_at &&
      new Date(lead.appointment_at).getTime() >= now &&
      new Date(lead.appointment_at).getTime() <= weekAhead
    ) {
      stats.upcomingAppointments += 1
    }

    const key = lead.counselor_id ?? '__none__'
    let row = counselorMap.get(key)
    if (!row) {
      row = {
        counselorId: lead.counselor_id,
        counselorName: lead.counselor_name ?? 'Chưa phân công',
        total: 0,
        enrolled: 0,
        lost: 0,
        inProgress: 0,
        conversionRate: 0,
      }
      counselorMap.set(key, row)
    }
    row.total += 1
    if (lead.status === 'enrolled') row.enrolled += 1
    else if (lead.status === 'lost') row.lost += 1
    else row.inProgress += 1
  }

  const closed = stats.byStatus.enrolled + stats.byStatus.lost
  stats.conversionRate =
    closed > 0 ? Math.round((stats.byStatus.enrolled / closed) * 1000) / 10 : 0
  stats.byCounselor = [...counselorMap.values()]
    .map((r) => ({
      ...r,
      conversionRate: r.total > 0 ? Math.round((r.enrolled / r.total) * 100) : 0,
    }))
    .sort((a, b) => b.enrolled - a.enrolled || b.total - a.total)

  return stats
}
