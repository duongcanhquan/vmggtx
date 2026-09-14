/**
 * Alias đường dẫn cổng login (gõ tắt / viết liền) → slug chuẩn trong DB.
 * VD: /vietmy/login → /viet-my/login
 */
export const CAMPUS_SLUG_ALIASES: Record<string, string> = {
  vietmy: 'viet-my',
  'truong-viet-my': 'viet-my',
  thanglong: 'thang-long',
  hanoi: 'ha-noi',
  'ha-noi-vm': 'ha-noi',
  tphcm: 'tp-hcm',
  'tp-ho-chi-minh': 'tp-hcm',
  caugiay: 'cau-giay',
  hadong: 'ha-dong',
}

export function resolveCampusSlugAlias(slug: string): string | null {
  const key = slug.trim().toLowerCase()
  return CAMPUS_SLUG_ALIASES[key] ?? null
}
