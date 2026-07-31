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
 *  - Mỗi campus: 1 campus_admin + 2 staff + 3 teacher + 10 student
 *  - 1 super_admin ở HQ
 *  - 5 lớp học phân bổ vào các campus, mỗi lớp 2 buổi/tuần
 *    trong khoảng [hôm nay - 30 ngày, hôm nay + 30 ngày]
 *  - Điểm danh cho buổi ĐÃ DIỄN RA: ~90% có mặt, ~10% vắng
 *  - Điểm số cho 3 bài kiểm tra/lớp (hệ số 0.2/0.3/0.5), thang 0-10
 *  - Lớp cuối cùng được CHỐT SỔ để demo tính năng khóa bảng điểm
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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env - không thể seed.'
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
        // subjects/profiles có thể chưa có dòng nào thuộc org demo -> bỏ qua lỗi "không có gì"
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
  const campusNames = [
    ['Cơ sở Hà Nội - Cầu Giấy', 'Cơ sở Hà Nội - Hà Đông'],
    ['Cơ sở TP.HCM - Quận 1', 'Cơ sở TP.HCM - Thủ Đức'],
  ]

  for (let r = 0; r < 2; r++) {
    const { data: region, error: regionError } = await supabase
      .from('organizations')
      .insert({ name: regionNames[r], type: 'region', parent_id: hq!.id })
      .select('id, name')
      .single()
    assertOk('tạo region', regionError)

    for (let c = 0; c < 2; c++) {
      const { data: campus, error: campusError } = await supabase
        .from('organizations')
        .insert({ name: campusNames[r][c], type: 'campus', parent_id: region!.id })
        .select('id, name')
        .single()
      assertOk('tạo campus', campusError)
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
  console.log('2) Tạo tài khoản + hồ sơ (1 super admin, 4 campus admin, 8 staff, 12 GV, 40 HS)...')

  const superAdmin = await createAccount(
    `superadmin@${SEED_EMAIL_DOMAIN}`,
    'Quản Trị Hệ Thống',
    'super_admin',
    hq.id
  )

  const teachersByCampus: Person[][] = []
  const studentsByCampus: Person[][] = []
  const campusAdmins: Person[] = []

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
    console.log(`   ${campus.name}: xong 16 tài khoản.`)
  }

  return { superAdmin, campusAdmins, teachersByCampus, studentsByCampus }
}

// ---------- BƯỚC 3-9: Nghiệp vụ ----------

async function seedBusinessData(
  hq: Org,
  campuses: Org[],
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

  return {
    classCount: classes!.length,
    sessionCount: sessionRows.length,
    attendanceCount: attendanceRows.length,
    gradeCount: gradeRows.length,
    lockedClassName: lastClass.name,
  }
}

// ---------- MAIN ----------

async function main() {
  console.log(`Seed GDTX ERP -> ${url}\n`)

  await cleanupPreviousSeed()
  const { hq, campuses } = await seedOrganizations()
  const { teachersByCampus, studentsByCampus } = await seedPeople(hq, campuses)
  const stats = await seedBusinessData(hq, campuses, teachersByCampus, studentsByCampus)

  console.log('\n================= SEED HOÀN TẤT =================')
  console.log(`Tổ chức    : 1 HQ, 2 cụm, ${campuses.length} cơ sở`)
  console.log(`Tài khoản  : 65 (1 super admin, 4 campus admin, 8 staff, 12 GV, 40 HS)`)
  console.log(`Lớp học    : ${stats.classCount} (đã chốt sổ: ${stats.lockedClassName})`)
  console.log(`Buổi học   : ${stats.sessionCount} | Điểm danh: ${stats.attendanceCount} | Điểm số: ${stats.gradeCount}`)
  console.log('\nTài khoản demo (mật khẩu chung: ' + SEED_PASSWORD + ')')
  console.log(`  super_admin : superadmin@${SEED_EMAIL_DOMAIN}`)
  console.log(`  campus_admin: admin.cs1@${SEED_EMAIL_DOMAIN} ... admin.cs4@${SEED_EMAIL_DOMAIN}`)
  console.log(`  staff       : staff1.cs1@${SEED_EMAIL_DOMAIN} ...`)
  console.log(`  teacher     : teacher1.cs1@${SEED_EMAIL_DOMAIN} ...`)
  console.log(`  student     : student01.cs1@${SEED_EMAIL_DOMAIN} ...`)
}

main().catch((error) => {
  console.error('[LỖI KHÔNG MONG MUỐN]', error)
  process.exit(1)
})
