'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// ĐẶT PHÒNG & THIẾT BỊ (Facility Booking) - migration 033
// - Staff/Teacher xem lịch tuần trạng thái phòng máy/thiết bị.
// - "Đặt trước": server validate chống trùng giờ bằng RPC
//   check_facility_conflict (giống logic chống trùng lịch học),
//   + exclusion constraint tầng DB chặn nốt race condition.
// [ĐA TẦNG] SSR client -> RLS: staff quản trị subtree, GV xem/đặt
// tài sản của org mình, chỉ hủy được booking của chính mình.
// ============================================================

const MEMBER_ROLES = ['super_admin', 'campus_admin', 'academic_staff', 'teacher']
const MANAGER_ROLES = ['super_admin', 'campus_admin', 'academic_staff']

export type FacilityType = 'room' | 'projector' | 'lab_equipment' | 'vehicle'

export type Facility = {
  id: string
  name: string
  type: FacilityType
  isActive: boolean
}

export type FacilityBooking = {
  id: string
  facilityId: string
  facilityName: string
  facilityType: FacilityType
  reservedByName: string
  isMine: boolean
  startTime: string
  endTime: string
  purpose: string | null
  status: 'pending' | 'confirmed' | 'cancelled'
}

export type FacilityBoard = {
  facilities: Facility[]
  bookings: FacilityBooking[]
  canManage: boolean
}

type ActionResult = { error: string } | { error?: undefined }

async function requireMember(): Promise<
  { error: string } | { error?: undefined; userId: string; orgId: string; role: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || !MEMBER_ROLES.includes(profile.role) || !profile.org_id) {
    return { error: 'Chức năng này dành cho Giáo viên / Giáo vụ / Quản lý cơ sở.' }
  }
  return { userId: user.id, orgId: profile.org_id, role: profile.role }
}

/** Tài sản + lịch đặt trong tuần (RLS quyết định phạm vi thấy) */
export async function getFacilityBoard(weekStartISO: string): Promise<
  { error: string } | { error?: undefined; board: FacilityBoard }
> {
  try {
    const weekStart = new Date(weekStartISO)
    if (Number.isNaN(weekStart.getTime())) return { error: 'Tuần không hợp lệ.' }
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const auth = await requireMember()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const [facilitiesResult, bookingsResult] = await Promise.all([
      supabase
        .from('facilities')
        .select('id, name, type, is_active')
        .is('deleted_at', null)
        .order('type')
        .order('name'),
      supabase
        .from('facility_bookings')
        .select(
          'id, facility_id, reserved_by, start_time, end_time, purpose, status, facilities(name, type), profiles(full_name)'
        )
        .in('status', ['pending', 'confirmed'])
        .is('deleted_at', null)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString())
        .order('start_time'),
    ])

    if (facilitiesResult.error) {
      if (/facilities/i.test(facilitiesResult.error.message)) {
        return {
          error: 'Tính năng chưa sẵn sàng: database chưa chạy migration 033_diary_facilities.sql.',
        }
      }
      return { error: facilitiesResult.error.message }
    }

    if (bookingsResult.error) {
      return {
        error: `Không tải lịch đặt: ${bookingsResult.error.message}`,
      }
    }

    const pick = (value: unknown) => (Array.isArray(value) ? value[0] : value)

    return {
      board: {
        canManage: MANAGER_ROLES.includes(auth.role),
        facilities: (facilitiesResult.data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type as FacilityType,
          isActive: row.is_active,
        })),
        bookings: (bookingsResult.data ?? []).map((row) => {
          const facility = pick(row.facilities) as { name?: string; type?: string } | null
          const reserver = pick(row.profiles) as { full_name?: string } | null
          const status =
            row.status === 'pending' || row.status === 'confirmed'
              ? row.status
              : 'confirmed'
          return {
            id: row.id,
            facilityId: row.facility_id,
            facilityName: facility?.name ?? 'Tài sản',
            facilityType: (facility?.type ?? 'room') as FacilityType,
            reservedByName: reserver?.full_name ?? 'Người dùng',
            isMine: row.reserved_by === auth.userId,
            startTime: row.start_time,
            endTime: row.end_time,
            purpose: row.purpose,
            status,
          }
        }),
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/**
 * ĐẶT TRƯỚC tài sản - validate chống trùng giờ 2 lớp:
 * 1. RPC check_facility_conflict (báo lỗi thân thiện)
 * 2. Exclusion constraint tầng DB (chặn race 2 người đặt cùng lúc)
 */
export async function bookFacility(
  facilityId: string,
  startISO: string,
  endISO: string,
  purpose: string
): Promise<ActionResult> {
  if (!facilityId) return { error: 'Vui lòng chọn phòng / thiết bị.' }
  const start = new Date(startISO)
  const end = new Date(endISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Thời gian đặt không hợp lệ.' }
  }
  if (end <= start) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' }
  if (end.getTime() - start.getTime() > 24 * 3600_000) {
    return { error: 'Mỗi lượt đặt tối đa 24 giờ.' }
  }
  if (start.getTime() < Date.now() - 5 * 60_000) {
    return { error: 'Thời gian đặt phải ở tương lai.' }
  }

  try {
    const auth = await requireMember()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()

    // Validate 1: RPC chống trùng (giống check_schedule_conflict của lịch học)
    const { data: hasConflict, error: rpcError } = await supabase.rpc(
      'check_facility_conflict',
      {
        p_facility_id: facilityId,
        p_start_time: start.toISOString(),
        p_end_time: end.toISOString(),
      }
    )
    if (rpcError) {
      if (/check_facility_conflict/i.test(rpcError.message)) {
        return { error: 'Cần chạy migration 033_diary_facilities.sql trước (Supabase SQL Editor).' }
      }
      return { error: `Lỗi kiểm tra trùng giờ: ${rpcError.message}` }
    }
    if (hasConflict === true) {
      return {
        error: 'TRÙNG GIỜ: tài sản này đã có người đặt trong khung giờ đó. Chọn giờ khác hoặc tài sản khác.',
      }
    }

    const status = MANAGER_ROLES.includes(auth.role) ? 'confirmed' : 'pending'

    const { error } = await supabase.from('facility_bookings').insert({
      facility_id: facilityId,
      reserved_by: auth.userId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      purpose: purpose.trim().slice(0, 500) || null,
      status,
    })
    if (error) {
      // Validate 2: exclusion constraint bắt race condition (23P01)
      if (error.code === '23P01' || /excl_facility_booking_overlap/i.test(error.message)) {
        return { error: 'Vừa có người khác đặt trùng khung giờ này — vui lòng chọn giờ khác.' }
      }
      if (/facility_bookings_status_check|pending/i.test(error.message)) {
        return {
          error:
            'Database chưa hỗ trợ duyệt đặt CSVC — chạy migration 074_payment_atomic_facility_pending.sql.',
        }
      }
      return { error: `Không đặt được: ${error.message}` }
    }

    revalidatePath('/staff/facilities')
    revalidatePath('/teacher/facilities')
    revalidatePath('/facilities')
    revalidatePath('/facilities/vehicles')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Duyệt lượt đặt pending → confirmed (giáo vụ / quản lý) */
export async function approveFacilityBooking(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return { error: 'Thiếu mã lượt đặt.' }
  try {
    const auth = await requireMember()
    if (auth.error !== undefined) return { error: auth.error }
    if (!MANAGER_ROLES.includes(auth.role)) {
      return { error: 'Chỉ Giáo vụ / Quản lý cơ sở được duyệt đặt phòng / xe.' }
    }

    const supabase = createClient()
    const { data: booking } = await supabase
      .from('facility_bookings')
      .select('id, facility_id, start_time, end_time, status')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking || booking.status !== 'pending') {
      return { error: 'Lượt đặt không ở trạng thái chờ duyệt.' }
    }

    const { data: hasConflict } = await supabase.rpc('check_facility_conflict', {
      p_facility_id: booking.facility_id,
      p_start_time: booking.start_time,
      p_end_time: booking.end_time,
    })
    if (hasConflict === true) {
      return { error: 'Không duyệt được — khung giờ đã có lịch confirmed khác.' }
    }

    const { error } = await supabase
      .from('facility_bookings')
      .update({ status: 'confirmed' })
      .eq('id', bookingId)
      .eq('status', 'pending')
    if (error) {
      if (error.code === '23P01' || /excl_facility_booking_overlap/i.test(error.message)) {
        return { error: 'Trùng giờ với lượt đã xác nhận khác.' }
      }
      return { error: `Không duyệt được: ${error.message}` }
    }

    revalidatePath('/staff/facilities')
    revalidatePath('/teacher/facilities')
    revalidatePath('/facilities')
    revalidatePath('/facilities/vehicles')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Hủy lượt đặt (RLS: chủ booking hoặc staff subtree) */
export async function cancelFacilityBooking(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return { error: 'Thiếu mã lượt đặt.' }
  try {
    const auth = await requireMember()
    if (auth.error !== undefined) return { error: auth.error }

    const supabase = createClient()
    const { error, count } = await supabase
      .from('facility_bookings')
      .update({ status: 'cancelled' }, { count: 'exact' })
      .eq('id', bookingId)
      .in('status', ['pending', 'confirmed'])
    if (error) return { error: `Không hủy được: ${error.message}` }
    if (count === 0) {
      return { error: 'Lượt đặt không tồn tại, đã hủy, hoặc bạn không có quyền hủy.' }
    }

    revalidatePath('/staff/facilities')
    revalidatePath('/teacher/facilities')
    revalidatePath('/facilities')
    revalidatePath('/facilities/vehicles')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Thêm tài sản mới (chỉ staff/quản lý) */
export async function createFacility(
  name: string,
  type: FacilityType
): Promise<ActionResult> {
  const trimmed = name.trim()
  if (trimmed.length < 2) return { error: 'Tên tài sản cần ít nhất 2 ký tự.' }
  if (!['room', 'projector', 'lab_equipment', 'vehicle'].includes(type)) {
    return { error: 'Loại tài sản không hợp lệ.' }
  }
  try {
    const auth = await requireMember()
    if (auth.error !== undefined) return { error: auth.error }
    if (!MANAGER_ROLES.includes(auth.role)) {
      return { error: 'Chỉ Giáo vụ / Quản lý cơ sở được thêm tài sản.' }
    }

    const supabase = createClient()
    const { error } = await supabase.from('facilities').insert({
      org_id: auth.orgId,
      name: trimmed,
      type,
    })
    if (error) {
      if (/facilities_type_check|check constraint/i.test(error.message)) {
        return {
          error:
            'Database chưa hỗ trợ loại Xe — chạy migration 073_facility_vehicle_type.sql trên SQL Editor.',
        }
      }
      return { error: `Không thêm được tài sản: ${error.message}` }
    }

    revalidatePath('/staff/facilities')
    revalidatePath('/facilities')
    revalidatePath('/facilities/vehicles')
    revalidatePath('/academic/rooms')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}

/** Bật/tắt tài sản (tắt = không đặt được nữa, lịch cũ giữ nguyên) */
export async function toggleFacility(
  facilityId: string,
  isActive: boolean
): Promise<ActionResult> {
  if (!facilityId) return { error: 'Thiếu mã tài sản.' }
  try {
    const auth = await requireMember()
    if (auth.error !== undefined) return { error: auth.error }
    if (!MANAGER_ROLES.includes(auth.role)) {
      return { error: 'Chỉ Giáo vụ / Quản lý cơ sở được thay đổi tài sản.' }
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('facilities')
      .update({ is_active: isActive })
      .eq('id', facilityId)
    if (error) return { error: `Không cập nhật được: ${error.message}` }

    revalidatePath('/staff/facilities')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Lỗi không xác định.' }
  }
}
