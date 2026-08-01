-- ============================================================
-- 027 - SỔ ĐẦU BÀI ĐIỆN TỬ cho buổi học
--
-- Bổ sung 2 cột vào class_sessions:
--   session_note : nhận xét chung buổi học / tình hình lớp
--                  (giáo viên ghi, staff + admin xem)
--   parent_note  : dặn dò phụ huynh - hiển thị trong Sổ Liên Lạc
--                  điện tử của phụ huynh (parent portal)
--
-- attendance.note (đã có từ 001) = nhận xét TỪNG học sinh trong buổi.
-- Idempotent: chạy lại không lỗi.
-- ============================================================

alter table public.class_sessions
  add column if not exists session_note text,
  add column if not exists parent_note text;

comment on column public.class_sessions.session_note is
  'Nhận xét chung buổi học/lớp (sổ đầu bài điện tử) - GV ghi khi điểm danh';
comment on column public.class_sessions.parent_note is
  'Dặn dò phụ huynh của buổi học - hiển thị trong Sổ Liên Lạc phụ huynh';
