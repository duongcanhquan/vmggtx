-- ============================================================
-- 067: Đồng bộ MaSV ↔ student_code (QA-FIX A)
--
-- Vấn đề: createStudent/CRM chỉ ghi student_code; import ghi MaSV
-- + generate student_code khác → login (MaSV) lệch list (student_code).
-- Backfill dữ liệu cũ: ưu tiên MaSV có sẵn, không thì lấy student_code.
-- ============================================================

-- 1) MaSV trống nhưng có student_code → copy sang MaSV (UPPER)
update public.profiles
set "MaSV" = upper(trim(student_code))
where deleted_at is null
  and role = 'student'
  and ("MaSV" is null or trim("MaSV") = '')
  and student_code is not null
  and trim(student_code) <> '';

-- 2) student_code trống nhưng có MaSV → copy sang student_code
update public.profiles
set student_code = upper(trim("MaSV"))
where deleted_at is null
  and role = 'student'
  and (student_code is null or trim(student_code) = '')
  and "MaSV" is not null
  and trim("MaSV") <> '';

-- 3) Cả hai có nhưng khác nhau → ưu tiên MaSV (khóa login), sync student_code
update public.profiles
set student_code = upper(trim("MaSV"))
where deleted_at is null
  and role = 'student'
  and "MaSV" is not null
  and trim("MaSV") <> ''
  and student_code is not null
  and upper(trim(student_code)) <> upper(trim("MaSV"));

-- 4) Chuẩn hóa MaSV về UPPER (login so khớp exact sau toUpperCase)
update public.profiles
set "MaSV" = upper(trim("MaSV"))
where deleted_at is null
  and role = 'student'
  and "MaSV" is not null
  and "MaSV" <> upper(trim("MaSV"));
