'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAuthorizedRpc } from '@/lib/auth/isAuthorizedRpc'
import { getDescendantOrgIds } from '@/lib/utils/orgScope'
import { z } from 'zod'
import { zodFail } from '@/lib/validation/schemas'

// ============================================================
// Quản lý Phòng học (/academic/rooms) — phục vụ xếp TKB
// facilities (033) + meta 070 (capacity/code/location/room_kind)
// ============================================================

export type FacilityAssetType = 'room' | 'projector' | 'lab_equipment' | 'vehicle'
export type RoomKind = 'classroom' | 'lab' | 'meeting' | 'hall' | 'other'

export type RoomRow = {
  id: string
  orgId: string
  orgName: string
  name: string
  code: string | null
  type: FacilityAssetType
  roomKind: RoomKind | null
  capacity: number | null
  location: string | null
  isActive: boolean
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid('Chưa chọn cơ sở.'),
  name: z.string().trim().min(2, 'Tên tối thiểu 2 ký tự.').max(120),
  code: z.string().trim().max(40).optional().or(z.literal('')),
  type: z.enum(['room', 'projector', 'lab_equipment', 'vehicle']),
  roomKind: z
    .enum(['classroom', 'lab', 'meeting', 'hall', 'other'])
    .optional()
    .nullable(),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  isActive: z.boolean().optional(),
})

async function requireRoomsAccess(orgId: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' as const }

  const auth = await isAuthorizedRpc(supabase, {
    p_user_id: user.id,
    p_target_org_id: orgId,
    p_required_role: 'academic_staff',
    p_menu_key: 'facilities',
  })
  if (auth.error || auth.data !== true) {
    return { error: 'TỪ CHỐI: Bạn không có quyền quản lý CSVC trên cơ sở này.' as const }
  }

  const orgIds = await getDescendantOrgIds(supabase, orgId)
  const scope = orgIds.includes(orgId) ? orgIds : [orgId, ...orgIds]
  return { supabase, userId: user.id, orgIds: scope }
}

function mapRow(row: Record<string, unknown>): RoomRow {
  const org = row.organizations as { name?: string } | { name?: string }[] | null
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    orgName: orgName || '—',
    name: String(row.name),
    code: (row.code as string | null) ?? null,
    type: (row.type as FacilityAssetType) || 'room',
    roomKind: (row.room_kind as RoomKind | null) ?? null,
    capacity: row.capacity != null ? Number(row.capacity) : null,
    location: (row.location as string | null) ?? null,
    isActive: Boolean(row.is_active),
  }
}

export async function listRooms(
  orgId: string | null
): Promise<{ data: RoomRow[]; error?: string }> {
  if (!orgId) return { data: [], error: 'Chưa chọn cơ sở.' }
  try {
    const scope = await requireRoomsAccess(orgId)
    if ('error' in scope) return { data: [], error: scope.error }

    let query = scope.supabase
      .from('facilities')
      .select(
        'id, org_id, name, type, is_active, capacity, code, location, room_kind, organizations(name)'
      )
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)
      .order('type')
      .order('name')
      .limit(400)

    const { data, error } = await query
    if (error) {
      // Migration 070 chưa chạy → fallback cột cũ
      if (/capacity|code|location|room_kind|42703/i.test(error.message)) {
        const legacy = await scope.supabase
          .from('facilities')
          .select('id, org_id, name, type, is_active, organizations(name)')
          .in('org_id', scope.orgIds)
          .is('deleted_at', null)
          .order('type')
          .order('name')
          .limit(400)
        if (legacy.error) return { data: [], error: legacy.error.message }
        return {
          data: (legacy.data ?? []).map((r) =>
            mapRow({
              ...r,
              capacity: null,
              code: null,
              location: null,
              room_kind: r.type === 'room' ? 'classroom' : null,
            })
          ),
          error:
            'Migration 070 chưa chạy — đang hiển thị thiếu sức chứa/mã phòng. Hãy chạy 070 trên Supabase.',
        }
      }
      return { data: [], error: error.message }
    }
    return { data: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : 'Không tải được danh sách phòng.',
    }
  }
}

export async function upsertRoom(
  input: z.input<typeof upsertSchema>
): Promise<{ error?: string; id?: string }> {
  const parsed = upsertSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const values = parsed.data
  try {
    const scope = await requireRoomsAccess(values.orgId)
    if ('error' in scope) return { error: scope.error }
    if (!scope.orgIds.includes(values.orgId)) {
      return { error: 'TỪ CHỐI: Cơ sở nằm ngoài phạm vi của bạn.' }
    }

    const payload: Record<string, unknown> = {
      org_id: values.orgId,
      name: values.name,
      type: values.type,
      code: values.code?.trim() || null,
      location: values.location?.trim() || null,
      capacity: values.capacity ?? null,
      room_kind:
        values.type === 'room'
          ? values.roomKind || 'classroom'
          : null,
      is_active: values.isActive ?? true,
    }

    if (values.id) {
      const { error } = await scope.supabase
        .from('facilities')
        .update(payload)
        .eq('id', values.id)
        .in('org_id', scope.orgIds)
        .is('deleted_at', null)
      if (error) {
        if (/capacity|code|location|room_kind|42703/i.test(error.message)) {
          const slim = {
            org_id: payload.org_id,
            name: payload.name,
            type: payload.type,
            is_active: payload.is_active,
          }
          const retry = await scope.supabase
            .from('facilities')
            .update(slim)
            .eq('id', values.id)
            .in('org_id', scope.orgIds)
            .is('deleted_at', null)
          if (retry.error) return { error: retry.error.message }
          revalidatePath('/academic/rooms')
          revalidatePath('/academic/schedule')
          return {
            id: values.id,
            error: 'Đã lưu tên/loại. Chạy migration 070 để lưu sức chứa & mã phòng.',
          }
        }
        return { error: error.message }
      }
      revalidatePath('/academic/rooms')
      revalidatePath('/academic/schedule')
      return { id: values.id }
    }

    const { data, error } = await scope.supabase
      .from('facilities')
      .insert(payload)
      .select('id')
      .single()
    if (error) {
      if (/capacity|code|location|room_kind|42703/i.test(error.message)) {
        const slim = {
          org_id: payload.org_id,
          name: payload.name,
          type: payload.type,
          is_active: payload.is_active,
        }
        const retry = await scope.supabase
          .from('facilities')
          .insert(slim)
          .select('id')
          .single()
        if (retry.error) return { error: retry.error.message }
        revalidatePath('/academic/rooms')
        revalidatePath('/academic/schedule')
        return {
          id: retry.data.id,
          error: 'Đã tạo phòng cơ bản. Chạy migration 070 để lưu sức chứa & mã phòng.',
        }
      }
      return { error: error.message }
    }

    revalidatePath('/academic/rooms')
    revalidatePath('/academic/schedule')
    return { id: data.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không lưu được phòng học.' }
  }
}

export async function softDeleteRoom(
  orgId: string,
  roomId: string
): Promise<{ error?: string }> {
  if (!orgId || !roomId) return { error: 'Thiếu thông tin.' }
  try {
    const scope = await requireRoomsAccess(orgId)
    if ('error' in scope) return { error: scope.error }

    const { error } = await scope.supabase
      .from('facilities')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', roomId)
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)

    if (error) return { error: error.message }
    revalidatePath('/academic/rooms')
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không xóa được phòng.' }
  }
}

export async function toggleRoomActive(
  orgId: string,
  roomId: string,
  isActive: boolean
): Promise<{ error?: string }> {
  if (!orgId || !roomId) return { error: 'Thiếu thông tin.' }
  try {
    const scope = await requireRoomsAccess(orgId)
    if ('error' in scope) return { error: scope.error }

    const { error } = await scope.supabase
      .from('facilities')
      .update({ is_active: isActive })
      .eq('id', roomId)
      .in('org_id', scope.orgIds)
      .is('deleted_at', null)

    if (error) return { error: error.message }
    revalidatePath('/academic/rooms')
    revalidatePath('/academic/schedule')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Không cập nhật được trạng thái.' }
  }
}
