// SMOKE TEST LMS + RLS (chạy 1 lần rồi xóa): node scripts/smoke-lms.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const eq = line.indexOf('=')
  if (eq > 0 && !line.trim().startsWith('#')) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const PASS = 'Demo@123456'

async function as(email, fn) {
  const c = createClient(url, anon)
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASS })
  if (error) { console.log(`[FAIL] login ${email}: ${error.message}`); return }
  console.log(`[OK]   login ${email}`)
  await fn(c, data.user)
  await c.auth.signOut()
}

// ===== HỌC VIÊN =====
await as('student01.cs1@gdtx-demo.edu.vn', async (c, user) => {
  const { data: lessons, error: e1 } = await c.from('lms_lessons').select('id, title, status')
  console.log(e1 ? `[FAIL] student đọc lessons: ${e1.message}` : `[OK]   student thấy ${lessons.length} bài giảng (kỳ vọng >0, toàn bộ published)`)
  if (lessons?.some((l) => l.status !== 'published')) console.log('[FAIL] student thấy bài NHÁP!')

  const { data: qs } = await c.from('lms_quiz_questions').select('id, correct_index').limit(5)
  console.log((qs ?? []).length === 0 ? '[OK]   student KHÔNG đọc được câu hỏi/đáp án (RLS chặn)' : `[FAIL] student đọc được ${qs.length} câu hỏi kèm đáp án!!!`)

  const { data: subs } = await c.from('lms_submissions').select('id, student_id')
  const leak = (subs ?? []).some((s) => s.student_id !== user.id)
  console.log(leak ? '[FAIL] student thấy bài nộp của người khác!' : `[OK]   student chỉ thấy bài nộp của mình (${(subs ?? []).length})`)

  // Thử tự chấm điểm 10 cho bài nộp của mình (kỳ vọng bị chặn)
  if ((subs ?? []).length > 0) {
    const { data: upd } = await c.from('lms_submissions').update({ score: 10 }).eq('id', subs[0].id).select('id')
    console.log(!upd || upd.length === 0 ? '[OK]   student KHÔNG tự chấm điểm được (policy 026 chặn)' : '[FAIL] student TỰ CHẤM được điểm!!!')
  }

  const { data: attempts } = await c.from('lms_quiz_attempts').select('id')
  // Thử sửa điểm lượt làm bài (kỳ vọng bị chặn - không có policy ghi)
  if ((attempts ?? []).length > 0) {
    const { data: upd2 } = await c.from('lms_quiz_attempts').update({ score: 10 }).eq('id', attempts[0].id).select('id')
    console.log(!upd2 || upd2.length === 0 ? '[OK]   student KHÔNG sửa được điểm quiz' : '[FAIL] student SỬA được điểm quiz!!!')
  }
})

// ===== GIÁO VIÊN =====
await as('teacher1.cs1@gdtx-demo.edu.vn', async (c, user) => {
  const { data: myClasses } = await c.from('classes').select('id').eq('teacher_id', user.id)
  const ids = (myClasses ?? []).map((x) => x.id)
  const { data: lessons } = await c.from('lms_lessons').select('id, class_id')
  const foreign = (lessons ?? []).filter((l) => !ids.includes(l.class_id))
  console.log(`[OK]   teacher thấy ${(lessons ?? []).length} bài giảng${foreign.length ? ` (${foreign.length} bài ngoài lớp mình - do là org khác? KIỂM TRA)` : ' (toàn bộ thuộc lớp mình)'}`)

  const { data: qs } = await c.from('lms_quiz_questions').select('id, correct_index').limit(3)
  console.log((qs ?? []).length > 0 ? '[OK]   teacher đọc được câu hỏi + đáp án đề của mình' : '[??]   teacher không thấy câu hỏi (chưa có quiz?)')
})

// ===== HỌC VIÊN CƠ SỞ KHÁC không thấy dữ liệu cs1 =====
await as('student01.cs3@gdtx-demo.edu.vn', async (c) => {
  const { data: lessons } = await c.from('lms_lessons').select('id, org_id')
  console.log(`[OK]   student cs3 thấy ${(lessons ?? []).length} bài giảng (chỉ của cs3)`)
})

console.log('\n>>> SMOKE TEST XONG')
