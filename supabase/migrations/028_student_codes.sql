-- ============================================================
-- 028 - MÃ HỌC VIÊN GẮN MÃ CƠ SỞ
--
-- profiles.student_code: mã định danh học viên, sinh tự động khi
-- tạo học viên theo QUY TẮC do từng cơ sở tự chọn (org_settings):
--   1. org_year_seq : {MÃ CƠ SỞ}-{NĂM}-{SỐ TT 4 chữ số}  VD: CS1-2026-0042
--   2. org_seq      : {MÃ CƠ SỞ}{SỐ TT 5 chữ số}          VD: CS100042
--   3. year_org_seq : {NĂM 2 SỐ}{MÃ CƠ SỞ}{SỐ TT 4 chữ số} VD: 26CS10042
--
-- Mã cơ sở (org_code) + quy tắc (student_code_format) lưu trong
-- org_settings.config (kế thừa HQ -> Cụm -> Cơ sở như mọi cài đặt).
-- Idempotent: chạy lại không lỗi.
-- ============================================================

alter table public.profiles
  add column if not exists student_code text;

-- Duy nhất trong phạm vi một cơ sở (cho phép org khác trùng mã)
create unique index if not exists uq_profiles_student_code
  on public.profiles (org_id, student_code)
  where student_code is not null and deleted_at is null;

-- Tra cứu nhanh theo mã
create index if not exists idx_profiles_student_code
  on public.profiles (student_code)
  where student_code is not null;

comment on column public.profiles.student_code is
  'Mã học viên sinh theo quy tắc của cơ sở (org_settings: org_code + student_code_format)';
