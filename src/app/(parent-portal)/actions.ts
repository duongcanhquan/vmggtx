'use server'

import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPassword } from '@/lib/auth/passwordHash'
import { phoneVNSchema, zodFail } from '@/lib/validation/schemas'

// ============================================================
// PARENT PORTAL - Sổ Liên Lạc Điện Tử cho Phụ huynh
//
// XÁC THỰC (OTP demo cố định + cookie HMAC):
//  - SĐT -> profiles(role=student) -> OTP = PARENT_MOCK_OTP (dev: 123456).
//  - Cookie `parent_session` = studentId.HMAC(PARENT_SESSION_SECRET).
//  - Production: bắt buộc PARENT_SESSION_SECRET + PARENT_MOCK_OTP.
//  - Getter dùng Admin Client nhưng lọc cứng theo student_id đã verify.
// ============================================================

const PARENT_COOKIE = 'parent_session'
const DEMO_STUDENT_ID = 'demo'

const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Mã OTP phải gồm đúng 6 chữ số.')

export type ParentStudent = {
  id: string
  full_name: string
  org_name: string
  /** Logo đơn vị học sinh (leo cây org) — hiển thị header sổ liên lạc */
  logo_url?: string | null
}

export type AttendanceSummary = {
  total: number
  present: number
  excused: number
  unexcused: number
  presentRate: number // 0-100
}

export type RecentGrade = {
  id: string
  class_name: string
  assessment_name: string
  score: number
  created_at: string
}

export type WeekSession = {
  id: string
  class_name: string
  room: string | null
  start_time: string
  end_time: string
}

export type ParentNotice = {
  id: string
  kind: 'warning' | 'comment'
  warning_type?: 'attendance' | 'grade'
  title: string
  description: string
  date: string
}

export type ParentGradeReport = {
  class_name: string
  items: { assessment_name: string; score: number; weight: number }[]
  average: number | null
}

// ---------- Mock demo (SĐT demo: 0901234567) ----------

const MOCK_STUDENT: ParentStudent = {
  id: DEMO_STUDENT_ID,
  full_name: 'Nguyễn Văn Toàn',
  org_name: 'Chi nhánh Cầu Giấy',
}

const MOCK_ATTENDANCE: AttendanceSummary = {
  total: 18,
  present: 15,
  excused: 1,
  unexcused: 2,
  presentRate: 83,
}

const MOCK_GRADES: RecentGrade[] = [
  { id: 'g1', class_name: 'Toán 12A1', assessment_name: 'Giữa kỳ', score: 7.5, created_at: new Date(Date.now() - 86400_000).toISOString() },
  { id: 'g2', class_name: 'Ngữ văn 12A2', assessment_name: '15 phút', score: 8, created_at: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 'g3', class_name: 'Toán 12A1', assessment_name: 'Miệng', score: 9, created_at: new Date(Date.now() - 5 * 86400_000).toISOString() },
]

const MOCK_WEEK: WeekSession[] = [
  { id: 's1', class_name: 'Toán 12A1', room: 'P.201', start_time: new Date(Date.now() + 86400_000).toISOString(), end_time: new Date(Date.now() + 86400_000 + 2 * 3600_000).toISOString() },
  { id: 's2', class_name: 'Ngữ văn 12A2', room: 'P.105', start_time: new Date(Date.now() + 3 * 86400_000).toISOString(), end_time: new Date(Date.now() + 3 * 86400_000 + 2 * 3600_000).toISOString() },
]

const MOCK_NOTICES: ParentNotice[] = [
  {
    id: 'n1',
    kind: 'warning',
    warning_type: 'attendance',
    title: 'Thông báo từ nhà trường',
    description: 'Chuyên cần: vắng không phép 2 buổi trong tháng. Kính mong phụ huynh nhắc nhở em.',
    date: new Date(Date.now() - 86400_000).toISOString(),
  },
  {
    id: 'n2',
    kind: 'comment',
    title: 'Nhận xét của giáo viên · Toán 12A1',
    description: 'Hôm nay em làm bài kiểm tra miệng tốt, tích cực phát biểu.',
    date: new Date(Date.now() - 2 * 86400_000).toISOString(),
  },
]

const MOCK_GRADE_REPORT: ParentGradeReport[] = [
  {
    class_name: 'Toán 12A1',
    items: [
      { assessment_name: 'Miệng', score: 9, weight: 1 },
      { assessment_name: 'Giữa kỳ', score: 7.5, weight: 2 },
    ],
    average: 8,
  },
  {
    class_name: 'Ngữ văn 12A2',
    items: [{ assessment_name: '15 phút', score: 8, weight: 1 }],
    average: 8,
  },
]

// ---------- Helpers ----------

/**
 * Secret ký cookie HMAC. PRODUCTION bắt buộc PARENT_SESSION_SECRET
 * (không được fallback về service key / chuỗi cứng — kẻ đọc source sẽ forge cookie).
 * Dev: cho phép service key, cuối cùng mới dùng secret local.
 */
function cookieSecret(): string {
  const dedicated = process.env.PARENT_SESSION_SECRET
  if (dedicated) return dedicated
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Thiếu PARENT_SESSION_SECRET trên môi trường production. Hãy set biến này trên Vercel.'
    )
  }
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    'gdtx-dev-secret'
  )
}

function signStudentId(studentId: string): string {
  const signature = createHmac('sha256', cookieSecret())
    .update(studentId)
    .digest('hex')
  return `${studentId}.${signature}`
}

/** Đọc student_id từ cookie, VERIFY chữ ký HMAC - sai chữ ký coi như chưa login */
function getSessionStudentId(): string | null {
  const raw = cookies().get(PARENT_COOKIE)?.value
  if (!raw) return null

  const separator = raw.lastIndexOf('.')
  if (separator <= 0) return null

  const studentId = raw.slice(0, separator)
  const signature = Buffer.from(raw.slice(separator + 1))
  const expected = Buffer.from(
    createHmac('sha256', cookieSecret()).update(studentId).digest('hex')
  )
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null
  }
  return studentId
}

function admin() {
  return createAdminClient()
}

// ---------- 1. XÁC THỰC ----------

/**
 * Bước 1+2 của luồng login: kiểm tra SĐT tồn tại + OTP mock,
 * thành công thì cấp cookie session HttpOnly.
 */
export async function parentLogin(
  formData: FormData
): Promise<{ error: string } | { error?: undefined; studentName: string }> {
  // ===== QA GATE: SĐT chuẩn VN 10 số + OTP 6 số =====
  const phoneParsed = phoneVNSchema.safeParse(String(formData.get('phone') ?? ''))
  if (!phoneParsed.success) return zodFail(phoneParsed.error)
  const otpParsed = otpSchema.safeParse(String(formData.get('otp') ?? ''))
  if (!otpParsed.success) return zodFail(otpParsed.error)

  const phone = phoneParsed.data
  const otp = otpParsed.data

  // OTP demo: CHỈ chấp nhận đúng mã cấu hình (mặc định 123456) — không còn
  // "6 số bất kỳ". Production bắt buộc set PARENT_MOCK_OTP (hoặc sau này SMS thật).
  const expectedOtp = process.env.PARENT_MOCK_OTP || '123456'
  if (process.env.NODE_ENV === 'production' && !process.env.PARENT_MOCK_OTP) {
    return {
      error: 'Cổng phụ huynh chưa cấu hình OTP (thiếu PARENT_MOCK_OTP). Liên hệ quản trị.',
    }
  }
  if (otp !== expectedOtp) {
    return { error: 'Mã OTP không đúng. Thử lại hoặc liên hệ nhà trường.' }
  }

  try {
    const supabase = admin()
    const campusOrgIdRaw = String(formData.get('campusOrgId') ?? '').trim()
    const campusOrgId =
      campusOrgIdRaw &&
      /^[0-9a-f-]{36}$/i.test(campusOrgIdRaw)
        ? campusOrgIdRaw
        : null

    const { data: student, error } = await supabase
      .from('profiles')
      .select('id, full_name, org_id')
      .eq('phone', phone)
      .eq('role', 'student')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (error) throw error

    if (!student) {
      // Thông báo đồng nhất — tránh dò SĐT có/không trong hệ thống
      return { error: 'Số điện thoại hoặc mã OTP không hợp lệ.' }
    }

    // Cổng /coso/[slug]/parent/login: học viên phải thuộc cây cơ sở đó
    if (campusOrgId) {
      if (!student.org_id) {
        return { error: 'Số điện thoại hoặc mã OTP không hợp lệ.' }
      }
      const { data: subtree, error: subErr } = await supabase.rpc(
        'get_descendant_org_ids',
        { p_org_id: campusOrgId }
      )
      if (subErr) throw subErr
      const ids = (subtree ?? []).map((row: { id?: string } | string) =>
        typeof row === 'string' ? row : (row.id as string)
      )
      const allowed = ids.length > 0 ? ids : [campusOrgId]
      if (!allowed.includes(student.org_id)) {
        return {
          error:
            'Số điện thoại này không thuộc cơ sở bạn đang truy cập. Kiểm tra lại đường dẫn /coso/… hoặc liên hệ nhà trường.',
        }
      }
    }

    setParentCookie(student.id)
    return { studentName: student.full_name }
  } catch (error) {
    // Dev: DB chưa sẵn sàng -> cho phép SĐT demo. Production: báo lỗi thật.
    if (process.env.NODE_ENV !== 'production' && phone === '0901234567') {
      setParentCookie(DEMO_STUDENT_ID)
      return { studentName: MOCK_STUDENT.full_name }
    }
    const message =
      error instanceof Error && /PARENT_SESSION_SECRET/.test(error.message)
        ? error.message
        : 'Không kết nối được hệ thống. Vui lòng thử lại sau.'
    return { error: message }
  }
}

/**
 * Đăng nhập phụ huynh bằng email + mật khẩu (bảng parent_accounts).
 * Thành công → cookie parent_session gắn student_id.
 */
export async function parentLoginWithPassword(
  formData: FormData
): Promise<{ error: string } | { error?: undefined; studentName: string }> {
  const emailParsed = z
    .string()
    .trim()
    .email('Email không hợp lệ.')
    .safeParse(String(formData.get('email') ?? ''))
  if (!emailParsed.success) return zodFail(emailParsed.error)

  const password = String(formData.get('password') ?? '')
  if (password.length < 6) {
    return { error: 'Mật khẩu tối thiểu 6 ký tự.' }
  }

  const campusOrgIdRaw = String(formData.get('campusOrgId') ?? '').trim()
  const campusOrgId =
    campusOrgIdRaw && /^[0-9a-f-]{36}$/i.test(campusOrgIdRaw) ? campusOrgIdRaw : null

  try {
    const supabase = admin()
    const { data: account, error } = await supabase
      .from('parent_accounts')
      .select('id, student_id, org_id, password_hash, full_name')
      .ilike('email', emailParsed.data)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      if (/parent_accounts|does not exist|42P01/i.test(error.message)) {
        return {
          error:
            'Cổng phụ huynh chưa sẵn sàng (thiếu bảng parent_accounts). Chạy migration 050 trên Supabase.',
        }
      }
      throw error
    }
    if (!account || !verifyPassword(password, account.password_hash)) {
      return { error: 'Email hoặc mật khẩu không đúng.' }
    }

    if (campusOrgId) {
      const { data: subtree, error: subErr } = await supabase.rpc(
        'get_descendant_org_ids',
        { p_org_id: campusOrgId }
      )
      if (subErr) throw subErr
      const ids = (subtree ?? []).map((row: { id?: string } | string) =>
        typeof row === 'string' ? row : (row.id as string)
      )
      const allowed = ids.length > 0 ? ids : [campusOrgId]
      if (!allowed.includes(account.org_id) && account.org_id !== campusOrgId) {
        // Cho phép nếu student.org nằm trong subtree (account.org_id có thể = nhánh)
        const { data: student } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', account.student_id)
          .maybeSingle()
        if (!student?.org_id || !allowed.includes(student.org_id)) {
          return {
            error: 'Tài khoản không thuộc cơ sở bạn đang truy cập.',
          }
        }
      }
    }

    const { data: student } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', account.student_id)
      .maybeSingle()

    setParentCookie(account.student_id)
    return {
      studentName: student?.full_name || account.full_name || 'Học viên',
    }
  } catch (error) {
    const message =
      error instanceof Error && /PARENT_SESSION_SECRET/.test(error.message)
        ? error.message
        : 'Không kết nối được hệ thống. Vui lòng thử lại sau.'
    return { error: message }
  }
}

function setParentCookie(studentId: string) {
  cookies().set(PARENT_COOKIE, signStudentId(studentId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 ngày
  })
}

export async function parentLogout(): Promise<void> {
  cookies().delete(PARENT_COOKIE)
}

/** Học sinh gắn với session hiện tại (null = chưa đăng nhập) */
export async function getParentStudent(): Promise<ParentStudent | null> {
  const studentId = getSessionStudentId()
  if (!studentId) return null
  // Demo cookie chi dung o NODE_ENV!=production (login 0901234567); production khong fake HS.
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') return null
    return MOCK_STUDENT
  }

  try {
    const supabase = admin()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, org_id, organizations(name)')
      .eq('id', studentId)
      .eq('role', 'student')
      .is('deleted_at', null)
      .maybeSingle()
    if (error || !data) throw error ?? new Error('not found')

    const org = data.organizations as { name?: string } | { name?: string }[] | null
    let logo_url: string | null = null
    let cursorId: string | null = data.org_id ?? null
    for (let i = 0; i < 8 && cursorId; i++) {
      const { data: o } = await supabase
        .from('organizations')
        .select('id, parent_id, logo_url, logo_key')
        .eq('id', cursorId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!o) break
      if (o.logo_url) {
        logo_url = o.logo_url
        break
      }
      if (o.logo_key) {
        logo_url = `/api/org-logo/${o.id}`
        break
      }
      cursorId = o.parent_id
    }
    return {
      id: data.id,
      full_name: data.full_name,
      org_name: Array.isArray(org) ? org[0]?.name ?? '—' : org?.name ?? '—',
      logo_url,
    }
  } catch {
    return null
  }
}

// ---------- 2. WIDGET DASHBOARD ----------

/** Chuyên cần: cộng dồn từ view vw_student_attendance_stats */
export async function getAttendanceSummary(): Promise<AttendanceSummary> {
  const studentId = getSessionStudentId()
  if (!studentId) return { total: 0, present: 0, excused: 0, unexcused: 0, presentRate: 0 }
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') {
      return { total: 0, present: 0, excused: 0, unexcused: 0, presentRate: 0 }
    }
    return MOCK_ATTENDANCE
  }

  try {
    const supabase = admin()
    const { data, error } = await supabase
      .from('vw_student_attendance_stats')
      .select('total_sessions, present_count, excused_count, unexcused_count')
      .eq('student_id', studentId)
    if (error) throw error

    const total = (data ?? []).reduce((sum, row) => sum + row.total_sessions, 0)
    const present = (data ?? []).reduce((sum, row) => sum + row.present_count, 0)
    const excused = (data ?? []).reduce((sum, row) => sum + row.excused_count, 0)
    const unexcused = (data ?? []).reduce((sum, row) => sum + row.unexcused_count, 0)
    return {
      total,
      present,
      excused,
      unexcused,
      presentRate: total > 0 ? Math.round((present / total) * 100) : 100,
    }
  } catch (e) {
    console.error('[parent] getAttendanceSummary', e)
    return { total: 0, present: 0, excused: 0, unexcused: 0, presentRate: 0 }
  }
}

/** 3 cột điểm mới nhất */
export async function getRecentGrades(): Promise<RecentGrade[]> {
  const studentId = getSessionStudentId()
  if (!studentId) return []
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') return []
    return MOCK_GRADES
  }

  try {
    const supabase = admin()
    const { data, error } = await supabase
      .from('grades')
      .select('id, score, created_at, assessments!inner(name, classes(name), deleted_at)')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .is('assessments.deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3)
    if (error) throw error

    return (data ?? []).map((row) => {
      const assessment = (Array.isArray(row.assessments)
        ? row.assessments[0]
        : row.assessments) as unknown as {
        name?: string
        classes?: { name?: string } | { name?: string }[] | null
      } | null
      const cls = Array.isArray(assessment?.classes)
        ? assessment?.classes[0]
        : assessment?.classes
      return {
        id: row.id,
        class_name: cls?.name ?? '—',
        assessment_name: assessment?.name ?? 'Bài kiểm tra',
        score: Number(row.score),
        created_at: row.created_at,
      }
    })
  } catch (e) {
    console.error('[parent] getRecentGrades', e)
    return []
  }
}

/** Các buổi học 7 ngày tới (qua enrollments) */
export async function getWeekSessions(): Promise<WeekSession[]> {
  const studentId = getSessionStudentId()
  if (!studentId) return []
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') return []
    return MOCK_WEEK
  }

  try {
    const supabase = admin()
    const { data: enrollments, error: enrollError } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .is('deleted_at', null)
    if (enrollError) throw enrollError

    const classIds = (enrollments ?? []).map((e) => e.class_id)
    if (classIds.length === 0) return []

    const now = new Date()
    const weekLater = new Date(now.getTime() + 7 * 86400_000)

    const { data, error } = await supabase
      .from('class_sessions')
      .select('id, room, start_time, end_time, classes(name)')
      .in('class_id', classIds)
      .gte('start_time', now.toISOString())
      .lt('start_time', weekLater.toISOString())
      .is('deleted_at', null)
      .order('start_time')
    if (error) throw error

    return (data ?? []).map((row) => {
      const cls = row.classes as { name?: string } | { name?: string }[] | null
      return {
        id: row.id,
        class_name: Array.isArray(cls) ? cls[0]?.name ?? '—' : cls?.name ?? '—',
        room: row.room,
        start_time: row.start_time,
        end_time: row.end_time,
      }
    })
  } catch (e) {
    console.error('[parent] getWeekSessions', e)
    return []
  }
}

// ---------- 3. BÁO BÀI & NHẬN XÉT ----------

/**
 * Gộp 2 nguồn:
 *  - student_warnings  -> "Thông báo từ nhà trường"
 *  - grades.note + attendance.note -> "Nhận xét của giáo viên"
 */
export async function getParentNotices(): Promise<ParentNotice[]> {
  const studentId = getSessionStudentId()
  if (!studentId) return []
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') return []
    return MOCK_NOTICES
  }

  try {
    const supabase = admin()
    const notices: ParentNotice[] = []

    // [PERF] 5 truy vấn độc lập chạy SONG SONG thay vì nối tiếp
    const [
      { data: warnings },
      { data: gradeNotes },
      { data: attendanceNotes },
      { data: enrolledClasses },
      { data: studentProfile },
    ] = await Promise.all([
      supabase
        .from('student_warnings')
        .select('id, warning_type, description, created_at, classes(name)')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('grades')
        .select('id, note, created_at, assessments!inner(name, classes(name), deleted_at)')
        .eq('student_id', studentId)
        .not('note', 'is', null)
        .neq('note', '')
        .is('deleted_at', null)
        .is('assessments.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('attendance')
        .select('id, note, created_at, class_sessions(classes(name))')
        .eq('student_id', studentId)
        .not('note', 'is', null)
        .neq('note', '')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', studentId)
        .eq('status', 'active')
        .is('deleted_at', null),
      supabase.from('profiles').select('org_id').eq('id', studentId).maybeSingle(),
    ])

    // Thông báo đẩy đích danh (migration 040): nhắc học phí, đổi lịch…
    {
      const { data: pushNotices } = await supabase
        .from('user_notifications')
        .select('id, type, title, body, created_at')
        .eq('recipient_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20)
      for (const item of pushNotices ?? []) {
        notices.push({
          id: `un-${item.id}`,
          kind: 'warning',
          // Nhắc học phí tô đỏ như cảnh báo chuyên cần để phụ huynh chú ý
          warning_type: item.type === 'tuition_reminder' ? 'attendance' : 'grade',
          title: item.title,
          description: item.body,
          date: item.created_at,
        })
      }
    }

    // Thông báo chung của cơ sở (migration 030) - audience phụ huynh
    if (studentProfile?.org_id) {
      const { data: announcements } = await supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .eq('org_id', studentProfile.org_id)
        .in('audience', ['all', 'parents'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20)
      for (const item of announcements ?? []) {
        notices.push({
          id: `an-${item.id}`,
          kind: 'warning',
          title: `Thông báo chung · ${item.title}`,
          description: item.body,
          date: item.created_at,
        })
      }
    }

    for (const warning of warnings ?? []) {
      const cls = warning.classes as { name?: string } | { name?: string }[] | null
      const className = Array.isArray(cls) ? cls[0]?.name : cls?.name
      notices.push({
        id: `w-${warning.id}`,
        kind: 'warning',
        warning_type: warning.warning_type as 'attendance' | 'grade',
        title: `Thông báo từ nhà trường${className ? ` · ${className}` : ''}`,
        description: warning.description,
        date: warning.created_at,
      })
    }

    for (const grade of gradeNotes ?? []) {
      const assessment = (Array.isArray(grade.assessments)
        ? grade.assessments[0]
        : grade.assessments) as unknown as {
        name?: string
        classes?: { name?: string } | { name?: string }[] | null
      } | null
      const cls = Array.isArray(assessment?.classes)
        ? assessment?.classes[0]
        : assessment?.classes
      notices.push({
        id: `g-${grade.id}`,
        kind: 'comment',
        title: `Nhận xét của giáo viên${cls?.name ? ` · ${cls.name}` : ''}`,
        description: grade.note as string,
        date: grade.created_at,
      })
    }

    // Dặn dò phụ huynh của buổi học (sổ đầu bài 027) — theo các lớp em đang học
    const classIds = (enrolledClasses ?? []).map((row) => row.class_id)

    if (classIds.length > 0) {
      const { data: parentNotes } = await supabase
        .from('class_sessions')
        .select('id, parent_note, start_time, classes(name)')
        .in('class_id', classIds)
        .not('parent_note', 'is', null)
        .neq('parent_note', '')
        .is('deleted_at', null)
        .order('start_time', { ascending: false })
        .limit(20)

      for (const session of parentNotes ?? []) {
        const cls = session.classes as { name?: string } | { name?: string }[] | null
        const className = Array.isArray(cls) ? cls[0]?.name : cls?.name
        notices.push({
          id: `p-${session.id}`,
          kind: 'comment',
          title: `Dặn dò phụ huynh${className ? ` · ${className}` : ''}`,
          description: session.parent_note as string,
          date: session.start_time,
        })
      }

      // Sổ đầu bài điện tử (migration 033): tổng kết buổi học tự động
      // hiển thị cho phụ huynh - nội dung thực dạy, thái độ lớp, nhắc nhở.
      try {
        const { data: diaryRows } = await supabase
          .from('class_sessions')
          .select('id, diary_notes, start_time, classes(name)')
          .in('class_id', classIds)
          .not('diary_notes', 'is', null)
          .is('deleted_at', null)
          .order('start_time', { ascending: false })
          .limit(15)

        const ATTITUDE_LABEL: Record<string, string> = {
          good: 'Tốt',
          fair: 'Khá',
          noisy: 'Ồn ào',
        }
        for (const session of diaryRows ?? []) {
          const diary = session.diary_notes as {
            actual_content?: string
            attitude?: string
            reminders?: string
          } | null
          if (!diary) continue
          const parts: string[] = []
          if (diary.actual_content) parts.push(`Nội dung buổi học: ${diary.actual_content}`)
          if (diary.attitude && ATTITUDE_LABEL[diary.attitude]) {
            parts.push(`Thái độ lớp: ${ATTITUDE_LABEL[diary.attitude]}`)
          }
          if (diary.reminders) parts.push(`Nhắc nhở: ${diary.reminders}`)
          if (parts.length === 0) continue

          const cls = session.classes as { name?: string } | { name?: string }[] | null
          const className = Array.isArray(cls) ? cls[0]?.name : cls?.name
          notices.push({
            id: `d-${session.id}`,
            kind: 'comment',
            title: `Sổ đầu bài${className ? ` · ${className}` : ''}`,
            description: parts.join('\n'),
            date: session.start_time,
          })
        }
      } catch {
        // Cột diary_notes chưa migrate (pre-033) -> bỏ qua êm
      }
    }

    for (const att of attendanceNotes ?? []) {
      const session = (Array.isArray(att.class_sessions)
        ? att.class_sessions[0]
        : att.class_sessions) as unknown as {
        classes?: { name?: string } | { name?: string }[] | null
      } | null
      const cls = Array.isArray(session?.classes) ? session?.classes[0] : session?.classes
      notices.push({
        id: `a-${att.id}`,
        kind: 'comment',
        title: `Nhận xét buổi học${cls?.name ? ` · ${cls.name}` : ''}`,
        description: att.note as string,
        date: att.created_at,
      })
    }

    notices.sort((a, b) => (a.date < b.date ? 1 : -1))
    return notices.length > 0 ? notices : []
  } catch (e) {
    console.error('[parent] getParentNotices', e)
    return []
  }
}

/** Sổ điểm đầy đủ nhóm theo lớp (tab Sổ điểm) */
export async function getParentGradeReport(): Promise<ParentGradeReport[]> {
  const studentId = getSessionStudentId()
  if (!studentId) return []
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') return []
    return MOCK_GRADE_REPORT
  }

  try {
    const supabase = admin()
    const { data, error } = await supabase
      .from('grades')
      .select(
        'score, assessments!inner(name, weight, assessment_types(weight), classes(name), deleted_at)'
      )
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .is('assessments.deleted_at', null)
    if (error) throw error

    const byClass = new Map<string, ParentGradeReport>()
    for (const row of data ?? []) {
      const assessment = (Array.isArray(row.assessments)
        ? row.assessments[0]
        : row.assessments) as unknown as {
        name?: string
        weight?: number | null
        assessment_types?: { weight?: number | null } | { weight?: number | null }[] | null
        classes?: { name?: string } | { name?: string }[] | null
      } | null
      if (!assessment) continue

      const cls = Array.isArray(assessment.classes)
        ? assessment.classes[0]
        : assessment.classes
      const className = cls?.name ?? 'Lớp học'
      const typeRef = Array.isArray(assessment.assessment_types)
        ? assessment.assessment_types[0]
        : assessment.assessment_types
      const weight = Number(typeRef?.weight ?? assessment.weight ?? 1) || 1

      const report =
        byClass.get(className) ?? { class_name: className, items: [], average: null }
      report.items.push({
        assessment_name: assessment.name ?? 'Bài kiểm tra',
        score: Number(row.score),
        weight,
      })
      byClass.set(className, report)
    }

    for (const report of byClass.values()) {
      const weightSum = report.items.reduce((sum, item) => sum + item.weight, 0)
      report.average =
        weightSum > 0
          ? Math.round(
              (report.items.reduce((sum, item) => sum + item.score * item.weight, 0) /
                weightSum) *
                10
            ) / 10
          : null
    }
    return Array.from(byClass.values())
  } catch (e) {
    console.error('[parent] getParentGradeReport', e)
    return []
  }
}

// ============================================================
// HỌC PHÍ (tab Học phí) - phụ huynh xem hóa đơn + công nợ của con
// Admin client nhưng LUÔN lọc cứng theo student_id đã verify HMAC.
// ============================================================

export type ParentInvoice = {
  id: string
  code: string
  amount: number
  paidTotal: number
  status: 'pending' | 'partial' | 'paid' | 'cancelled'
  dueDate: string | null
  note: string | null
  overdue: boolean
}

export type ParentTuition = {
  invoices: ParentInvoice[]
  totalAmount: number
  totalPaid: number
  totalRemaining: number
  overdueRemaining: number
}

const MOCK_TUITION: ParentTuition = {
  invoices: [
    {
      id: 'mt1',
      code: 'HD-DEMO01',
      amount: 4_500_000,
      paidTotal: 4_500_000,
      status: 'paid',
      dueDate: new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10),
      note: 'Học phí khóa Toán 12',
      overdue: false,
    },
    {
      id: 'mt2',
      code: 'HD-DEMO02',
      amount: 4_500_000,
      paidTotal: 2_000_000,
      status: 'partial',
      dueDate: new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10),
      note: 'Học phí khóa Văn 12 - đợt 2',
      overdue: true,
    },
  ],
  totalAmount: 9_000_000,
  totalPaid: 6_500_000,
  totalRemaining: 2_500_000,
  overdueRemaining: 2_500_000,
}

export async function getParentTuition(): Promise<ParentTuition> {
  const emptyTuition: ParentTuition = {
    invoices: [],
    totalAmount: 0,
    totalPaid: 0,
    totalRemaining: 0,
    overdueRemaining: 0,
  }
  const studentId = getSessionStudentId()
  if (!studentId) return emptyTuition
  if (studentId === DEMO_STUDENT_ID) {
    if (process.env.NODE_ENV === 'production') return emptyTuition
    return MOCK_TUITION
  }

  try {
    const supabase = admin()
    const { data, error } = await supabase
      .from('invoices')
      .select('id, amount, status, due_date, note, created_at, payments(amount_paid, deleted_at)')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error

    const now = new Date()
    const invoices: ParentInvoice[] = (data ?? [])
      .filter((row) => row.status !== 'cancelled')
      .map((row) => {
        const payments = ((row.payments ?? []) as {
          amount_paid: number
          deleted_at: string | null
        }[]).filter((p) => p.deleted_at === null)
        const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0)
        const overdue =
          (row.status === 'pending' || row.status === 'partial') &&
          !!row.due_date &&
          new Date(`${row.due_date}T23:59:59`) < now
        return {
          id: row.id,
          code: `HD-${row.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
          amount: Number(row.amount),
          paidTotal,
          status: row.status as ParentInvoice['status'],
          dueDate: row.due_date,
          note: row.note,
          overdue,
        }
      })

    const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0)
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidTotal, 0)
    const overdueRemaining = invoices
      .filter((inv) => inv.overdue)
      .reduce((sum, inv) => sum + (inv.amount - inv.paidTotal), 0)

    return {
      invoices,
      totalAmount,
      totalPaid,
      totalRemaining: totalAmount - totalPaid,
      overdueRemaining,
    }
  } catch {
    return { invoices: [], totalAmount: 0, totalPaid: 0, totalRemaining: 0, overdueRemaining: 0 }
  }
}

export type ParentInsightReport = {
  presentRate: number
  totalSessions: number
  unexcused: number
  avgScore: number | null
  gradeTrend: { label: string; score: number }[]
  attendanceBars: { label: string; present: number; absent: number }[]
  openWarnings: number
}

/** Xu hướng dài hạn cho PH — không MOCK khi lỗi/trống */
export async function getParentInsights(): Promise<{
  data: ParentInsightReport
  loadError?: string | null
}> {
  const empty: ParentInsightReport = {
    presentRate: 100,
    totalSessions: 0,
    unexcused: 0,
    avgScore: null,
    gradeTrend: [],
    attendanceBars: [],
    openWarnings: 0,
  }
  const studentId = getSessionStudentId()
  if (!studentId) return { data: empty, loadError: 'Chưa đăng nhập phụ huynh.' }
  if (studentId === DEMO_STUDENT_ID) {
    return { data: empty, loadError: 'Tai khoan demo — khong co du lieu that.' }
  }

  try {
    const supabase = admin()
    const [statsRes, gradesRes, attendRes, warnRes] = await Promise.all([
      supabase
        .from('vw_student_attendance_stats')
        .select('total_sessions, present_count, unexcused_count')
        .eq('student_id', studentId),
      supabase
        .from('grades')
        .select('score, created_at, assessments!inner(name, deleted_at)')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .is('assessments.deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(12),
      supabase
        .from('attendance')
        .select('status, created_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('student_warnings')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .neq('status', 'resolved')
        .is('deleted_at', null),
    ])

    const total = (statsRes.data ?? []).reduce(
      (s, r) => s + Number(r.total_sessions),
      0
    )
    const present = (statsRes.data ?? []).reduce(
      (s, r) => s + Number(r.present_count),
      0
    )
    const unexcused = (statsRes.data ?? []).reduce(
      (s, r) => s + Number(r.unexcused_count),
      0
    )

    const scores = (gradesRes.data ?? []).map((g) => Number(g.score))
    const avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null

    const gradeTrend = (gradesRes.data ?? []).map((g) => {
      const a = (
        Array.isArray(g.assessments) ? g.assessments[0] : g.assessments
      ) as { name?: string } | null
      return {
        label: (a?.name ?? 'Bài').slice(0, 10),
        score: Number(g.score),
      }
    })

    const dayMap = new Map<string, { present: number; absent: number }>()
    for (const row of [...(attendRes.data ?? [])].reverse()) {
      const key = String(row.created_at).slice(5, 10)
      const bucket = dayMap.get(key) ?? { present: 0, absent: 0 }
      if (row.status === 'present') bucket.present += 1
      if (row.status === 'absent') bucket.absent += 1
      dayMap.set(key, bucket)
    }
    const attendanceBars = [...dayMap.entries()]
      .slice(-8)
      .map(([label, v]) => ({ label, ...v }))

    return {
      data: {
        presentRate: total > 0 ? Math.round((present / total) * 100) : 100,
        totalSessions: total,
        unexcused,
        avgScore,
        gradeTrend,
        attendanceBars,
        openWarnings: warnRes.count ?? 0,
      },
      loadError: null,
    }
  } catch (e) {
    return {
      data: empty,
      loadError: e instanceof Error ? e.message : 'Không tải được xu hướng.',
    }
  }
}
