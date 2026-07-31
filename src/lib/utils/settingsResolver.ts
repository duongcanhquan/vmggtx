import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================
// SETTINGS RESOLVER - Bộ phân giải cài đặt kế thừa TỪ TRÊN XUỐNG:
//
//   B1. user_settings của userId (nếu truyền)      -> source 'user'
//   B2. org_settings của currentOrgId              -> source 'org'
//   B3. Leo parent_id: Cơ sở -> Cụm -> HQ          -> source 'inherited'
//   B4. Không đâu có -> default trong code         -> source 'default'
//
// KHÔNG hardcode cấu hình ở nơi sử dụng: mọi chỗ cần config đều
// gọi resolveSetting - đổi giá trị ở HQ là "tràn" xuống toàn bộ
// cơ sở con chưa tự ghi đè.
//
// BẢO MẬT:
// - 'server-only': import nhầm vào Client Component là vỡ build
//   (openai_api_key không bao giờ lọt xuống browser).
// - Dùng ADMIN client vì RLS của org_settings cố tình KHÔNG cho
//   user thường đọc cấu hình của org tổ tiên. Resolver chỉ chạy
//   trong Server Action / API route.
// ============================================================

/**
 * B4 - Giá trị mặc định trong code (đáy của chuỗi kế thừa).
 * Kiểu của default cũng là "khuôn" kiểm tra dữ liệu DB: giá trị
 * trong jsonb sai kiểu sẽ bị bỏ qua và tiếp tục leo lên cấp trên.
 */
export const SETTING_DEFAULTS = {
  /** API key OpenAI dùng chung - rỗng nghĩa là dùng process.env.OPENAI_API_KEY */
  openai_api_key: '',
  /** Cho phép điểm danh trễ bao nhiêu phút */
  allow_late_checkin_minutes: 15,
  /** Mức thuế TNCN mặc định (%) khi hợp đồng không ghi rõ */
  tax_rate_default: 10,
  // Các key đã dùng từ migration 016 - resolver thay thế dần RPC
  auto_attendance_sms: true,
  max_absence_warning: 3,
  grading_locked_days: 7,
  require_manager_approval_for_refunds: true,
} as const satisfies Record<string, string | number | boolean>

export type SettingKey = keyof typeof SETTING_DEFAULTS
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K]

export type ResolvedSetting<K extends SettingKey> = {
  value: SettingValue<K>
  /** Cấp nào quyết định giá trị này */
  source: 'user' | 'org' | 'inherited' | 'default'
  /** org sở hữu giá trị (null khi source = 'user' | 'default') */
  sourceOrgId: string | null
}

/** Chống vòng lặp nếu cây tổ chức bị hỏng (parent trỏ ngược xuống con) */
const MAX_TREE_DEPTH = 10

/** Giá trị jsonb chỉ được nhận khi ĐÚNG KIỂU với default của key */
function pickTyped<K extends SettingKey>(
  key: K,
  config: unknown
): SettingValue<K> | undefined {
  if (!config || typeof config !== 'object') return undefined
  const value = (config as Record<string, unknown>)[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== typeof SETTING_DEFAULTS[key]) return undefined
  return value as SettingValue<K>
}

function defaultFor<K extends SettingKey>(key: K): ResolvedSetting<K> {
  // openai_api_key có fallback đặc biệt: biến môi trường
  const value =
    key === 'openai_api_key'
      ? ((process.env.OPENAI_API_KEY ?? '') as SettingValue<K>)
      : SETTING_DEFAULTS[key]
  return { value, source: 'default', sourceOrgId: null }
}

/**
 * Phân giải 1 cài đặt theo chuỗi kế thừa Cá nhân -> Cơ sở -> ... -> HQ -> default.
 * KHÔNG BAO GIỜ ném exception: mọi lỗi DB đều rơi về default để
 * tính năng phụ thuộc config không kéo sập nghiệp vụ chính.
 */
export async function resolveSetting<K extends SettingKey>(
  settingKey: K,
  currentOrgId: string | null,
  userId?: string
): Promise<ResolvedSetting<K>> {
  try {
    const admin = createAdminClient()

    // ===== B1: Cài đặt CÁ NHÂN =====
    if (userId) {
      const { data: userRow } = await admin
        .from('user_settings')
        .select('config')
        .eq('user_id', userId)
        .maybeSingle()
      const userValue = pickTyped(settingKey, userRow?.config)
      if (userValue !== undefined) {
        return { value: userValue, source: 'user', sourceOrgId: null }
      }
    }

    // ===== B2 + B3: org hiện tại rồi leo dần lên HQ =====
    let cursorOrgId: string | null = currentOrgId
    for (let depth = 0; depth < MAX_TREE_DEPTH && cursorOrgId; depth++) {
      const { data: orgRow } = await admin
        .from('org_settings')
        .select('config')
        .eq('org_id', cursorOrgId)
        .maybeSingle()
      const orgValue = pickTyped(settingKey, orgRow?.config)
      if (orgValue !== undefined) {
        return {
          value: orgValue,
          source: cursorOrgId === currentOrgId ? 'org' : 'inherited',
          sourceOrgId: cursorOrgId,
        }
      }

      const orgResult = await admin
        .from('organizations')
        .select('parent_id')
        .eq('id', cursorOrgId)
        .is('deleted_at', null)
        .maybeSingle()
      const org = orgResult.data as { parent_id: string | null } | null
      if (!org) break
      cursorOrgId = org.parent_id // HQ có parent_id = null -> thoát vòng lặp
    }

    // ===== B4: default trong code =====
    return defaultFor(settingKey)
  } catch {
    // Thiếu SUPABASE_SERVICE_ROLE_KEY / DB sập -> vẫn có giá trị dùng được
    return defaultFor(settingKey)
  }
}

/** Phân giải nhiều key cùng lúc (chạy song song) */
export async function resolveSettings<K extends SettingKey>(
  settingKeys: readonly K[],
  currentOrgId: string | null,
  userId?: string
): Promise<{ [Key in K]: ResolvedSetting<Key> }> {
  const entries = await Promise.all(
    settingKeys.map(async (key) => [key, await resolveSetting(key, currentOrgId, userId)])
  )
  return Object.fromEntries(entries) as { [Key in K]: ResolvedSetting<Key> }
}
