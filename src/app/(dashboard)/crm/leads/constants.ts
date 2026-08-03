import { LEAD_SOURCES, type LeadSource } from '@/lib/validation/schemas'

/** Nhãn nguồn lead — module thường (KHÔNG 'use server') để client import an toàn. */
export const SOURCE_LABELS: Record<LeadSource, string> = {
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

export { LEAD_SOURCES }
export type { LeadSource }
