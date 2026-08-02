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
 * Cấu trúc dữ liệu sinh ra (MÔ HÌNH MỚI - docs/ORG_MODEL.md):
 *  - Gốc "Hệ thống" (hq) -> 2 KHÁCH HÀNG (Đơn vị cấp 1, type 'campus',
 *    có slug + license) -> mỗi khách hàng 2 Cơ sở nhánh (type 'branch').
 *  - Khách hàng 1 "Trường Cao đẳng Việt Mỹ": license FULL module.
 *  - Khách hàng 2 "Trung tâm GDTX Thăng Long": license gói CƠ BẢN.
 *  - Mỗi khách hàng: 1 Admin Đơn vị (org_id = Đơn vị).
 *  - Mỗi nhánh: 1 admin nhánh + 2 giáo vụ + 1 tuyển sinh + 1 kế toán
 *    + 3 teacher + 10 student (có MaSV). 1 super_admin ở gốc.
 *    Tổng 75 tài khoản.
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
 * Script RESET TOÀN BỘ: xóa sạch MỌI dữ liệu cũ (tất cả org,
 * profile, auth user, license...) rồi nạp lại từ đầu theo mô hình mới.
 * ============================================================
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { fakerVI as faker } from '@faker-js/faker'

// ---------- Cấu hình ----------

const SEED_EMAIL_DOMAIN = 'gdtx-demo.edu.vn'
const SEED_PASSWORD = 'Demo@123456' // mật khẩu chung cho MỌI tài khoản demo
const ROOT_NAME = 'Hệ thống'

/** 18 module key theo src/lib/licensing/moduleCatalog.ts */
const ALL_MODULE_KEYS = [
  'students', 'crm', 'announcements',
  'classes', 'attendance', 'staff_ops', 'academic_warnings',
  'teacher_schedule', 'teacher_requests', 'evaluations', 'staff_users',
  'payroll_contracts', 'finance_invoices', 'assets',
  'ai_kb', 'settings_org', 'organizations', 'permissions',
]
/** Gói CƠ BẢN cho khách hàng 2 (không AI, không tài sản, không đánh giá GV) */
const BASIC_MODULE_KEYS = ALL_MODULE_KEYS.filter(
  (k) => !['ai_kb', 'assets', 'evaluations', 'academic_warnings'].includes(k)
)

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

// ---------- BƯỚC 0: RESET TOÀN BỘ dữ liệu cũ ----------

async function cleanupPreviousSeed() {
  console.log('0) RESET: xóa TOÀN BỘ dữ liệu cũ (mọi org, mọi tài khoản)...')

  // 0.1 Lấy TẤT CẢ org hiện có (không phân biệt demo hay không)
  const { data: allOrgs, error: orgListError } = await supabase
    .from('organizations')
    .select('id, path')
  assertOk('liệt kê organizations cũ', orgListError)

  {
    const ids: string[] = (allOrgs ?? []).map((o) => o.id)

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

      // Bảng TÙY CHỌN (module mở rộng): XÓA TOÀN BỘ theo id (reset sạch),
      // thứ tự con -> cha để không vướng khóa ngoại; thiếu bảng thì cảnh báo.
      for (const table of [
        'lms_lesson_progress',
        'lms_quiz_attempts',
        'lms_quiz_questions',
        'lms_quizzes',
        'lms_submissions',
        'lms_assignments',
        'lms_lessons',
        'exam_variants',
        'exam_proctors',
        'exam_schedules',
        'exam_bank',
        're_examination_requests',
        'student_ai_chats',
        'evaluation_results',
        'evaluation_campaigns',
        'lead_activities',
        'leads',
        'student_warnings',
        'behavior_logs',
        'ticket_approvals',
        'tickets',
        'ticket_categories',
        'asset_logs',
        'assets',
        'announcements',
        'teacher_requests',
        'facility_bookings',
        'facilities',
        'internships',
        'enterprises',
        'vocational_records',
        'academic_records',
        'payrolls',
        'teacher_contracts',
        'rate_modifiers',
        'org_ai_settings',
        'org_custom_fields',
        'org_settings',
        'lesson_materials',
        'assessment_types',
        'menu_permissions',
        'module_flags',
        'tenant_licenses',
        'global_layout_templates',
        'user_preferences',
        'user_notifications',
        'user_settings',
      ]) {
        const { error: delError } = await supabase.from(table).delete().not('id', 'is', null)
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
      const sorted = (allOrgs ?? []).sort(
        (a, b) => String(b.path).split('.').length - String(a.path).split('.').length
      )
      for (const org of sorted) {
        const { error: delOrgError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', org.id)
        assertOk('xóa organization cũ', delOrgError)
      }
      console.log(`   Đã xóa ${ids.length} organization cũ.`)
    }
  }

  // 0.2 Xóa TOÀN BỘ auth users cũ (reset sạch)
  const toDelete: string[] = []
  for (;;) {
    // Luôn đọc trang 1: danh sách co lại sau mỗi lượt xóa
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
    assertOk('liệt kê auth users', error)
    if (data.users.length === 0) break
    for (const user of data.users) {
      // profiles.id có ON DELETE CASCADE theo auth.users -> profile tự xóa
      const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
      assertOk(`xóa auth user cũ ${user.email ?? user.id}`, delErr)
      toDelete.push(user.id)
    }
    if (data.users.length < 200) break
  }
  if (toDelete.length > 0) console.log(`   Đã xóa ${toDelete.length} tài khoản cũ.`)
}

// ---------- BƯỚC 1: Organizations (Hệ thống -> 2 Khách hàng -> 4 Nhánh) ----------

type Org = { id: string; name: string }

/** Định nghĩa 2 khách hàng demo + các cơ sở nhánh của họ */
const CUSTOMER_DEFS = [
  {
    name: 'Trường Cao đẳng Việt Mỹ',
    slug: 'viet-my',
    adminTag: 'vietmy',
    moduleKeys: ALL_MODULE_KEYS,
    planName: 'full',
    maxStudents: 500,
    branches: [
      { name: 'Việt Mỹ - Hà Nội', slug: 'ha-noi', tag: 'vmhn' },
      { name: 'Việt Mỹ - TP.HCM', slug: 'tp-hcm', tag: 'vmhcm' },
    ],
  },
  {
    name: 'Trung tâm GDTX Thăng Long',
    slug: 'thang-long',
    adminTag: 'thanglong',
    moduleKeys: BASIC_MODULE_KEYS,
    planName: 'basic',
    maxStudents: 200,
    branches: [
      { name: 'Thăng Long - Cầu Giấy', slug: 'cau-giay', tag: 'tlcg' },
      { name: 'Thăng Long - Hà Đông', slug: 'ha-dong', tag: 'tlhd' },
    ],
  },
]

async function seedOrganizations(): Promise<{
  root: Org
  customers: Org[]
  branches: Org[] // phẳng 4 nhánh theo thứ tự CUSTOMER_DEFS
}> {
  console.log('1) Tạo cây tổ chức: Hệ thống -> 2 Khách hàng -> 4 Cơ sở nhánh...')

  const { data: root, error: rootError } = await supabase
    .from('organizations')
    .insert({ name: ROOT_NAME, type: 'hq', parent_id: null })
    .select('id, name')
    .single()
  assertOk('tạo gốc Hệ thống', rootError)

  const customers: Org[] = []
  const branches: Org[] = []

  for (const def of CUSTOMER_DEFS) {
    const { data: customer, error: customerError } = await supabase
      .from('organizations')
      .insert({ name: def.name, type: 'campus', parent_id: root!.id, slug: def.slug })
      .select('id, name')
      .single()
    assertOk(`tạo Đơn vị khách hàng ${def.name}`, customerError)
    customers.push(customer!)

    for (const b of def.branches) {
      const { data: branch, error: branchError } = await supabase
        .from('organizations')
        .insert({ name: b.name, type: 'branch', parent_id: customer!.id, slug: b.slug })
        .select('id, name')
        .single()
      assertOk(`tạo nhánh ${b.name}`, branchError)
      branches.push(branch!)
    }

    // License cấp ĐƠN VỊ (044): gói module + giới hạn HV + hạn 1 năm
    const { error: licenseError } = await supabase.from('tenant_licenses').insert({
      org_id: customer!.id,
      plan_name: def.planName,
      module_keys: def.moduleKeys,
      max_students: def.maxStudents,
      valid_until: new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10),
      status: 'active',
    })
    if (licenseError) {
      console.warn(`   (bỏ qua license ${def.name} - hãy chạy migration 044: ${licenseError.message})`)
    }
  }

  return { root: root!, customers, branches }
}

// ---------- BƯỚC 2: Auth Users + Profiles ----------

type Person = { id: string; fullName: string; email: string; role: string; orgId: string }

async function createAccount(
  email: string,
  fullName: string,
  role: string,
  orgId: string,
  masv?: string
): Promise<Person> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true, // bỏ qua bước xác nhận email
    user_metadata: { full_name: fullName },
  })
  assertOk(`tạo auth user ${email}`, error)

  const profileRow: Record<string, unknown> = {
    id: data.user!.id,
    full_name: fullName,
    email,
    role,
    org_id: orgId,
    phone: vnPhone(),
    address: faker.location.streetAddress(),
  }
  if (masv) profileRow.MaSV = masv // mã học viên (migration 035, cột "MaSV")

  let { error: profileError } = await supabase.from('profiles').insert(profileRow)
  if (profileError && masv && /MaSV|42703|schema cache/i.test(profileError.message)) {
    // Chưa chạy migration 035 -> bỏ MaSV, vẫn tạo được hồ sơ
    delete profileRow.MaSV
    ;({ error: profileError } = await supabase.from('profiles').insert(profileRow))
  }
  assertOk(`tạo profile ${email}`, profileError)

  return { id: data.user!.id, fullName, email, role, orgId }
}

async function seedPeople(root: Org, customers: Org[], branches: Org[]) {
  console.log(
    '2) Tạo tài khoản: 1 super admin, 2 Admin Đơn vị, mỗi nhánh (admin + 2 giáo vụ + tuyển sinh + kế toán + 3 GV + 10 HS)...'
  )

  const superAdmin = await createAccount(
    `superadmin@${SEED_EMAIL_DOMAIN}`,
    'Quản Trị Hệ Thống',
    'super_admin',
    root.id
  )

  // Admin ĐƠN VỊ (khách hàng): quản toàn bộ cây con của Đơn vị
  const unitAdmins: Person[] = []
  for (let c = 0; c < customers.length; c++) {
    unitAdmins.push(
      await createAccount(
        `admin.${CUSTOMER_DEFS[c].adminTag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'campus_admin',
        customers[c].id
      )
    )
  }

  // Prefix MaSV theo khách hàng: VM (Việt Mỹ), TL (Thăng Long)
  const branchDefs = CUSTOMER_DEFS.flatMap((def, ci) =>
    def.branches.map((b) => ({ ...b, masvPrefix: ci === 0 ? 'VM' : 'TL' }))
  )

  const teachersByCampus: Person[][] = []
  const studentsByCampus: Person[][] = []
  const campusAdmins: Person[] = []
  const admissionStaffByCampus: Person[] = []
  let masvSeq = 0

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i]
    const { tag, masvPrefix } = branchDefs[i]

    campusAdmins.push(
      await createAccount(
        `admin.${tag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'campus_admin',
        branch.id
      )
    )

    for (let s = 1; s <= 2; s++) {
      await createAccount(
        `staff${s}.${tag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'academic_staff',
        branch.id
      )
    }

    // Tư vấn viên tuyển sinh (CRM Kanban /crm/leads)
    admissionStaffByCampus.push(
      await createAccount(
        `tuyensinh.${tag}@${SEED_EMAIL_DOMAIN}`,
        faker.person.fullName(),
        'admission_staff',
        branch.id
      )
    )

    // Kế toán (module Tài chính)
    await createAccount(
      `ketoan.${tag}@${SEED_EMAIL_DOMAIN}`,
      faker.person.fullName(),
      'accountant',
      branch.id
    )

    const teachers: Person[] = []
    for (let t = 1; t <= 3; t++) {
      teachers.push(
        await createAccount(
          `teacher${t}.${tag}@${SEED_EMAIL_DOMAIN}`,
          faker.person.fullName(),
          'teacher',
          branch.id
        )
      )
    }
    teachersByCampus.push(teachers)

    const students: Person[] = []
    for (let st = 1; st <= 10; st++) {
      masvSeq += 1
      students.push(
        await createAccount(
          `student${String(st).padStart(2, '0')}.${tag}@${SEED_EMAIL_DOMAIN}`,
          faker.person.fullName(),
          'student',
          branch.id,
          `${masvPrefix}24-${String(masvSeq).padStart(4, '0')}` // VD: VM24-0001
        )
      )
    }
    studentsByCampus.push(students)
    console.log(`   ${branch.name}: xong 18 tài khoản.`)
  }

  return {
    superAdmin,
    unitAdmins,
    campusAdmins,
    admissionStaffByCampus,
    teachersByCampus,
    studentsByCampus,
  }
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
  const leadSources = [
    'hotline',
    'facebook',
    'zalo',
    'walk_in',
    'referral',
    'website',
  ] as const
  const leadPriorities = ['hot', 'warm', 'warm', 'cold', 'hot', 'cold'] as const
  const leadRows: Record<string, unknown>[] = []
  campuses.forEach((campus, campusIdx) => {
    const counselor = admissionStaffByCampus[campusIdx]
    leadStatuses.forEach((status, l) => {
      const followUp =
        status === 'contacted' || status === 'new'
          ? new Date(Date.now() + (l % 2 === 0 ? -2 : 2) * 86400_000).toISOString()
          : null
      leadRows.push({
        org_id: campus.id,
        full_name: faker.person.fullName(),
        phone: vnPhone(),
        email: faker.internet.email().toLowerCase(),
        interested_subject_id: subjects![l % subjects!.length].id,
        status,
        source: leadSources[l % leadSources.length],
        priority: leadPriorities[l % leadPriorities.length],
        date_of_birth: faker.date.birthdate({ min: 14, max: 22, mode: 'age' }).toISOString().slice(0, 10),
        gender: l % 2 === 0 ? 'male' : 'female',
        cccd: `${100000000000 + campusIdx * 1000 + l}`,
        address: faker.location.streetAddress(),
        current_school: `THPT ${faker.location.city()}`,
        education_level: 'Lớp 12',
        career_interest: l % 2 === 0 ? 'CNTT / Lập trình' : 'Tiếng Anh giao tiếp',
        interests: 'Thể thao, đọc sách',
        preferred_schedule: 'Tối 19h-21h',
        call_summary: status === 'new' ? null : 'Đã gọi lần 1, PH quan tâm học phí.',
        parent_name: faker.person.fullName(),
        parent_phone: vnPhone(),
        parent_relation: l % 2 === 0 ? 'mother' : 'father',
        parent_email: faker.internet.email().toLowerCase(),
        next_follow_up_at: followUp,
        appointment_at:
          status === 'test_scheduled'
            ? new Date(Date.now() + 3 * 86400_000).toISOString()
            : null,
        lost_reason: status === 'lost' ? 'Phụ huynh báo đã chọn trung tâm khác.' : null,
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
  const { root, customers, branches } = await seedOrganizations()
  const { unitAdmins, campusAdmins, admissionStaffByCampus, teachersByCampus, studentsByCampus } =
    await seedPeople(root, customers, branches)

  // Người liên hệ của mỗi Đơn vị (hiện ở Hồ sơ Đơn vị của Super Admin)
  for (let c = 0; c < customers.length; c++) {
    const { error: contactError } = await supabase.from('org_settings').upsert(
      {
        org_id: customers[c].id,
        config: {
          unit_contact: {
            name: unitAdmins[c].fullName,
            email: unitAdmins[c].email,
            phone: vnPhone(),
          },
        },
      },
      { onConflict: 'org_id' }
    )
    if (contactError) console.warn(`   (bỏ qua unit_contact: ${contactError.message})`)
  }

  const stats = await seedBusinessData(
    root,
    branches,
    campusAdmins,
    admissionStaffByCampus,
    teachersByCampus,
    studentsByCampus
  )

  console.log('\n================= SEED HOÀN TẤT =================')
  console.log(`Tổ chức    : 1 gốc Hệ thống, ${customers.length} Khách hàng (Đơn vị cấp 1), ${branches.length} cơ sở nhánh`)
  console.log(`Tài khoản  : 75 (1 super admin, 2 Admin Đơn vị, 4 admin nhánh, 8 giáo vụ, 4 tuyển sinh, 4 kế toán, 12 GV, 40 HS có MaSV)`)
  console.log(`License    : Việt Mỹ = gói FULL (${ALL_MODULE_KEYS.length} module) | Thăng Long = gói BASIC (${BASIC_MODULE_KEYS.length} module)`)
  console.log(`Lớp học    : ${stats.classCount} (đã chốt sổ: ${stats.lockedClassName} | quá hạn nhập điểm: ${stats.overdueClassName})`)
  console.log(`Buổi học   : ${stats.sessionCount} | Điểm danh: ${stats.attendanceCount} | Điểm số: ${stats.gradeCount}`)
  console.log(`Hợp đồng GV: ${stats.contractCount} | Hóa đơn: ${stats.invoiceCount} | Leads CRM: ${stats.leadCount}`)
  console.log('\n=========== TÀI KHOẢN ĐĂNG NHẬP TEST ===========')
  console.log(`MẬT KHẨU CHUNG cho TẤT CẢ tài khoản: ${SEED_PASSWORD}`)
  console.log('')
  console.log(`  Super Admin      : superadmin@${SEED_EMAIL_DOMAIN}         -> /login`)
  console.log(`  Admin Việt Mỹ    : admin.vietmy@${SEED_EMAIL_DOMAIN}       -> /coso/viet-my`)
  console.log(`  Admin Thăng Long : admin.thanglong@${SEED_EMAIL_DOMAIN}    -> /coso/thang-long`)
  console.log(`  Admin nhánh      : admin.vmhn@ / admin.vmhcm@ / admin.tlcg@ / admin.tlhd@`)
  console.log(`  Giáo vụ          : staff1.vmhn@ ... (mỗi nhánh 2)          -> /staff`)
  console.log(`  Tuyển sinh       : tuyensinh.vmhn@ ... (mỗi nhánh 1)       -> /crm/leads`)
  console.log(`  Kế toán          : ketoan.vmhn@ ... (mỗi nhánh 1)          -> /finance/invoices`)
  console.log(`  Giáo viên        : teacher1.vmhn@ ... teacher3.tlhd@       -> /teacher`)
  console.log(`  Học sinh         : student01.vmhn@ ... student10.tlhd@     -> /student (MaSV: VM24-xxxx / TL24-xxxx)`)
  console.log('')
  console.log('  (vmhn=Việt Mỹ Hà Nội, vmhcm=Việt Mỹ TP.HCM, tlcg=Thăng Long Cầu Giấy, tlhd=Thăng Long Hà Đông)')
  console.log('  Chi tiết đầy đủ: docs/demo-accounts.md')
}

main().catch((error) => {
  console.error('[LỖI KHÔNG MONG MUỐN]', error)
  process.exit(1)
})
