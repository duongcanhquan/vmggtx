-- ============================================================
-- GDTX ERP - 026_lms_hardening (+ vá drift constraint role)
--
-- 0. VÁ DRIFT: profiles_role_check trên DB thật đang là bản CŨ của
--    migration 005 (thiếu 'admission_staff') dù bảng leads của 014
--    đã tồn tại -> seed tài khoản Tuyển sinh bị từ chối. Chạy lại
--    phần constraint của 014 tại đây.
-- 1. lms_submissions: học viên KHÔNG được tự ghi các cột chấm điểm
--    (score / feedback / graded_by / graded_at). Trước đây policy chỉ
--    check student_id -> gọi thẳng API Supabase có thể tự chấm 10.
-- 2. Chặn nộp bài quá hạn Ở TẦNG DB khi allow_late = false
--    (trước chỉ chặn ở Server Action - gọi thẳng API vẫn lách được).
--
-- Idempotent - chạy lại an toàn.
-- ============================================================

-- 0. VÁ CONSTRAINT ROLE (từ migration 014) --------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'super_admin', 'campus_admin', 'academic_staff',
    'admission_staff', 'teacher', 'student'
  ));

-- 1+2. HỌC VIÊN NỘP BÀI: cấm cột điểm + tôn trọng hạn nộp -----------
drop policy if exists "lms_submissions_student_insert" on public.lms_submissions;
create policy "lms_submissions_student_insert" on public.lms_submissions for insert
  with check (
    student_id = auth.uid()
    -- Cấm học viên tự điền kết quả chấm
    and score is null
    and feedback is null
    and graded_by is null
    and graded_at is null
    and exists (
      select 1 from public.lms_assignments a
      where a.id = assignment_id
        and a.deleted_at is null
        and public.is_enrolled_in_class(a.class_id)
        -- Quá hạn + không cho nộp muộn -> DB từ chối
        and (a.due_at is null or a.due_at > now() or a.allow_late)
    )
  );

drop policy if exists "lms_submissions_student_update" on public.lms_submissions;
create policy "lms_submissions_student_update" on public.lms_submissions for update
  using (student_id = auth.uid() and score is null)   -- đã chấm thì khóa
  with check (
    student_id = auth.uid()
    and score is null
    and feedback is null
    and graded_by is null
    and graded_at is null
    and exists (
      select 1 from public.lms_assignments a
      where a.id = assignment_id
        and a.deleted_at is null
        and public.is_enrolled_in_class(a.class_id)
        and (a.due_at is null or a.due_at > now() or a.allow_late)
    )
  );
