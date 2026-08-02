'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { assetSchema, requiredId, zodFail, ASSET_STATUSES } from '@/lib/validation/schemas'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'

// ============================================================
// QUẢN LÝ TÀI SẢN & KHẤU HAO (/assets - migration 041)
//
// - Sổ tài sản theo TỪNG đơn vị (org_id) + vị trí cụ thể (phòng/lớp).
// - Khấu hao ĐƯỜNG THẲNG tính động server-side mỗi lần đọc:
//   không lưu cứng nên số liệu luôn đúng theo ngày hiện tại.
// - Mọi mutation gác cổng is_authorized trên org CỦA TÀI SẢN
//   (RLS chặn thêm lần 2) + ghi asset_logs để kiểm toán.
// ============================================================

export type AssetStatus = (typeof ASSET_STATUSES)[number]

export type AssetRow = {
  id: string
  code: string
  name: string
  category: string
  serial_number: string | null
  vendor: string | null
  location: string | null
  org_id: string
  org_name: string
  purchase_date: string
  purchase_price: number
  salvage_value: number
  useful_life_months: number
  warranty_until: string | null
  status: AssetStatus
  note: string | null
  // ----- Khấu hao (tính động) -----
  /** Số tháng đã đưa vào sử dụng (tối đa = useful_life_months) */
  months_used: number
  /** Mức hao mòn mỗi tháng */
  monthly_depreciation: number
  /** Hao mòn lũy kế đến hôm nay */
  accumulated_depreciation: number
  /** Giá trị còn lại trên sổ */
  book_value: number
  /** % đã khấu hao (0-100) */
  depreciation_percent: number
  /** Đã khấu hao hết */
  fully_depreciated: boolean
  /** Bảo hành hết hạn trong 30 ngày tới (hoặc đã hết) */
  warranty_expiring: boolean
}

export type AssetLogRow = {
  id: string
  action: string
  detail: string
  from_value: string | null
  to_value: string | null
  actor_name: string
  created_at: string
}

export type AssetActionResult = { error: string } | { error?: undefined }

// ---------- Khấu hao đường thẳng ----------
function monthsBetween(fromDateISO: string, to: Date): number {
  const from = new Date(`${fromDateISO}T00:00:00`)
  if (Number.isNaN(from.getTime())) return 0
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(0, months)
}

function computeDepreciation(input: {
  purchase_date: string
  purchase_price: number
  salvage_value: number
  useful_life_months: number
}): Pick<
  AssetRow,
  | 'months_used'
  | 'monthly_depreciation'
  | 'accumulated_depreciation'
  | 'book_value'
  | 'depreciation_percent'
  | 'fully_depreciated'
> {
  const price = Number(input.purchase_price)
  const salvage = Number(input.salvage_value)
  const life = Math.max(1, input.useful_life_months)
  const elapsed = monthsBetween(input.purchase_date, new Date())
  const monthsUsed = Math.min(elapsed, life)
  const monthly = (price - salvage) / life
  const accumulated = Math.round(monthsUsed * monthly)
  const bookValue = Math.max(salvage, Math.round(price - accumulated))
  const percent =
    price - salvage <= 0 ? 100 : Math.min(100, Math.round((accumulated / (price - salvage)) * 100))
  return {
    months_used: monthsUsed,
    monthly_depreciation: Math.round(monthly),
    accumulated_depreciation: accumulated,
    book_value: bookValue,
    depreciation_percent: percent,
    fully_depreciated: elapsed >= life,
  }
}

function isWarrantyExpiring(warrantyUntil: string | null): boolean {
  if (!warrantyUntil) return false
  const limit = new Date()
  limit.setDate(limit.getDate() + 30)
  return new Date(`${warrantyUntil}T23:59:59`) <= limit
}

// ---------- MOCK cho chế độ demo ----------
function isoMonthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

const MOCK_BASE = [
  {
    id: 'mock-a1',
    code: 'TS-2024-0001',
    name: 'Máy chiếu Epson EB-X51',
    category: 'teaching_device',
    serial_number: 'EPX51-88121',
    vendor: 'Công ty TNHH Thiết bị Giáo dục ABC',
    location: 'Phòng P.201',
    org_id: 'org-cn-caugiay',
    org_name: 'Chi nhánh Cầu Giấy',
    purchase_date: isoMonthsAgo(20),
    purchase_price: 14_500_000,
    salvage_value: 500_000,
    useful_life_months: 36,
    warranty_until: isoMonthsAgo(-4),
    status: 'in_use' as AssetStatus,
    note: null,
  },
  {
    id: 'mock-a2',
    code: 'TS-2023-0002',
    name: 'Bộ 20 bàn ghế học sinh',
    category: 'furniture',
    serial_number: null,
    vendor: 'Nội thất Hòa Phát',
    location: 'Phòng P.105',
    org_id: 'org-cn-dongda',
    org_name: 'Chi nhánh Đống Đa',
    purchase_date: isoMonthsAgo(30),
    purchase_price: 36_000_000,
    salvage_value: 2_000_000,
    useful_life_months: 60,
    warranty_until: null,
    status: 'in_use' as AssetStatus,
    note: null,
  },
  {
    id: 'mock-a3',
    code: 'TS-2021-0003',
    name: 'Máy tính Dell OptiPlex (phòng máy)',
    category: 'it_equipment',
    serial_number: 'DOP-7080-45',
    vendor: 'FPT Shop',
    location: 'Phòng máy 2',
    org_id: 'org-cs-hn1',
    org_name: 'Cơ sở Hà Nội 1',
    purchase_date: isoMonthsAgo(50),
    purchase_price: 18_900_000,
    salvage_value: 0,
    useful_life_months: 48,
    warranty_until: isoMonthsAgo(14),
    status: 'under_repair' as AssetStatus,
    note: 'Lỗi nguồn - đang chờ linh kiện',
  },
]

function buildMockAssets(): AssetRow[] {
  return MOCK_BASE.map((asset) => ({
    ...asset,
    ...computeDepreciation(asset),
    warranty_expiring: isWarrantyExpiring(asset.warranty_until),
  }))
}

// ---------- Gác cổng quyền ----------
async function requireAssetScope(
  targetOrgId: string,
  requiredRole: 'academic_staff' | 'campus_admin' = 'academic_staff'
): Promise<{ error: string } | { error?: undefined; userId: string }> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: authorized, error } = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: targetOrgId,
    p_required_role: requiredRole,
    // Kiêm nhiệm (049): grant 'assets' mở tối đa mức Giáo vụ
    p_menu_key: 'assets',
  })
  if (error) return { error: `Lỗi kiểm tra phân quyền: ${error.message}` }
  if (authorized !== true) {
    return { error: 'TỪ CHỐI: Bạn không có quyền quản lý tài sản của đơn vị này.' }
  }
  return { userId: user.id }
}

async function writeAssetLog(row: {
  asset_id: string
  org_id: string
  action: 'created' | 'updated' | 'status_change' | 'transfer' | 'maintenance' | 'deleted'
  detail: string
  from_value?: string | null
  to_value?: string | null
  created_by: string
}): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from('asset_logs').insert(row)
  } catch {
    /* nhật ký lỗi không chặn nghiệp vụ chính */
  }
}

// ---------- Đọc dữ liệu ----------

/** Danh sách đơn vị trong subtree - dùng cho form tạo/điều chuyển tài sản */
export async function getAssetOrgs(
  orgId: string
): Promise<{ id: string; name: string }[]> {
  try {
    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, orgId)
    const { data } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds])
      .is('deleted_at', null)
      .order('name')
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }))
  } catch {
    return []
  }
}

/**
 * Sổ tài sản của org đang chọn + toàn bộ chi nhánh con, kèm số liệu
 * khấu hao tính đến HÔM NAY. Fallback demo khi DB trống/chưa đăng nhập.
 */
export async function getAssets(
  orgId: string | null
): Promise<{ data: AssetRow[]; demo: boolean }> {
  // [QA-FIX C] Empty/error = [] — không fake tài sản khi org trống
  if (!orgId) return { data: [], demo: false }

  try {
    const supabase = createClient()
    const orgIds = await getDescendantOrgIds(supabase, orgId)

    const { data, error } = await supabase
      .from('assets')
      .select(
        'id, code, name, category, serial_number, vendor, location, org_id, purchase_date, purchase_price, salvage_value, useful_life_months, warranty_until, status, note, organizations(name)'
      )
      .in('org_id', orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) {
      console.error('[QA-FIX C] getAssets:', error.message)
      return { data: [], demo: false }
    }
    if (!data || data.length === 0) return { data: [], demo: false }

    const rows: AssetRow[] = data.map((row) => {
      const org = row.organizations as { name: string } | { name: string }[] | null
      const base = {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        serial_number: row.serial_number,
        vendor: row.vendor,
        location: row.location,
        org_id: row.org_id,
        org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
        purchase_date: row.purchase_date,
        purchase_price: Number(row.purchase_price),
        salvage_value: Number(row.salvage_value),
        useful_life_months: row.useful_life_months,
        warranty_until: row.warranty_until,
        status: row.status as AssetStatus,
        note: row.note,
      }
      return {
        ...base,
        ...computeDepreciation(base),
        warranty_expiring: isWarrantyExpiring(base.warranty_until),
      }
    })
    return { data: rows, demo: false }
  } catch {
    console.error('[QA-FIX C] getAssets exception')
    return { data: [], demo: false }
  }
}

/** Nhật ký của 1 tài sản (mới nhất trước) */
export async function getAssetLogs(assetId: string): Promise<AssetLogRow[]> {
  if (!assetId || assetId.startsWith('mock-')) return []
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('asset_logs')
      .select('id, action, detail, from_value, to_value, created_at, profiles(full_name)')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(50)
    return (data ?? []).map((row) => {
      const actor = row.profiles as { full_name: string } | { full_name: string }[] | null
      return {
        id: row.id,
        action: row.action,
        detail: row.detail,
        from_value: row.from_value,
        to_value: row.to_value,
        actor_name: Array.isArray(actor)
          ? actor[0]?.full_name ?? 'Hệ thống'
          : actor?.full_name ?? 'Hệ thống',
        created_at: row.created_at,
      }
    })
  } catch {
    return []
  }
}

// ---------- Mutations ----------

function generateAssetCode(): string {
  const year = new Date().getFullYear()
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `TS-${year}-${rand}`
}

/** Thêm tài sản mới vào sổ + log 'created' */
export async function createAsset(formData: FormData): Promise<AssetActionResult> {
  const parsed = assetSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    serialNumber: String(formData.get('serialNumber') ?? ''),
    vendor: String(formData.get('vendor') ?? ''),
    location: String(formData.get('location') ?? ''),
    purchaseDate: String(formData.get('purchaseDate') ?? ''),
    purchasePrice: String(formData.get('purchasePrice') ?? ''),
    salvageValue: String(formData.get('salvageValue') ?? '0'),
    usefulLifeMonths: String(formData.get('usefulLifeMonths') ?? ''),
    warrantyUntil: String(formData.get('warrantyUntil') ?? ''),
    note: String(formData.get('note') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const scope = await requireAssetScope(values.orgId)
    if (scope.error !== undefined) return { error: scope.error }

    const supabase = createClient()
    const code = values.code || generateAssetCode()

    const { data: inserted, error } = await supabase
      .from('assets')
      .insert({
        org_id: values.orgId,
        code,
        name: values.name,
        category: values.category,
        serial_number: values.serialNumber || null,
        vendor: values.vendor || null,
        location: values.location || null,
        purchase_date: values.purchaseDate,
        purchase_price: values.purchasePrice,
        salvage_value: values.salvageValue,
        useful_life_months: values.usefulLifeMonths,
        warranty_until: values.warrantyUntil || null,
        note: values.note || null,
        created_by: scope.userId,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      if (/uq_assets_org_code|duplicate/i.test(error.message)) {
        return { error: `Mã tài sản "${code}" đã tồn tại trong đơn vị này.` }
      }
      return { error: `Không thêm được tài sản: ${error.message}` }
    }

    if (inserted?.id) {
      await writeAssetLog({
        asset_id: inserted.id,
        org_id: values.orgId,
        action: 'created',
        detail: `Nhập sổ tài sản "${values.name}" (${code}), nguyên giá ${values.purchasePrice.toLocaleString('vi-VN')}đ, khấu hao ${values.usefulLifeMonths} tháng.`,
        created_by: scope.userId,
      })
    }

    revalidatePath('/assets')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }
}

/** Sửa thông tin tài sản (không đổi đơn vị - dùng Điều chuyển) + log 'updated' */
export async function updateAsset(formData: FormData): Promise<AssetActionResult> {
  const idParsed = requiredId('Thiếu ID tài sản.').safeParse(
    String(formData.get('assetId') ?? '')
  )
  if (!idParsed.success) return zodFail(idParsed.error)
  const assetId = idParsed.data

  const parsed = assetSchema.safeParse({
    orgId: String(formData.get('orgId') ?? ''),
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    serialNumber: String(formData.get('serialNumber') ?? ''),
    vendor: String(formData.get('vendor') ?? ''),
    location: String(formData.get('location') ?? ''),
    purchaseDate: String(formData.get('purchaseDate') ?? ''),
    purchasePrice: String(formData.get('purchasePrice') ?? ''),
    salvageValue: String(formData.get('salvageValue') ?? '0'),
    usefulLifeMonths: String(formData.get('usefulLifeMonths') ?? ''),
    warrantyUntil: String(formData.get('warrantyUntil') ?? ''),
    note: String(formData.get('note') ?? ''),
  })
  if (!parsed.success) return zodFail(parsed.error)
  const values = parsed.data

  try {
    const supabase = createClient()
    const { data: asset } = await supabase
      .from('assets')
      .select('id, org_id, name')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!asset) return { error: 'Tài sản không tồn tại hoặc ngoài phạm vi của bạn.' }

    // Quyền xét trên org HIỆN TẠI của tài sản (không tin orgId từ form)
    const scope = await requireAssetScope(asset.org_id)
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await supabase
      .from('assets')
      .update({
        code: values.code || undefined,
        name: values.name,
        category: values.category,
        serial_number: values.serialNumber || null,
        vendor: values.vendor || null,
        location: values.location || null,
        purchase_date: values.purchaseDate,
        purchase_price: values.purchasePrice,
        salvage_value: values.salvageValue,
        useful_life_months: values.usefulLifeMonths,
        warranty_until: values.warrantyUntil || null,
        note: values.note || null,
      })
      .eq('id', assetId)
    if (error) {
      if (/uq_assets_org_code|duplicate/i.test(error.message)) {
        return { error: `Mã tài sản "${values.code}" đã tồn tại trong đơn vị này.` }
      }
      return { error: `Không cập nhật được tài sản: ${error.message}` }
    }

    await writeAssetLog({
      asset_id: assetId,
      org_id: asset.org_id,
      action: 'updated',
      detail: `Cập nhật thông tin tài sản "${values.name}".`,
      created_by: scope.userId,
    })

    revalidatePath('/assets')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }
}

const STATUS_LABELS: Record<AssetStatus, string> = {
  in_use: 'Đang sử dụng',
  in_storage: 'Lưu kho',
  under_repair: 'Đang sửa chữa',
  broken: 'Hỏng',
  liquidated: 'Đã thanh lý',
  lost: 'Thất lạc',
}

/** Đổi tình trạng tài sản (hỏng/sửa chữa/thanh lý...) + log 'status_change' */
export async function changeAssetStatus(
  assetId: string,
  newStatus: AssetStatus,
  note: string
): Promise<AssetActionResult> {
  if (!assetId) return { error: 'Thiếu ID tài sản.' }
  if (!ASSET_STATUSES.includes(newStatus)) return { error: 'Tình trạng không hợp lệ.' }
  if (note.trim().length > 300) return { error: 'Ghi chú tối đa 300 ký tự.' }

  try {
    const supabase = createClient()
    const { data: asset } = await supabase
      .from('assets')
      .select('id, org_id, name, status')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!asset) return { error: 'Tài sản không tồn tại hoặc ngoài phạm vi của bạn.' }
    if (asset.status === newStatus) return { error: 'Tài sản đã ở tình trạng này.' }

    // Thanh lý là bước không đảo ngược -> yêu cầu campus_admin
    const requiredRole = newStatus === 'liquidated' ? 'campus_admin' : 'academic_staff'
    const scope = await requireAssetScope(asset.org_id, requiredRole)
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await supabase
      .from('assets')
      .update({ status: newStatus })
      .eq('id', assetId)
    if (error) return { error: `Không đổi được tình trạng: ${error.message}` }

    await writeAssetLog({
      asset_id: assetId,
      org_id: asset.org_id,
      action: 'status_change',
      detail: note.trim() || `Đổi tình trạng "${asset.name}".`,
      from_value: STATUS_LABELS[asset.status as AssetStatus] ?? asset.status,
      to_value: STATUS_LABELS[newStatus],
      created_by: scope.userId,
    })

    revalidatePath('/assets')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }
}

/**
 * ĐIỀU CHUYỂN tài sản sang đơn vị khác trong subtree + log 'transfer'.
 * Người thao tác phải có quyền trên CẢ đơn vị đi lẫn đơn vị đến.
 */
export async function transferAsset(
  assetId: string,
  toOrgId: string,
  newLocation: string,
  note: string
): Promise<AssetActionResult> {
  if (!assetId) return { error: 'Thiếu ID tài sản.' }
  if (!toOrgId) return { error: 'Vui lòng chọn đơn vị nhận.' }
  if (note.trim().length > 300) return { error: 'Ghi chú tối đa 300 ký tự.' }

  try {
    const supabase = createClient()
    const { data: asset } = await supabase
      .from('assets')
      .select('id, org_id, name, status, organizations(name)')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!asset) return { error: 'Tài sản không tồn tại hoặc ngoài phạm vi của bạn.' }
    if (asset.org_id === toOrgId) return { error: 'Tài sản đã thuộc đơn vị này.' }
    if (asset.status === 'liquidated') {
      return { error: 'Tài sản đã thanh lý - không thể điều chuyển.' }
    }

    const fromScope = await requireAssetScope(asset.org_id)
    if (fromScope.error !== undefined) return { error: fromScope.error }
    const toScope = await requireAssetScope(toOrgId)
    if (toScope.error !== undefined) {
      return { error: 'TỪ CHỐI: Đơn vị nhận không thuộc quyền quản lý của bạn.' }
    }

    const { data: toOrg } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', toOrgId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!toOrg) return { error: 'Đơn vị nhận không tồn tại.' }

    const { error } = await supabase
      .from('assets')
      .update({ org_id: toOrgId, location: newLocation.trim() || null })
      .eq('id', assetId)
    if (error) return { error: `Không điều chuyển được tài sản: ${error.message}` }

    const fromOrg = asset.organizations as { name: string } | { name: string }[] | null
    const fromName = Array.isArray(fromOrg) ? fromOrg[0]?.name ?? '—' : fromOrg?.name ?? '—'
    await writeAssetLog({
      asset_id: assetId,
      org_id: toOrgId,
      action: 'transfer',
      detail:
        note.trim() ||
        `Điều chuyển "${asset.name}"${newLocation.trim() ? ` tới ${newLocation.trim()}` : ''}.`,
      from_value: fromName,
      to_value: toOrg.name,
      created_by: fromScope.userId,
    })

    revalidatePath('/assets')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }
}

/** XÓA MỀM tài sản khỏi sổ (nhập nhầm...) - yêu cầu campus_admin */
export async function deleteAsset(assetId: string): Promise<AssetActionResult> {
  if (!assetId) return { error: 'Thiếu ID tài sản.' }

  try {
    const supabase = createClient()
    const { data: asset } = await supabase
      .from('assets')
      .select('id, org_id, name')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!asset) return { error: 'Tài sản không tồn tại hoặc ngoài phạm vi của bạn.' }

    const scope = await requireAssetScope(asset.org_id, 'campus_admin')
    if (scope.error !== undefined) return { error: scope.error }

    const { error } = await supabase
      .from('assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', assetId)
    if (error) return { error: `Không xóa được tài sản: ${error.message}` }

    await writeAssetLog({
      asset_id: assetId,
      org_id: asset.org_id,
      action: 'deleted',
      detail: `Xóa tài sản "${asset.name}" khỏi sổ (xóa mềm).`,
      created_by: scope.userId,
    })

    revalidatePath('/assets')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định.' }
  }
}
