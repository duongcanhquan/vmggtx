/**
 * ============================================================
 * GDTX ERP - SEED DATA (chạy một lần để demo/test)
 *
 * Cách chạy:   npm run seed
 * Yêu cầu env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (trong .env)
 *
 * Dùng Supabase Admin Client (service role):
 *  - KHÔNG sửa/tắt bất kỳ policy RLS nào - service role vốn được
 *    phép bypass RLS, dữ liệu sau khi seed vẫn bị RLS cắt đúng
 *    theo từng role khi user đăng nhập.
 *  - Insert theo ĐÚNG THỨ TỰ khóa ngoại:
 *    Organizations -> Auth Users + Profiles -> Subjects -> Classes
 *    -> Enrollments -> Class Sessions -> Attendance
 *    -> Assessments -> Grades -> Class Results
 *
 * Cấu trúc dữ liệu sinh ra:
 *  - 1 HQ -> 2 Cụm (region) -> mỗi cụm 2 Cơ sở (campus) = 4 campus
 *  - Mỗi campus: 1 campus_admin + 2 staff + 1 tư vấn tuyển sinh
 *    + 3 teacher + 10 student. 1 super_admin ở HQ. Tổng 69 tài khoản.
 *  - 5 lớp học phân bổ vào các campus, mỗi lớp 2 buổi/tuần
 *    trong khoảng [hôm nay - 30 ngày, hôm nay + 30 ngày]
 *  - Điểm danh cho buổi ĐÃ DIỄN RA: ~90% có mặt, ~10% vắng
 *  - Điểm số cho 3 bài kiểm tra/lớp (hệ số 0.2/0.3/0.5), thang 0-10
 *  - Lớp cuối cùng được CHỐT SỔ để demo tính năng khóa bảng điểm
 *  - Hạn nhập điểm (grading_deadline): lớp áp chót QUÁ HẠN để demo
 *    hàng đợi "Xét duyệt kết quả" của Khảo thí, các lớp khác còn hạn
 *  - Hợp đồng lương cho 12 GV (trộn biên chế/thỉnh giảng/khoán giờ)
 *    -> chạy được Bảng lương tháng ngay
 *  - Hóa đơn học phí cho mọi học sinh (đã đóng đủ/một phần/quá hạn)
 *    + phiếu thu tương ứng -> trang Doanh thu, Công nợ, Học phí có số
 *  - CRM: ~6 leads/campus đủ các trạng thái + nhật ký chăm sóc
 *  - Ngân hàng đề: 3 đề/campus (bỏ qua nếu chưa chạy migration 024)
 *
 * Script IDEMPOTENT: chạy lại sẽ tự xóa sạch dữ liệu seed cũ
 * (nhận diện qua email đuôi @gdtx-demo.edu.vn và cây org demo).
 * ============================================================
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fakerVI as faker } from '@faker-js/faker'

// ---------- Cấu hình ----------

const SEED_EMAIL_DOMAIN = 'gdtx-demo.edu.vn'
const SEED_PASSWORD = 'Demo@123456' // mật khẩu chung cho MỌI tài khoản demo
const HQ_NAME = 'Tổng Công ty GDTX (Demo)'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
// Nhận cả hệ key cũ (service_role) lẫn hệ key mới (sb_secret_...)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!url || !serviceKey) {
  console.error(
    'Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY trong .env - không thể seed.'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------- Helpers ----------

function assertOk(step: string, error: { message: string } | null) {
  if (error) {
    console.error(`[LỖI] ${step}: ${error.message}`)
    process.exit(1)
  }
}

/** Insert theo lô để tránh payload quá lớn */
async function insertChunked(table: string, rows: Record<string, unknown>[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + chunkSize))
    assertOk(`insert ${table} (lô ${i / chunkSize + 1})`, error)
  }
}

/** SĐT Việt Nam 10 số hợp lệ với zod phoneVNSchema */
function vnPhone(): string {
  return '09' + faker.string.numeric(8)
}

function randomScore(): number {
  // Điểm 4.0 - 10.0, bước 0.25 cho giống điểm thật
  return Math.round((4 + Math.random() * 6) / 0.25) * 0.25
}

// ---------- BƯỚC 0: dọn dữ liệu seed cũ (idempotent) ----------

async function cleanupPreviousSeed() {
  console.log('0) Dọn dữ liệu seed cũ (nếu có)...')

  // 0.1 Tìm cây org demo cũ
  const { data: hq } = await supabase
    .from('organizations')
    .select('id')
    .eq('name', HQ_NAME)
    .maybeSingle()

  if (hq) {
    const { data: orgIds, error } = await supabase.rpc('get_descendant_org_ids', {
      p_org_id: hq.id,
    })
    assertOk('lấy danh sách org demo cũ', error)
    const ids: string[] = (orgIds ?? []).map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : (row.id as string)
    )

    if (ids.length > 0) {
      // Xóa theo THỨ TỰ NGƯỢC khóa ngoại
      // (mở khóa class_results trước để trigger không chặn xóa grades)
      await supabase.from('class_results').update({ lock_status: 'open' }).in('org_id', ids)
      // Gỡ hạn nhập điểm: trigger 023 chặn cả DELETE grades khi quá deadline
      await supabase.from('assessments').update({ grading_deadline: null }).in('org_id', ids)

      // evaluation_tokens KHÔNG có org_id -> xóa qua campaign_id
      {
        const { data: oldCampaigns } = await supabase
          .from('evaluation_campaigns')
          .select('id')
          .in('org_id', ids)
        const campaignIds = (oldCampaigns ?? []).map((c) => c.id)
        if (campaignIds.length > 0) {
          const { error: tokenErr } = await supabase
            .from('evaluation_tokens')
            .delete()
            .in('campaign_id', campaignIds)
          if (tokenErr) console.warn(`   (bỏ qua evaluation_tokens: ${tokenErr.message})`)
        }
      }

      // Bảng TÙY CHỌN (module mở rộng): thiếu bảng thì chỉ cảnh báo
      for (const table of [
        'lms_quiz_attempts',
        'lms_quiz_questions',
        'lms_quizzes',
        'lms_submissions',
        'lms_assignments',
        'lms_lessons',
        'exam_bank',
        'student_ai_chats',
        'evaluation_results',
        'evaluation_campaigns',
        'lead_activities',
        'leads',
        'student_warnings',
        'payrolls',
        'teacher_contracts',
        'rate_modifiers',
        'org_ai_settings',
        'org_custom_fields',
        'org_settings',
        'lesson_materials',
      ]) {
        const { error: delError } = await supabase.from(table).delete().in('org_id', ids)
        if (delError) console.warn(`   (bỏ qua ${table}: ${delError.message})`)
      }

      // Bảng LÕI: lỗi là dừng ngay
      for (const table of [
        'grades',
        'class_results',
        'assessments',
        'attendance',
        'enrollments',
        'class_sessions',
        'classes',
        'payments',
        'invoices',
        'subjects',
        'profiles',
      ]) {
        const { error: delError } = await supabase.from(table).delete().in('org_id', ids)
        if (delError) assertOk(`xóa ${table} cũ`, delError)
      }

      // Xóa org: con trước, cha sau (sắp theo độ sâu path giảm dần)
      const { data: orgRows } = await supabase
        .from('organizations')
        .select('id, path')
        .in('id', ids)
      const sorted = (orgRows ?? []).sort(
        (a, b) => String(b.path).split('.').length - String(a.path).split('.').length
      )
      for (const org of sorted) {
        const { error: delOrgError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', org.id)
        assertOk('xóa organization cũ', delOrgError)
      }
    }
  }

  // 0.2 Xóa auth users demo cũ (email đuôi @gdtx-demo.edu.vn)
  let page = 1
  const toDelete: string[] = []
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    assertOk('liệt kê auth users', error)
    for (const user of data.users) {
      if (user.email?.endsWith(`@${SEED_EMAIL_DOMAIN}`)) toDelete.push(user.id)
    }
    if (data.users.length < 200) break
    page += 1
  }
  for (const id of toDelete) {
    // profiles.id có ON DELETE CASCADE theo auth.users -> profile tự xóa
    const { error } = await supabase.auth.admin.deleteUser(id)
    assertOk('xóa auth user demo cũ', error)
  }
  if (toDelete.length > 0) console.log(`   Đã xóa ${toDelete.length} tài khoản demo cũ.`)
}

// ---------- BƯỚC 1: Organizations (HQ -> Region -> Campus) ----------

type Org = { id: string; name: string }

async function seedOrganizations(): Promise<{ hq: Org; campuses: Org[] }> {
  console.log('1) Tạo cây tổ chức: 1 HQ -> 2 Cụm -> 4 Cơ sở...')

  const { data: hq, error: hqError } = await supabase
    .from('organizations')
    .insert({ name: HQ_NAME, type: 'hq', parent_id: null })
    .select('id, name')
    .single()
  assertOk('tạo HQ', hqError)

  const campuses: Org[] = []
  const regionNames = ['Cụm Miền Bắc (Demo)', 'Cụm Miền Nam (Demo)']
  /** Tên + slug cố định → khớp /coso/cau-giay … trên UI hướng dẫn đăng nhập */
  const campusDefs = [
    [
      { name: 'Cơ sở Hà Nội - Cầu Giấy', slug: 'cau-giay' },
      { name: 'Cơ sở Hà Nội - Hà Đông', slug: 'ha-dong' },
    ],
    [
      { name: 'Cơ sở TP.HCM - Quận 1', slug: 'quan-1' },
      { name: 'Cơ sở TP.HCM - Thủ Đức', slug: 'thu-duc' },
    ],
  ]

  for (let r = 0; r < 2; r++) {
    const { data: region, error: regionError } = await supabase
      .from('organizations')
      .insert({ name: regionNames[r], type: 'region', parent_id: hq!.id })
      .select('id, name')
      .single()
    assertOk('tạo region', regionError)

    for (let c = 0; c < 2; c++) {
      const def = campusDefs[r][c]
      // Có cột slug (045) thì gắn luôn; chưa có migration → insert không slug
      let campus: Org | null = null
      const withSlug = await supabase
        .from('organizations')
        .insert({
          name: def.name,
          type: 'campus',
          parent_id: region!.id,
          slug: def.slug,
        })
        .select('id, name')
        .single()
      if (
        withSlug.error &&
        /slug|42703|PGRST204|does not exist|schema cache/i.test(withSlug.error.message)
      ) {
        const fallback = await supabase
          .from('organizations')
          .insert({ name: def.name, type: 'campus', parent_id: region!.id })
          .select('id, name')
          .single()
        assertOk('tạo campus', fallback.error)
        campus = fallback.data
      } else {
        assertOk('tạo campus', withSlug.error)
        campus = withSlug.data
      }
      campuses.push(campus!)
    }
  }

  return { hq: hq!, campuses }
}

// ---------- BƯỚC 2: Auth Users + Profiles ----------

type Person = { id: string; fullName: string; email: string; role: string; orgId: string }

async function createAccount(
  email: string,
  fullName: string,
  role: string,
  orgId: string
): Promise<Person> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true, // bỏ qua bước xác nhận email
    user_metadata: { full_name: fullName },
  })
  assertOk(`tạo auth user ${email}`, error)

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user!.id,
    full_name: fullName,
    email,
    role,
    org_id: orgId,
    phone: vnPhone(),
    address: faker.location.streetAddress(),
  })
  assertOk(`tạo profile ${email}`, profileError)

  return { id: data.user!.id, fullName, email, role, orgId }
}

async function seedPeople(hq: Org, campuses: Org[]) {
  console.log(
    '2) Tạo tài khoản + hồ sơ (1 super admin, 4 campus admin, 8 staff, 4 tuyển sinh, 12 GV, 40 HS)...'
  )

  const superAdmin = await createAccount(
    `superadmin@${SEED_EMAIL_DOMAIN}`,
    'Quản Trị Hệ Thống',
    'super_admin',
    hq.id
  )

  const teachersByCampus: Person[][] = []
  const studentsByCampus: Person[][] = []
  const campusAdmins: Person[] = []
  const admissionStaffByCampus: Person[] = []

  for (let i = 0; i < campuses.length; i++) {
    const campus = campuses[i]
    const tag = `cs${i + 1}`

    campusAdmins.push(
      await createAccount(
        `admin.${tag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'campus_admin',
        campus.id
      )
    )

    for (let s = 1; s <= 2; s++) {
      await createAccount(
        `staff${s}.${tag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'academic_staff',
        campus.id
      )
    }

    // Tư vấn viên tuyển sinh (CRM Kanban /crm/leads)
    admissionStaffByCampus.push(
      await createAccount(
        `tuyensinh.${tag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'admission_staff',
        campus.id
      )
    )

    const teachers: Person[] = []
    for (let t = 1; t <= 3; t++) {
      teachers.push(
        await createAccount(
          `teacher${t}.${tag}@${SEED_EMAIL_DOMAIN}`,
          faker.person.fullName(),
          'teacher',
          campus.id
        )
      )
    }
    teachersByCampus.push(teachers)

    const students: Person[] = []
    for (let st = 1; st <= 10; st++) {
      students.push(
        await createAccount(
          `student${String(st).padStart(2, '0')}.${tag}@${SEED_EMAIL_DOMAIN}`,
          faker.person.fullName(),
          'student',
          campus.id
        )
      )
    }
    studentsByCampus.push(students)
    console.log(`   ${campus.name}: xong 17 tài khoản.`)
  }

  return { superAdmin, campusAdmins, admissionStaffByCampus, teachersByCampus, studentsByCampus }
}

// ---------- BƯỚC 3-9: Nghiệp vụ ----------

async function seedBusinessData(
  hq: Org,
  campuses: Org[],
  campusAdmins: Person[],
  admissionStaffByCampus: Person[],
  teachersByCampus: Person[][],
  studentsByCampus: Person[][]
) {
  // 3. Subjects (môn dùng chung, gắn org HQ để cleanup nhận diện được)
  console.log('3) Tạo môn học...')
  const subjectNames = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Vật lý', 'Hóa học']
  const { data: subjects, error: subjectError } = await supabase
    .from('subjects')
    .insert(subjectNames.map((name) => ({ name, org_id: hq.id, is_active: true })))
    .select('id, name')
  assertOk('tạo subjects', subjectError)

  // 4. Classes: 5 lớp phân bổ vào các campus khác nhau
  console.log('4) Tạo 5 lớp học...')
  const classCampusIndex = [0, 1, 2, 3, 0] // campus 1 có 2 lớp
  const now = new Date()
  const startDate = new Date(now.getTime() - 30 * 86400_000)
  const endDate = new Date(now.getTime() + 30 * 86400_000)

  const classRows = classCampusIndex.map((campusIdx, i) => {
    const teachers = teachersByCampus[campusIdx]
    return {
      org_id: campuses[campusIdx].id,
      name: `${subjects![i].name} 12A${i + 1} - Ca tối`,
      subject_id: subjects![i].id,
      teacher_id: teachers[i % teachers.length].id,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
    }
  })
  const { data: classes, error: classError } = await supabase
    .from('classes')
    .insert(classRows)
    .select('id, org_id, name, teacher_id')
  assertOk('tạo classes', classError)

  // 5. Enrollments: toàn bộ 10 HS của campus ghi danh vào lớp thuộc campus đó
  console.log('5) Ghi danh học sinh vào lớp...')
  const enrollmentRows: Record<string, unknown>[] = []
  const studentsOfClass: Person[][] = []
  classes!.forEach((cls, i) => {
    const students = studentsByCampus[classCampusIndex[i]]
    studentsOfClass.push(students)
    for (const student of students) {
      enrollmentRows.push({
        org_id: cls.org_id,
        class_id: cls.id,
        student_id: student.id,
        status: 'active',
      })
    }
  })
  await insertChunked('enrollments', enrollmentRows)

  // 6. Class sessions: 2 buổi/tuần (T2 + T5, 18h-20h) trong [-30 ngày, +30 ngày]
  console.log('6) Sinh lịch học (2 buổi/tuần cho mỗi lớp)...')
  const sessionRows: Record<string, unknown>[] = []
  for (const cls of classes!) {
    const cursor = new Date(startDate)
    cursor.setHours(18, 0, 0, 0)
    while (cursor <= endDate) {
      const day = cursor.getDay() // 1 = T2, 4 = T5
      if (day === 1 || day === 4) {
        const end = new Date(cursor)
        end.setHours(20, 0, 0, 0)
        sessionRows.push({
          org_id: cls.org_id,
          class_id: cls.id,
          teacher_id: cls.teacher_id,
          room: `P.${faker.number.int({ min: 101, max: 305 })}`,
          start_time: cursor.toISOString(),
          end_time: end.toISOString(),
          // Buổi quá khứ coi như đã chốt điểm danh -> Engine lương đếm được
          status: end < now ? 'completed' : 'scheduled',
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  await insertChunked('class_sessions', sessionRows)

  const { data: sessions, error: sessionError } = await supabase
    .from('class_sessions')
    .select('id, org_id, class_id, end_time')
    .in('class_id', classes!.map((c) => c.id))
  assertOk('đọc lại sessions', sessionError)

  // 7. Attendance: chỉ cho buổi ĐÃ DIỄN RA, ~10% vắng mặt
  console.log('7) Sinh dữ liệu điểm danh cho các buổi trong quá khứ (~10% vắng)...')
  const classIndexById = new Map(classes!.map((c, i) => [c.id, i]))
  const attendanceRows: Record<string, unknown>[] = []
  for (const session of sessions!) {
    if (new Date(session.end_time) >= now) continue // buổi tương lai: chưa điểm danh
    const students = studentsOfClass[classIndexById.get(session.class_id)!]
    for (const student of students) {
      const roll = Math.random()
      // ~90% có mặt, ~6% vắng không phép, ~4% vắng có phép
      const status = roll < 0.9 ? 'present' : roll < 0.96 ? 'absent' : 'excused'
      attendanceRows.push({
        org_id: session.org_id,
        session_id: session.id,
        student_id: student.id,
        status,
      })
    }
  }
  await insertChunked('attendance', attendanceRows)

  // 8. Assessments + Grades (điểm 0-10, khớp rule zod của hệ thống)
  console.log('8) Tạo bài kiểm tra + điểm số...')
  const assessmentTemplates = [
    { name: 'Điểm miệng', weight: 0.2 },
    { name: 'Giữa kỳ', weight: 0.3 },
    { name: 'Cuối kỳ', weight: 0.5 },
  ]
  const gradeRows: Record<string, unknown>[] = []
  for (const cls of classes!) {
    const { data: assessments, error: assessmentError } = await supabase
      .from('assessments')
      .insert(
        assessmentTemplates.map((t) => ({
          org_id: cls.org_id,
          class_id: cls.id,
          name: t.name,
          weight: t.weight,
          max_score: 10,
          // Hạn nhập điểm còn 14 ngày; lớp áp chót sẽ được LÙI hạn về
          // quá khứ SAU KHI đã nhập điểm (trigger DB chặn nhập khi quá hạn)
          grading_deadline: new Date(now.getTime() + 14 * 86400_000).toISOString(),
        }))
      )
      .select('id')
    assertOk(`tạo assessments lớp ${cls.name}`, assessmentError)

    const students = studentsOfClass[classIndexById.get(cls.id)!]
    for (const assessment of assessments!) {
      for (const student of students) {
        gradeRows.push({
          org_id: cls.org_id,
          assessment_id: assessment.id,
          student_id: student.id,
          score: randomScore(),
        })
      }
    }
  }
  // Grades PHẢI insert TRƯỚC khi khóa sổ (trigger prevent_locked_grade_changes)
  await insertChunked('grades', gradeRows)

  // 9. Chốt sổ lớp cuối cùng để demo tính năng khóa bảng điểm
  console.log('9) Chốt sổ điểm lớp cuối cùng (demo tính năng khóa)...')
  const lastClass = classes![classes!.length - 1]
  const { error: lockError } = await supabase.from('class_results').insert({
    org_id: lastClass.org_id,
    class_id: lastClass.id,
    lock_status: 'locked',
    locked_at: new Date().toISOString(),
    locked_by: lastClass.teacher_id,
  })
  assertOk('chốt sổ điểm', lockError)

  // 9b. LÙI hạn nhập điểm lớp áp chót về quá khứ (2 ngày trước)
  //     -> hiện màu VÀNG "Quá hạn - chờ duyệt" ở /staff/exams và
  //        /staff/results-approval. Làm SAU khi grades đã insert
  //        vì trigger DB chặn nhập điểm khi quá hạn.
  const overdueClass = classes![classes!.length - 2]
  const { error: overdueError } = await supabase
    .from('assessments')
    .update({ grading_deadline: new Date(now.getTime() - 2 * 86400_000).toISOString() })
    .eq('class_id', overdueClass.id)
  assertOk('lùi hạn nhập điểm lớp demo quá hạn', overdueError)

  // 10. Hợp đồng lương cho 12 giáo viên (trộn 3 loại hợp đồng)
  console.log('10) Tạo hợp đồng lương giáo viên (biên chế/thỉnh giảng/khoán giờ)...')
  const contractRows: Record<string, unknown>[] = []
  const contractStart = new Date(now.getTime() - 180 * 86400_000).toISOString().slice(0, 10)
  teachersByCampus.forEach((teachers) => {
    teachers.forEach((teacher, t) => {
      // GV1: biên chế, GV2: thỉnh giảng, GV3: khoán giờ
      const type = t === 0 ? 'full_time' : t === 1 ? 'visiting' : 'hourly'
      contractRows.push({
        teacher_id: teacher.id,
        org_id: teacher.orgId,
        contract_type: type,
        base_salary: type === 'full_time' ? 12_000_000 : 0,
        insurance_salary: type === 'full_time' ? 8_000_000 : 0,
        required_hours_per_month: type === 'full_time' ? 40 : 0,
        base_hourly_rate: type === 'full_time' ? 150_000 : type === 'visiting' ? 250_000 : 200_000,
        tax_percentage: 10,
        insurance_percentage: type === 'full_time' ? 10.5 : 0,
        start_date: contractStart,
        end_date: null,
        is_active: true,
      })
    })
  })
  await insertChunked('teacher_contracts', contractRows)

  // 11. Hóa đơn học phí + phiếu thu cho MỌI học sinh
  //     ~50% đã đóng đủ, ~25% đóng một phần, ~25% chưa đóng (một nửa QUÁ HẠN)
  console.log('11) Tạo hóa đơn học phí + phiếu thu...')
  const invoiceRows: {
    org_id: string
    student_id: string
    amount: number
    status: string
    due_date: string
    note: string
  }[] = []
  studentsByCampus.forEach((students, campusIdx) => {
    for (const student of students) {
      const roll = Math.random()
      const status = roll < 0.5 ? 'paid' : roll < 0.75 ? 'partial' : 'pending'
      // Hóa đơn 'pending' xen kẽ hạn quá khứ (nợ quá hạn) và tương lai
      const overdue = status === 'pending' && Math.random() < 0.5
      invoiceRows.push({
        org_id: campuses[campusIdx].id,
        student_id: student.id,
        amount: 2_000_000,
        status,
        due_date: new Date(now.getTime() + (overdue ? -7 : 14) * 86400_000)
          .toISOString()
          .slice(0, 10),
        note: `Học phí tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
      })
    }
  })
  const { data: invoices, error: invoiceError } = await supabase
    .from('invoices')
    .insert(invoiceRows)
    .select('id, org_id, status, amount')
  assertOk('tạo invoices', invoiceError)

  const adminByOrg = new Map(campusAdmins.map((admin) => [admin.orgId, admin.id]))
  const paymentRows: Record<string, unknown>[] = []
  for (const invoice of invoices!) {
    if (invoice.status === 'pending') continue
    paymentRows.push({
      org_id: invoice.org_id,
      invoice_id: invoice.id,
      amount_paid: invoice.status === 'paid' ? Number(invoice.amount) : Number(invoice.amount) / 2,
      payment_method: Math.random() < 0.5 ? 'cash' : 'transfer',
      recorded_by: adminByOrg.get(invoice.org_id) ?? null,
    })
  }
  await insertChunked('payments', paymentRows)

  // 12. CRM: leads đủ trạng thái + nhật ký chăm sóc
  console.log('12) Tạo leads tuyển sinh (CRM Kanban)...')
  const leadStatuses = ['new', 'new', 'contacted', 'contacted', 'test_scheduled', 'lost']
  const leadRows: Record<string, unknown>[] = []
  campuses.forEach((campus, campusIdx) => {
    const counselor = admissionStaffByCampus[campusIdx]
    leadStatuses.forEach((status, l) => {
      leadRows.push({
        org_id: campus.id,
        full_name: faker.person.fullName(),
        phone: vnPhone(),
        interested_subject_id: subjects![l % subjects!.length].id,
        status,
        // Lead 'new' đầu tiên CHƯA có người phụ trách (demo nhận lead)
        counselor_id: l === 0 ? null : counselor.id,
        notes: status === 'lost' ? 'Phụ huynh báo đã chọn trung tâm khác.' : faker.lorem.sentence(),
      })
    })
  })
  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .insert(leadRows)
    .select('id, org_id, counselor_id, status')
  assertOk('tạo leads', leadError)

  const activityRows: Record<string, unknown>[] = []
  for (const lead of leads!) {
    if (lead.status === 'new' || !lead.counselor_id) continue
    activityRows.push({
      org_id: lead.org_id,
      lead_id: lead.id,
      activity_type: Math.random() < 0.6 ? 'call' : 'meeting',
      description: 'Đã tư vấn lộ trình học và học phí.',
      created_by: lead.counselor_id,
    })
  }
  await insertChunked('lead_activities', activityRows)

  // 13. Ngân hàng đề (bảng exam_bank - migration 024; thiếu bảng thì bỏ qua)
  console.log('13) Tạo ngân hàng đề (3 đề/cơ sở)...')
  const examBankRows: Record<string, unknown>[] = []
  campuses.forEach((campus, campusIdx) => {
    for (let e = 0; e < 3; e++) {
      const subject = subjects![(campusIdx + e) % subjects!.length]
      examBankRows.push({
        org_id: campus.id,
        subject_id: subject.id,
        title: `Đề ${e === 0 ? 'giữa kỳ' : e === 1 ? 'cuối kỳ' : 'ôn tập'} ${subject.name} 12 - Mã ${100 + campusIdx * 10 + e}`,
        description: `Đề ${subject.name} lớp 12, phạm vi chương ${e + 1}-${e + 3}.`,
        content: `Câu 1 (3đ): ...\nCâu 2 (3đ): ...\nCâu 3 (4đ): ...\n(Đề demo sinh tự động)`,
        grade_level: 'Lớp 12',
        duration_minutes: e === 1 ? 90 : 45,
        created_by: adminByOrg.get(campus.id) ?? null,
      })
    }
  })
  {
    const { error: examBankError } = await supabase.from('exam_bank').insert(examBankRows)
    if (examBankError) {
      console.warn(`   (bỏ qua exam_bank - hãy chạy migration 024: ${examBankError.message})`)
    }
  }

  // 14. LMS: bài giảng + bài tập + quiz cho mỗi lớp (migration 025; thiếu bảng thì bỏ qua)
  console.log('14) Tạo dữ liệu LMS (bài giảng, bài tập, kiểm tra online)...')
  let lmsSeeded = 0
  try {
    for (let ci = 0; ci < classes!.length; ci++) {
      const cls = classes![ci]
      const students = studentsOfClass[ci]

      // 2 bài giảng đã phát hành + 1 nháp
      const { error: lessonErr } = await supabase.from('lms_lessons').insert([
        {
          org_id: cls.org_id, class_id: cls.id, created_by: cls.teacher_id,
          title: `Bài 1 - Kiến thức nền tảng (${cls.name})`,
          description: 'Ôn tập kiến thức trọng tâm trước khi vào chương mới.',
          content: 'Nội dung bài giảng demo:\n1. Khái niệm cơ bản\n2. Ví dụ minh họa\n3. Bài tập vận dụng',
          video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          status: 'published',
        },
        {
          org_id: cls.org_id, class_id: cls.id, created_by: cls.teacher_id,
          title: 'Bài 2 - Luyện đề nâng cao',
          content: 'Phân tích 5 dạng bài thường gặp trong đề thi (demo).',
          status: 'published',
        },
        {
          org_id: cls.org_id, class_id: cls.id, created_by: cls.teacher_id,
          title: 'Bài 3 - Đang biên soạn', status: 'draft',
        },
      ])
      if (lessonErr) throw lessonErr

      // 1 bài tập (hạn +7 ngày) - 60% HS đã nộp, một nửa đã chấm
      const { data: assignment, error: asgErr } = await supabase
        .from('lms_assignments')
        .insert({
          org_id: cls.org_id, class_id: cls.id, created_by: cls.teacher_id,
          title: `Bài tập tuần - ${cls.name}`,
          instructions: 'Làm bài trong file đính kèm hoặc trả lời trực tiếp. Trình bày rõ các bước.',
          due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          allow_late: true,
        })
        .select('id')
        .single()
      if (asgErr) throw asgErr

      const submissionRows = students.slice(0, Math.ceil(students.length * 0.6)).map((st, si) => ({
        org_id: cls.org_id,
        assignment_id: assignment!.id,
        student_id: st.id,
        content: `Bài làm của em (demo): ${faker.lorem.sentences(2)}`,
        ...(si % 2 === 0
          ? { score: 6 + Math.round(Math.random() * 8) / 2, feedback: 'Bài làm khá, chú ý trình bày.', graded_by: cls.teacher_id, graded_at: new Date().toISOString() }
          : {}),
      }))
      const { error: subErr } = await supabase.from('lms_submissions').insert(submissionRows)
      if (subErr) throw subErr

      // 1 đề trắc nghiệm 5 câu đã mở - 50% HS đã làm
      const { data: quiz, error: quizErr } = await supabase
        .from('lms_quizzes')
        .insert({
          org_id: cls.org_id, class_id: cls.id, created_by: cls.teacher_id,
          title: `Kiểm tra 15 phút - ${cls.name}`,
          description: 'Trắc nghiệm 5 câu, làm 1 lần duy nhất.',
          duration_minutes: 15, is_published: true,
        })
        .select('id')
        .single()
      if (quizErr) throw quizErr

      const questionRows = Array.from({ length: 5 }, (_, qi) => ({
        org_id: cls.org_id,
        quiz_id: quiz!.id,
        question: `Câu hỏi demo số ${qi + 1}: chọn đáp án đúng nhất?`,
        options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
        correct_index: qi % 4,
        points: 1,
        position: qi,
      }))
      const { data: questions, error: qErr } = await supabase
        .from('lms_quiz_questions')
        .insert(questionRows)
        .select('id, correct_index')
      if (qErr) throw qErr

      const attemptRows = students.slice(0, Math.ceil(students.length * 0.5)).map((st) => {
        const answers: Record<string, number> = {}
        let earned = 0
        for (const q of questions!) {
          const correct = Math.random() < 0.7
          answers[q.id] = correct ? q.correct_index : (q.correct_index + 1) % 4
          if (correct) earned += 1
        }
        return {
          org_id: cls.org_id, quiz_id: quiz!.id, student_id: st.id,
          answers, score: Math.round((earned / 5) * 10 * 100) / 100, total_points: 5,
          started_at: new Date(Date.now() - 3600000).toISOString(),
          submitted_at: new Date(Date.now() - 3000000).toISOString(),
        }
      })
      const { error: attErr } = await supabase.from('lms_quiz_attempts').insert(attemptRows)
      if (attErr) throw attErr
      lmsSeeded++
    }
  } catch (e) {
    console.warn(`   (bỏ qua LMS - hãy chạy migration 025: ${e instanceof Error ? e.message : e})`)
  }
  if (lmsSeeded > 0) console.log(`   LMS: ${lmsSeeded} lớp có bài giảng + bài tập + kiểm tra online.`)

  return {
    classCount: classes!.length,
    sessionCount: sessionRows.length,
    attendanceCount: attendanceRows.length,
    gradeCount: gradeRows.length,
    lockedClassName: lastClass.name,
    overdueClassName: overdueClass.name,
    contractCount: contractRows.length,
    invoiceCount: invoiceRows.length,
    leadCount: leadRows.length,
  }
}

// ---------- MAIN ----------

async function main() {
  console.log(`Seed GDTX ERP -> ${url}\n`)

  await cleanupPreviousSeed()
  const { hq, campuses } = await seedOrganizations()
  const { campusAdmins, admissionStaffByCampus, teachersByCampus, studentsByCampus } =
    await seedPeople(hq, campuses)
  const stats = await seedBusinessData(
    hq,
    campuses,
    campusAdmins,
    admissionStaffByCampus,
    teachersByCampus,
    studentsByCampus
  )

  console.log('\n================= SEED HOÀN TẤT =================')
  console.log(`Tổ chức    : 1 HQ, 2 cụm, ${campuses.length} cơ sở`)
  console.log(`Tài khoản  : 69 (1 super admin, 4 campus admin, 8 giáo vụ, 4 tuyển sinh, 12 GV, 40 HS)`)
  console.log(`Lớp học    : ${stats.classCount} (đã chốt sổ: ${stats.lockedClassName} | quá hạn nhập điểm: ${stats.overdueClassName})`)
  console.log(`Buổi học   : ${stats.sessionCount} | Điểm danh: ${stats.attendanceCount} | Điểm số: ${stats.gradeCount}`)
  console.log(`Hợp đồng GV: ${stats.contractCount} | Hóa đơn: ${stats.invoiceCount} | Leads CRM: ${stats.leadCount}`)
  console.log('\n=========== TÀI KHOẢN ĐĂNG NHẬP TEST ===========')
  console.log(`MẬT KHẨU CHUNG cho TẤT CẢ tài khoản: ${SEED_PASSWORD}`)
  console.log('')
  console.log(`  Tổng quản trị  : superadmin@${SEED_EMAIL_DOMAIN}            -> /admin`)
  console.log(`  QL Cơ sở 1..4  : admin.cs1@${SEED_EMAIL_DOMAIN} ... admin.cs4@...  -> /admin`)
  console.log(`  Giáo vụ        : staff1.cs1@${SEED_EMAIL_DOMAIN}, staff2.cs1@... (mỗi cơ sở 2) -> /staff`)
  console.log(`  Tuyển sinh     : tuyensinh.cs1@${SEED_EMAIL_DOMAIN} ... (mỗi cơ sở 1) -> /crm/leads`)
  console.log(`  Giáo viên      : teacher1.cs1@${SEED_EMAIL_DOMAIN} ... teacher3.cs4@... -> /teacher`)
  console.log(`  Học sinh       : student01.cs1@${SEED_EMAIL_DOMAIN} ... student10.cs4@... -> /student`)
  console.log('')
  console.log('  (cs1=HN Cầu Giấy, cs2=HN Hà Đông, cs3=HCM Quận 1, cs4=HCM Thủ Đức)')
  console.log('  Chi tiết đầy đủ: docs/demo-accounts.md')
}

main().catch((error) => {
  console.error('[LỖI KHÔNG MONG MUỐN]', error)
  process.exit(1)
})
