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

console.log('\n-- Migration 031 (khảo thí: dạy thay/bù, lịch thi, giám thị, phúc khảo) --')
await checkTable('exam_schedules', '031_exam_ops.sql')
await checkTable('exam_proctors', '031_exam_ops.sql')
await checkColumn('class_sessions', 'is_makeup', '031_exam_ops.sql')
await checkColumn('class_sessions', 'substitute_teacher_id', '031_exam_ops.sql')
await checkColumn('grades', 'review_status', '031_exam_ops.sql')

console.log('\n-- Migration 032 (cổng dịch vụ E-Ticketing + approval workflows) --')
await checkTable('ticket_categories', '032_ticketing_workflows.sql')
await checkTable('tickets', '032_ticketing_workflows.sql')
await checkTable('ticket_approvals', '032_ticketing_workflows.sql')

console.log('\n-- Migration 033 (sổ đầu bài điện tử + đặt phòng/thiết bị) --')
await checkColumn('class_sessions', 'diary_notes', '033_diary_facilities.sql')
await checkTable('facilities', '033_diary_facilities.sql')
await checkTable('facility_bookings', '033_diary_facilities.sql')
await checkFunction(
  'check_facility_conflict',
  {
    p_facility_id: '00000000-0000-0000-0000-000000000000',
    p_start_time: new Date().toISOString(),
    p_end_time: new Date(Date.now() + 3600_000).toISOString(),
  },
  '033_diary_facilities.sql'
)

console.log('\n-- Migration 034 (cá nhân hóa giao diện: user_preferences, layout templates) --')
await checkTable('user_preferences', '034_user_preferences.sql')
await checkTable('global_layout_templates', '034_user_preferences.sql')

console.log('\n-- Migration 035 (hồ sơ đào tạo kép GDNN-GDTX) --')
await checkColumn('profiles', 'MaSV', '035_dual_track_profiles.sql')
await checkTable('vocational_records', '035_dual_track_profiles.sql')
await checkTable('academic_records', '035_dual_track_profiles.sql')

console.log('\n-- Migration 036 (khảo thí chuyên sâu: mã đề, thi lại/phúc khảo) --')
await checkTable('exam_variants', '036_assessment_workflows.sql')
await checkTable('re_examination_requests', '036_assessment_workflows.sql')

console.log('\n-- Migration 037 (B2B Portal: doanh nghiệp liên kết, thực tập) --')
await checkTable('enterprises', '037_b2b_portal.sql')
await checkTable('internships', '037_b2b_portal.sql')
await checkColumn('profiles', 'enterprise_id', '037_b2b_portal.sql')
await checkColumn('vocational_records', 'practice_score', '037_b2b_portal.sql')
await checkFunction('get_my_enterprise_id', {}, '037_b2b_portal.sql')

console.log('\n-- Migration 038 (ghi nhận hành vi + cảnh báo tâm lý) --')
await checkTable('behavior_logs', '038_behavioral_tracking.sql')

console.log('\n-- Migration 039 (LMS: tiến độ học bài giảng) --')
await checkTable('lms_lesson_progress', '039_lms_progress.sql')

console.log('\n-- Migration 040 (thông báo cá nhân + nhắc học phí) --')
await checkTable('user_notifications', '040_notifications.sql')

console.log('\n-- Migration 041 (sổ tài sản & khấu hao) --')
await checkTable('assets', '041_assets.sql')
await checkTable('asset_logs', '041_assets.sql')

console.log('\n-- Migration 042 (báo cáo tổng quan 1 round-trip) --')
await checkFunction('get_overview_report', { p_org_ids: [] }, '042_overview_report.sql')

console.log('\n-- Migration 043 (ma trận phân quyền menu động) --')
await checkTable('menu_permissions', '043_menu_permissions.sql')
await checkFunction('get_my_menu_keys', {}, '043_menu_permissions.sql')

console.log('\n-- Migration 044 (tầng license - bán account cơ sở) --')
await checkTable('tenant_licenses', '044_tenant_licenses.sql')
await checkFunction('get_my_license', {}, '044_tenant_licenses.sql')

console.log('\n-- Migration 045 (slug cổng /coso/[slug] theo cơ sở) --')
await checkColumn('organizations', 'slug', '045_org_slugs.sql')
await checkFunction('get_public_campus_by_slug', { p_slug: 'demo' }, '045_org_slugs.sql')
await checkFunction('list_public_campuses', {}, '045_org_slugs.sql')

console.log('\n-- Migration 049 (user grants kiêm nhiệm) --')
await checkTable('user_menu_permissions', '049_user_grants.sql')

console.log('\n-- Migration 050 (tài khoản phụ huynh email+password) --')
await checkTable('parent_accounts', '050_parent_accounts.sql')

console.log('\n-- Migration 051 (logo thương hiệu theo tổ chức) --')
await checkColumn('organizations', 'logo_url', '051_org_logo.sql')
await checkColumn('organizations', 'logo_key', '051_org_logo.sql')

console.log('\n-- Migration 052 (CRM tuyển sinh chuyên nghiệp) --')
await checkColumn('leads', 'source', '052_crm_admissions_pro.sql')
await checkColumn('leads', 'priority', '052_crm_admissions_pro.sql')
await checkColumn('leads', 'next_follow_up_at', '052_crm_admissions_pro.sql')
await checkColumn('leads', 'appointment_at', '052_crm_admissions_pro.sql')
await checkColumn('leads', 'lost_reason', '052_crm_admissions_pro.sql')
await checkColumn('lead_activities', 'deleted_at', '052_crm_admissions_pro.sql')

console.log('\n-- Migration 053 (CRM hồ sơ đầy đủ + AI settings) --')
await checkColumn('leads', 'cccd', '053_crm_lead_profile_ai.sql')
await checkColumn('leads', 'career_interest', '053_crm_lead_profile_ai.sql')
await checkColumn('leads', 'interests', '053_crm_lead_profile_ai.sql')
await checkColumn('leads', 'call_summary', '053_crm_lead_profile_ai.sql')
await checkColumn('leads', 'custom_metadata', '053_crm_lead_profile_ai.sql')
await checkColumn('profiles', 'cccd', '053_crm_lead_profile_ai.sql')
await checkColumn('profiles', 'parent_name', '053_crm_lead_profile_ai.sql')

console.log('\n-- Migration 054 (CRM tư vấn + đóng tiền) --')
await checkColumn('leads', 'strengths', '054_crm_counseling_payment.sql')
await checkColumn('leads', 'weaknesses', '054_crm_counseling_payment.sql')
await checkColumn('leads', 'needs', '054_crm_counseling_payment.sql')
await checkColumn('leads', 'potential_rating', '054_crm_counseling_payment.sql')
await checkColumn('leads', 'deposit_amount', '054_crm_counseling_payment.sql')
await checkColumn('leads', 'payment_notes', '054_crm_counseling_payment.sql')

console.log('\n-- Migration 055 (cảnh báo học vụ ops) --')
await checkColumn('student_warnings', 'severity', '055_academic_warnings_ops.sql')
await checkColumn('student_warnings', 'handler_notes', '055_academic_warnings_ops.sql')
await checkColumn('student_warnings', 'handled_by', '055_academic_warnings_ops.sql')

console.log('\n-- Migration 056 (chức danh + mẫu quyền) --')
await checkTable('job_titles', '056_job_titles.sql')
await checkColumn('profiles', 'job_title_id', '056_job_titles.sql')

console.log('\n-- Migration 057 (ngày nghỉ TKB) --')
await checkTable('org_holidays', '057_org_holidays.sql')

console.log('\n-- Migration 058 (kế hoạch xếp lịch lớp) --')
await checkTable('class_schedule_plans', '058_class_schedule_plans.sql')

console.log('\n-- Migration 059 (phân công công việc) --')
await checkTable('work_tasks', '059_work_tasks.sql')
await checkTable('work_task_assignees', '059_work_tasks.sql')

console.log('\n-- Migration 060 (facility_id buổi học) --')
await checkColumn('class_sessions', 'facility_id', '060_session_facility_id.sql')

console.log('\n-- Migration 061 (curriculum subjects) --')
await checkColumn('subjects', 'code', '061_curriculum_subjects.sql')
await checkColumn('subjects', 'credits', '061_curriculum_subjects.sql')
await checkColumn('subjects', 'total_periods', '061_curriculum_subjects.sql')

console.log('\n-- Migration 062 (tuition_rules) --')
await checkTable('tuition_rules', '062_tuition_rules.sql')

console.log('\n-- Migration 063 (GV ngành + môn) --')
await checkColumn('profiles', 'teaching_major', '063_teacher_subjects.sql')
await checkTable('teacher_subjects', '063_teacher_subjects.sql')

console.log('\n-- Migration 064 (lớp hành chính + class_teachers) --')
await checkTable('class_groups', '064_class_groups_teachers.sql')
await checkTable('class_group_members', '064_class_groups_teachers.sql')
await checkColumn('classes', 'group_id', '064_class_groups_teachers.sql')
await checkTable('class_teachers', '064_class_groups_teachers.sql')

console.log('\n-- Migration 065 (LMS rubric) --')
await checkTable('lms_rubrics', '065_lms_rubrics.sql')
await checkTable('lms_rubric_criteria', '065_lms_rubrics.sql')
await checkTable('lms_rubric_levels', '065_lms_rubrics.sql')
await checkTable('lms_submission_grades', '065_lms_rubrics.sql')

console.log('\n-- Migration 067 (HR phép / ngày công / lương VP) --')
await checkTable('hr_leave_balances', '067_hr_leave_workdays.sql')
await checkTable('hr_leave_requests', '067_hr_leave_workdays.sql')
await checkTable('hr_workday_overrides', '067_hr_leave_workdays.sql')
await checkTable('staff_salary_terms', '067_hr_leave_workdays.sql')

console.log('\n-- Migration 068 (MaSV ↔ student_code sync) --')
console.log(
  '[INFO] 068_masv_student_code_sync.sql = data backfill (chạy SQL Editor). Không thêm bảng mới.'
)

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
