-- ============================================================
-- 038: GHI NHẬN HÀNH VI + CẢNH BÁO TÂM LÝ (chống bỏ học)
-- (Yêu cầu gốc đặt tên 018 nhưng repo đã tới 037 -> đánh số 038)
--
-- behavior_logs: điểm rèn luyện của học sinh theo từng lần ghi nhận
--   points ÂM = phạt (ngủ gật, gây rối, không làm bài tập...)
--   points DƯƠNG = thưởng (tiến bộ, hăng hái phát biểu...)
--
-- Cảnh báo tâm lý chạy ở Server Action (logBehavior): sau mỗi lần
-- ghi nhận, nếu TỔNG điểm trong THÁNG của học sinh rớt xuống dưới
-- ngưỡng (setting behavior_alert_threshold, mặc định -15) hệ thống
-- TỰ tạo ticket "Tư vấn Tâm lý Đặc biệt" gán cho academic_staff.
-- ============================================================

create table if not exists public.behavior_logs (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  student_id   uuid not null references public.profiles (id),
  recorded_by  uuid not null references public.profiles (id),
  -- Âm là phạt, dương là thưởng; chặn giá trị vô lý
  points       int not null check (points between -100 and 100 and points <> 0),
  category     text not null,
  description  text,
  -- Buổi học phát sinh ghi nhận (nếu ghi từ màn điểm danh)
  session_id   uuid references public.class_sessions (id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_behavior_logs_student_time
  on public.behavior_logs (student_id, created_at desc) where deleted_at is null;
create index if not exists idx_behavior_logs_org
  on public.behavior_logs (org_id) where deleted_at is null;

-- ----- RLS -----
alter table public.behavior_logs enable row level security;

drop policy if exists "behavior_logs_super_admin_all" on public.behavior_logs;
drop policy if exists "behavior_logs_staff_all" on public.behavior_logs;
drop policy if exists "behavior_logs_teacher_insert" on public.behavior_logs;
drop policy if exists "behavior_logs_teacher_select" on public.behavior_logs;
drop policy if exists "behavior_logs_student_select" on public.behavior_logs;

create policy "behavior_logs_super_admin_all"
  on public.behavior_logs for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "behavior_logs_staff_all"
  on public.behavior_logs for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Giáo viên ghi nhận hành vi trong org của mình, đứng tên chính mình
create policy "behavior_logs_teacher_insert"
  on public.behavior_logs for insert
  with check (
    public.get_my_role() = 'teacher'
    and recorded_by = auth.uid()
    and org_id = public.get_my_org_id()
  );

-- Giáo viên xem lại các ghi nhận do CHÍNH MÌNH tạo
create policy "behavior_logs_teacher_select"
  on public.behavior_logs for select
  using (recorded_by = auth.uid() and deleted_at is null);

-- Học sinh xem điểm rèn luyện của CHÍNH MÌNH
create policy "behavior_logs_student_select"
  on public.behavior_logs for select
  using (student_id = auth.uid() and deleted_at is null);

comment on table public.behavior_logs is
  'Điểm rèn luyện: âm = phạt, dương = thưởng. Tổng theo tháng dưới ngưỡng -> auto ticket Tư vấn Tâm lý Đặc biệt';
