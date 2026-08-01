import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// SINH MÃ HỌC VIÊN THEO QUY TẮC CỦA TỪNG CƠ SỞ (migration 028)
//
// 3 quy tắc (org tự chọn trong /settings, tab "Mã học viên"):
//   org_year_seq : {ORG}-{YYYY}-{NNNN}   VD: CS1-2026-0042
//   org_seq      : {ORG}{NNNNN}          VD: CS100042
//   year_org_seq : {YY}{ORG}{NNNN}       VD: 26CS10042
//
// Mã cơ sở lấy từ org_settings.config.org_code; nếu cơ sở chưa
// đặt thì tự suy ra từ chữ cái đầu tên cơ sở (bỏ dấu tiếng Việt).
// ============================================================

import {
  STUDENT_CODE_FORMATS,
  deriveOrgCode,
  type StudentCodeFormat,
} from './studentCodeFormats'

function formatCode(
  format: StudentCodeFormat,
  orgCode: string,
  year: number,
  seq: number
): string {
  switch (format) {
    case 'org_seq':
      return `${orgCode}${String(seq).padStart(5, '0')}`
    case 'year_org_seq':
      return `${String(year).slice(-2)}${orgCode}${String(seq).padStart(4, '0')}`
    case 'org_year_seq':
    default:
      return `${orgCode}-${year}-${String(seq).padStart(4, '0')}`
  }
}

/**
 * Sinh mã học viên KHẢ DỤNG tiếp theo cho org.
 * Trả về null nếu DB chưa chạy migration 028 (caller bỏ qua mã).
 * Dùng ADMIN client để đếm chính xác không vướng RLS.
 */
export async function generateStudentCode(
  admin: SupabaseClient,
  orgId: string
): Promise<string | null> {
  try {
    // Cấu hình hiệu lực (kế thừa) + tên org — song song
    const [configResult, orgResult] = await Promise.all([
      admin.rpc('get_org_effective_config', { p_org_id: orgId }),
      admin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    ])

    const config = (configResult.data ?? {}) as {
      org_code?: string
      student_code_format?: string
    }
    const orgCode =
      (config.org_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '') ||
      deriveOrgCode(orgResult.data?.name ?? '')
    const format: StudentCodeFormat = STUDENT_CODE_FORMATS.some(
      (f) => f.id === config.student_code_format
    )
      ? (config.student_code_format as StudentCodeFormat)
      : 'org_year_seq'

    // Năm theo giờ VN
    const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear()

    // Số thứ tự khởi điểm = số học viên hiện có của org + 1
    const { count, error: countError } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'student')
    if (countError) return null // cột/bảng lỗi -> bỏ qua mã

    let seq = (count ?? 0) + 1
    // Dò tối đa 30 mã: tránh trùng khi có mã cấp tay / học viên đã xóa
    for (let attempt = 0; attempt < 30; attempt++, seq++) {
      const candidate = formatCode(format, orgCode, year, seq)
      const { data: existing, error } = await admin
        .from('profiles')
        .select('id')
        .eq('org_id', orgId)
        .eq('student_code', candidate)
        .limit(1)
      if (error) return null // cột student_code chưa có (chưa chạy 028)
      if (!existing || existing.length === 0) return candidate
    }
    return null
  } catch {
    return null
  }
}
