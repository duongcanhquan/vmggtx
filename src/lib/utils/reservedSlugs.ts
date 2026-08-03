/**
 * Slug dành riêng — không được dùng làm mã cơ sở /coso cũ hay /{slug}/login.
 * Khớp các segment tĩnh ở gốc app + khu vực portal.
 */
export const RESERVED_ORG_SLUGS = new Set([
  'login',
  'admin',
  'api',
  'evaluations',
  'gioi-thieu',
  'hdsd',
  'unauthorized',
  'license-expired',
  'student',
  'students',
  'portal',
  'parent',
  'dashboard',
  'teacher',
  'teachers',
  'staff',
  'academic',
  'finance',
  'hr',
  'crm',
  'classes',
  'attendance',
  'announcements',
  'assets',
  'settings',
  'reports',
  'campus-admin',
  'ai',
  'learn',
  'grades',
  'schedule',
  'progress',
  'tuition',
  'assistant',
  'b2b',
  'coso',
  'exams',
  '_next',
  'favicon.ico',
])

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_ORG_SLUGS.has(slug.toLowerCase())
}
