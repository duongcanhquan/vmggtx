-- ============================================================
-- 031 - GIÁO VỤ & KHẢO THÍ VẬN HÀNH THỰC TẾ
--
-- 1) class_sessions : Điều phối lịch - dạy thay / dạy bù
--      is_makeup             buổi DẠY BÙ (được xếp thay buổi hủy)
--      original_session_id   trỏ về buổi gốc bị hủy
--      substitute_teacher_id giáo viên DẠY THAY (giữ teacher_id gốc
--                            để lương/lịch sử vẫn truy vết được)
-- 2) exam_schedules + exam_proctors : Lịch thi + phân công giám thị
-- 3) grades : Phúc khảo - review_status ('under_review'/'resolved')
--
-- [ĐA TẦNG] Mọi bảng mới đều có org_id + RLS theo subtree
-- (get_my_role/is_org_in_my_subtree) đúng thiết kế ltree.
-- Idempotent: chạy lại không lỗi.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) ĐIỀU PHỐI LỊCH HỌC (dạy thay / dạy bù)
-- ---------------------------------------------------------------
alter table public.class_sessions
  add column if not exists is_makeup boolean not null default false,
  add column if not exists original_session_id uuid references public.class_sessions (id),
  add column if not exists substitute_teacher_id uuid references public.profiles (id);

create index if not exists idx_class_sessions_original
  on public.class_sessions (original_session_id)
  where original_session_id is not null;

comment on column public.class_sessions.is_makeup is
  'true = buổi DẠY BÙ được xếp thay cho buổi gốc bị hủy';
comment on column public.class_sessions.substitute_teacher_id is
  'Giáo viên DẠY THAY buổi này (teacher_id gốc giữ nguyên để truy vết)';

-- ---------------------------------------------------------------
-- 2) LỊCH THI + GIÁM THỊ
-- ---------------------------------------------------------------
create table if not exists public.exam_schedules (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  assessment_id uuid not null references public.assessments (id),
  room          text not null,               -- tên phòng thi (P.201, Hội trường A...)
  capacity      integer check (capacity is null or capacity > 0),
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  note          text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint chk_exam_time check (end_time > start_time)
);

create index if not exists idx_exam_schedules_org
  on public.exam_schedules (org_id, start_time);
create index if not exists idx_exam_schedules_assessment
  on public.exam_schedules (assessment_id);

drop trigger if exists trg_exam_schedules_updated_at on public.exam_schedules;
create trigger trg_exam_schedules_updated_at
  before update on public.exam_schedules
  for each row execute function public.set_updated_at();

create table if not exists public.exam_proctors (
  id                uuid primary key default uuid_generate_v4(),
  exam_schedule_id  uuid not null references public.exam_schedules (id) on delete cascade,
  teacher_id        uuid not null references public.profiles (id),
  role              text not null default 'proctor_1'
                    check (role in ('proctor_1', 'proctor_2')),
  created_at        timestamptz not null default now(),
  constraint uq_exam_proctor unique (exam_schedule_id, teacher_id)
);

create index if not exists idx_exam_proctors_teacher
  on public.exam_proctors (teacher_id);

-- ----- RLS -----
alter table public.exam_schedules enable row level security;
alter table public.exam_proctors enable row level security;

drop policy if exists "exam_schedules_super_admin_all" on public.exam_schedules;
drop policy if exists "exam_schedules_staff_all" on public.exam_schedules;
drop policy if exists "exam_schedules_member_select" on public.exam_schedules;
drop policy if exists "exam_proctors_super_admin_all" on public.exam_proctors;
drop policy if exists "exam_proctors_staff_all" on public.exam_proctors;
drop policy if exists "exam_proctors_teacher_select" on public.exam_proctors;

create policy "exam_schedules_super_admin_all"
  on public.exam_schedules for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "exam_schedules_staff_all"
  on public.exam_schedules for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- GV/HS trong cơ sở được XEM lịch thi của org mình
create policy "exam_schedules_member_select"
  on public.exam_schedules for select
  using (org_id = public.get_my_org_id() or public.is_org_in_my_subtree(org_id));

create policy "exam_proctors_super_admin_all"
  on public.exam_proctors for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Giáo vụ quản lý giám thị theo lịch thi mà mình thấy được
create policy "exam_proctors_staff_all"
  on public.exam_proctors for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and exists (
      select 1 from public.exam_schedules es
      where es.id = exam_schedule_id and public.is_org_in_my_subtree(es.org_id)
    )
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and exists (
      select 1 from public.exam_schedules es
      where es.id = exam_schedule_id and public.is_org_in_my_subtree(es.org_id)
    )
  );

-- Giáo viên xem phân công giám thị của CHÍNH MÌNH
create policy "exam_proctors_teacher_select"
  on public.exam_proctors for select
  using (teacher_id = auth.uid());

comment on table public.exam_schedules is
  'Lịch thi theo phòng của một bài kiểm tra (assessment) - Khảo thí xếp';
comment on table public.exam_proctors is
  'Phân công giám thị (GT1/GT2) cho từng phòng thi';

-- ---------------------------------------------------------------
-- 3) PHÚC KHẢO ĐIỂM
-- ---------------------------------------------------------------
alter table public.grades
  add column if not exists review_status text
    check (review_status is null or review_status in ('under_review', 'resolved')),
  add column if not exists review_reason text,
  add column if not exists review_requested_at timestamptz;

create index if not exists idx_grades_review
  on public.grades (org_id, review_status)
  where review_status = 'under_review';

comment on column public.grades.review_status is
  'null = bình thường | under_review = HS yêu cầu phúc khảo | resolved = đã xử lý';
