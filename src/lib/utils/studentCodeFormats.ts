// ============================================================
// Metadata 3 QUY TẮC MÃ HỌC VIÊN - dùng chung client + server.
// (Logic sinh mã thật nằm ở studentCode.ts - server only.)
// ============================================================

export type StudentCodeFormat = 'org_year_seq' | 'org_seq' | 'year_org_seq'

export const STUDENT_CODE_FORMATS: {
  id: StudentCodeFormat
  label: string
  pattern: string
  example: (orgCode: string, year: number) => string
}[] = [
  {
    id: 'org_year_seq',
    label: 'Mã cơ sở – Năm – Số thứ tự',
    pattern: '{CƠ SỞ}-{NĂM}-{SỐ TT}',
    example: (org, year) => `${org}-${year}-0042`,
  },
  {
    id: 'org_seq',
    label: 'Mã cơ sở + Số thứ tự (gọn)',
    pattern: '{CƠ SỞ}{SỐ TT}',
    example: (org) => `${org}00042`,
  },
  {
    id: 'year_org_seq',
    label: 'Năm + Mã cơ sở + Số thứ tự (theo khóa)',
    pattern: '{NĂM 2 SỐ}{CƠ SỞ}{SỐ TT}',
    example: (org, year) => `${String(year).slice(-2)}${org}0042`,
  },
]

/** Bỏ dấu tiếng Việt + lấy chữ cái đầu mỗi từ (tối đa 4) làm mã cơ sở */
export function deriveOrgCode(orgName: string): string {
  const ascii = orgName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
  const words = ascii.split(/\s+/).filter(Boolean)
  // Ưu tiên giữ số cuối tên (VD: "Cơ sở 1" -> CS1)
  const initials = words
    .map((word) => (/^\d+$/.test(word) ? word : word[0]))
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return initials.slice(0, 4) || 'HV'
}
