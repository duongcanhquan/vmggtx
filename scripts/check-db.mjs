// ============================================================
// KIỂM TRA TRẠNG THÁI DATABASE SUPABASE
// Chạy: node scripts/check-db.mjs
// Dò xem bảng / cột / function của từng migration đã tồn tại chưa
// (dùng anon key - chỉ check TỒN TẠI, không đọc dữ liệu).
// ============================================================
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Đọc .env thủ công (script chạy ngoài Next.js)
const env = {}
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0 && !line.trim().startsWith('#')) {
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SECRET_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL / key trong .env')
  process.exit(1)
}
if (/YOUR-PROJECT-REF|your-project|example|placeholder/i.test(url) || /YOUR|placeholder/i.test(key.slice(0, 20))) {
  console.error('!!! .env ĐANG LÀ PLACEHOLDER - chưa điền thông tin Supabase thật.')
  console.error('    Mở Supabase Dashboard -> Settings -> API, copy:')
  console.error('    - Project URL       -> NEXT_PUBLIC_SUPABASE_URL')
  console.error('    - anon public key   -> NEXT_PUBLIC_SUPABASE_ANON_KEY')
  console.error('    - service_role key  -> SUPABASE_SERVICE_ROLE_KEY (thêm dòng mới)')
  console.error('    Sau đó chạy lại: node scripts/check-db.mjs')
  process.exit(1)
}
const supabase = createClient(url, key)

let missing = 0

async function checkColumn(table, column, migration) {
  const { error } = await supabase.from(table).select(column).limit(1)
  if (error && (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST204' || /does not exist|could not find/i.test(error.message))) {
    console.log(`[THIẾU] ${table}.${column}  <- chạy ${migration}`)
    missing++
  } else {
    console.log(`[OK]    ${table}.${column}`)
  }
}

async function checkTable(table, migration) {
  const { error } = await supabase.from(table).select('id').limit(1)
  if (error && (error.code === '42P01' || /does not exist|relation/i.test(error.message))) {
    console.log(`[THIẾU] bảng ${table}  <- chạy ${migration}`)
    missing++
  } else {
    console.log(`[OK]    bảng ${table}`)
  }
}

async function checkFunction(name, args, migration) {
  const { error } = await supabase.rpc(name, args)
  // PGRST202 = function không tồn tại; lỗi khác (quyền, tham số...) = function CÓ
  if (error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message))) {
    console.log(`[THIẾU] function ${name}()  <- chạy ${migration}`)
    missing++
  } else {
    console.log(`[OK]    function ${name}()`)
  }
}

console.log('=== KIỂM TRA DATABASE:', url, '===\n')

console.log('-- Migration 001-009 (core) --')
await checkTable('organizations', '001')
await checkTable('classes', '001')
await checkTable('class_sessions', '001')
await checkTable('attendance', '001')
await checkTable('subjects', '003')
await checkFunction('is_authorized', { p_user_id: '00000000-0000-0000-0000-000000000000', p_target_org_id: '00000000-0000-0000-0000-000000000000', p_required_role: 'teacher' }, '005')
await checkTable('invoices', '007')
await checkTable('grades', '008')
await checkTable('class_results', '008')
await checkTable('enrollments', '009')

console.log('\n-- Migration 010-023 (modules) --')
await checkTable('teacher_contracts', '010/012')
await checkTable('payrolls', '010/012')
await checkTable('rate_modifiers', '012')
await checkTable('assessment_types', '011')
await checkTable('student_warnings', '011')
await checkColumn('class_sessions', 'status', '013')
await checkTable('leads', '014')
await checkTable('lead_activities', '014')
await checkColumn('profiles', 'can_view_financials', '015')
await checkTable('vw_teacher_contracts_secure', '015 (view)')
await checkTable('org_settings', '016')
await checkFunction('get_org_effective_config', { p_org_id: '00000000-0000-0000-0000-000000000000' }, '016')
await checkTable('org_ai_settings', '017')
await checkColumn('lesson_materials', 'org_id', '018')
await checkTable('org_custom_fields', '019')
await checkColumn('profiles', 'custom_metadata', '019')
await checkTable('user_settings', '020')
await checkTable('student_ai_chats', '021')
await checkTable('evaluation_campaigns', '022')
await checkTable('evaluation_tokens', '022')
await checkTable('evaluation_results', '022')
await checkColumn('assessments', 'grading_deadline', '023')
await checkColumn('class_results', 'lock_status', '023')
await checkTable('exam_bank', '024')

console.log('\n-- Migration 025 (LMS Online) --')
await checkTable('lms_lessons', '025')
await checkTable('lms_assignments', '025')
await checkTable('lms_submissions', '025')
await checkTable('lms_quizzes', '025')
await checkTable('lms_quiz_questions', '025')
await checkTable('lms_quiz_attempts', '025')
await checkFunction('is_class_teacher', { p_class_id: '00000000-0000-0000-0000-000000000000' }, '025')

console.log('\n-- Migration 026 (vá drift + gia cố LMS) --')
// Test HÀNH VI constraint role: id ngẫu nhiên không có trong auth.users
// -> CHECK constraint chạy TRƯỚC FK trigger, nên:
//    23514 (check_violation) = constraint CŨ (thiếu admission_staff)
//    23503 (FK violation)    = constraint ĐÃ ĐÚNG, row không được tạo
{
  const { error } = await supabase.from('profiles').insert({
    id: '00000000-0000-4000-8000-00000000dead',
    full_name: '__check_db__',
    role: 'admission_staff',
  })
  if (error && error.code === '23514') {
    console.log('[THIẾU] profiles_role_check chưa có admission_staff  <- chạy 026_lms_hardening.sql')
    missing++
  } else {
    console.log('[OK]    profiles_role_check đã gồm admission_staff')
    // Phòng hờ: nếu vì lý do nào đó row được tạo thật thì dọn ngay
    if (!error) await supabase.from('profiles').delete().eq('id', '00000000-0000-4000-8000-00000000dead')
  }
}

console.log('\n-- Migration 027 (sổ đầu bài điện tử) --')
await checkColumn('class_sessions', 'session_note', '027_attendance_notes.sql')
await checkColumn('class_sessions', 'parent_note', '027_attendance_notes.sql')

console.log('\n-- Migration 028 (mã học viên theo cơ sở) --')
await checkColumn('profiles', 'student_code', '028_student_codes.sql')

console.log('\n-- Migration 029 (đơn từ giáo viên: đề xuất lịch / xin nghỉ) --')
await checkTable('teacher_requests', '029_teacher_requests.sql')

console.log('\n-- Migration 030 (vận hành: thông báo chung, vòng đời ghi danh, sĩ số) --')
await checkTable('announcements', '030_operations.sql')
await checkColumn('enrollments', 'status_note', '030_operations.sql')
await checkColumn('classes', 'max_students', '030_operations.sql')

console.log('\n-- Migration 999_final_rls_patch (BẢO MẬT) --')
await checkFunction('is_org_related', { p_target_org_id: '00000000-0000-0000-0000-000000000000' }, '999_final_rls_patch')
await checkFunction('teaches_student', { p_student_id: '00000000-0000-0000-0000-000000000000' }, '999_final_rls_patch')
await checkFunction('is_my_session', { p_session_id: '00000000-0000-0000-0000-000000000000' }, '999_final_rls_patch')
await checkFunction('is_enrolled_in_class', { p_class_id: '00000000-0000-0000-0000-000000000000' }, '999_final_rls_patch')

console.log('\n-- Cấu hình môi trường --')
console.log(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY ? '[OK]    Key admin server-side (SERVICE_ROLE hoặc SECRET_KEY) có trong .env' : '[THIẾU] SUPABASE_SERVICE_ROLE_KEY hoặc SUPABASE_SECRET_KEY  <- Supabase Dashboard -> Settings -> API')
console.log(env.OPENAI_API_KEY ? '[OK]    OPENAI_API_KEY' : '[THIẾU] OPENAI_API_KEY')
console.log(env.N8N_WEBHOOK_URL ? '[OK]    N8N_WEBHOOK_URL' : '[--]    N8N_WEBHOOK_URL (tùy chọn)')
const r2Ok = env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME
console.log(r2Ok ? '[OK]    Cloudflare R2 (4 biến R2_*)' : '[--]    Cloudflare R2 chưa cấu hình (tùy chọn - cần cho upload file LMS)')

console.log(missing === 0 ? '\n>>> DATABASE ĐẦY ĐỦ - không thiếu migration nào.' : `\n>>> THIẾU ${missing} hạng mục - chạy các file migration được ghi chú ở trên trong Supabase SQL Editor.`)
