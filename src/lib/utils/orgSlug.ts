import { z } from 'zod'

/**
 * Sinh slug URL từ tên cơ sở (bỏ dấu tiếng Việt, chỉ a-z0-9-).
 * Dùng cho cổng /coso/[slug].
 */
export function slugifyOrgName(name: string): string {
  const map: Record<string, string> = {
    á: 'a',
    à: 'a',
    ả: 'a',
    ã: 'a',
    ạ: 'a',
    ă: 'a',
    ắ: 'a',
    ằ: 'a',
    ẳ: 'a',
    ẵ: 'a',
    ặ: 'a',
    â: 'a',
    ấ: 'a',
    ầ: 'a',
    ẩ: 'a',
    ẫ: 'a',
    ậ: 'a',
    é: 'e',
    è: 'e',
    ẻ: 'e',
    ẽ: 'e',
    ẹ: 'e',
    ê: 'e',
    ế: 'e',
    ề: 'e',
    ể: 'e',
    ễ: 'e',
    ệ: 'e',
    í: 'i',
    ì: 'i',
    ỉ: 'i',
    ĩ: 'i',
    ị: 'i',
    ó: 'o',
    ò: 'o',
    ỏ: 'o',
    õ: 'o',
    ọ: 'o',
    ô: 'o',
    ố: 'o',
    ồ: 'o',
    ổ: 'o',
    ỗ: 'o',
    ộ: 'o',
    ơ: 'o',
    ớ: 'o',
    ờ: 'o',
    ở: 'o',
    ỡ: 'o',
    ợ: 'o',
    ú: 'u',
    ù: 'u',
    ủ: 'u',
    ũ: 'u',
    ụ: 'u',
    ư: 'u',
    ứ: 'u',
    ừ: 'u',
    ử: 'u',
    ữ: 'u',
    ự: 'u',
    ý: 'y',
    ỳ: 'y',
    ỷ: 'y',
    ỹ: 'y',
    ỵ: 'y',
    đ: 'd',
  }
  const lowered = name.trim().toLowerCase()
  let out = ''
  for (const ch of lowered) {
    out += map[ch] ?? ch
  }
  out = out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  if (out.length > 48) out = out.slice(0, 48).replace(/-+$/g, '')
  return out || 'coso'
}

export const orgSlugSchema = z
  .string({ required_error: 'Vui lòng nhập mã đường dẫn (slug).' })
  .trim()
  .toLowerCase()
  .min(2, 'Slug tối thiểu 2 ký tự.')
  .max(48, 'Slug tối đa 48 ký tự.')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Slug chỉ gồm a-z, 0-9, gạch ngang; không bắt/kết thúc bằng gạch.'
  )

/** Đường dẫn cổng cơ sở */
export function campusPortalPath(slug: string): string {
  return `/coso/${slug}`
}

export function campusLoginPath(
  slug: string,
  portal: 'management' | 'student' | 'parent' = 'management'
): string {
  if (portal === 'student') return `/coso/${slug}/student/login`
  if (portal === 'parent') return `/coso/${slug}/parent/login`
  return `/coso/${slug}/login`
}
