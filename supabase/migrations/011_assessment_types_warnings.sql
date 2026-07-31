-- ============================================================
-- GDTX ERP - 011_assessment_types_warnings
-- Nâng cấp Module Khảo thí + Hệ thống Cảnh báo học vụ sớm:
--   1. assessment_types : loại bài kiểm tra chuẩn hóa (Miệng/15 phút/
--      Giữa kỳ/Cuối kỳ) với hệ số weight tập trung 1 chỗ.
--   2. assessments      : thêm type_id + test_date.
--   3. grades           : siết CHECK điểm trong khoảng 0-10.
--   4. vw_student_attendance_stats : View thống kê điểm danh.
--   5. student_warnings : cờ cảnh báo (vắng nhiều / học yếu).
-- ============================================================

-- 1. BẢNG assessment_types --------------------------------------
create table if not exists public.assessment_types (
  id          uuid primary key default uuid_generate_v4(),
  -- org_id NULL = loại dùng chung toàn hệ thống; có giá trị = riêng org đó
  org_id      uuid references public.organizations (id),
  name        text not null,                      -- Miệng, 15 phút, Giữa kỳ, Cuối kỳ
  weight      numeric(4, 2) not null default 1 check (weight > 0), -- hệ số 1, 2, 3
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_assessment_types_org on public.assessment_types (org_id);

drop trigger if exists trg_assessment_types_updated_at on public.assessment_types;
create trigger trg_assessment_types_updated_at
  before update on public.assessment_types
  for each row execute function public.set_updated_at();

-- Seed 4 loại chuẩn dùng chung (org_id NULL), không seed trùng khi chạy lại
insert into public.assessment_types (org_id, name, weight)
select null, t.name, t.weight
from (values
  ('Miệng',    1::numeric),
  ('15 phút',  1::numeric),
  ('Giữa kỳ',  2::numeric),
  ('Cuối kỳ',  3::numeric)
) as t(name, weight)
where not exists (
  select 1 from public.assessment_types at
  where at.name = t.name and at.org_id is null and at.deleted_at is null
);

-- 2. NÂNG CẤP assessments ---------------------------------------
alter table public.assessments
  add column if not exists type_id uuid references public.assessment_types (id),
  add column if not exists test_date date;

create index if not exists idx_assessments_type on public.assessments (type_id);

-- 3. SIẾT grades: điểm PHẢI trong khoảng 0-10 -------------------
-- (đồng bộ với zod gradeScoreSchema phía ứng dụng)
update public.grades set score = 10 where score > 10; -- chuẩn hóa dữ liệu cũ nếu có
alter table public.grades drop constraint if exists grades_score_check;
alter table public.grades
  add constraint grades_score_check check (score >= 0 and score <= 10);

-- 4. VIEW THỐNG KÊ ĐIỂM DANH ------------------------------------
-- Gom nhóm theo (student_id, class_id): tổng buổi, có mặt (present/late),
-- vắng phép (excused), vắng không phép (absent).
-- security_invoker: View chạy dưới quyền NGƯỜI GỌI -> RLS của
-- attendance/class_sessions vẫn được áp dụng, không phá multi-tenant.
drop view if exists public.vw_student_attendance_stats;
create view public.vw_student_attendance_stats
with (security_invoker = true)
as
select
  a.student_id,
  cs.class_id,
  c.org_id,
  count(*)::int                                                   as total_sessions,
  count(*) filter (where a.status in ('present', 'late'))::int    as present_count,
  count(*) filter (where a.status = 'excused')::int               as excused_count,
  count(*) filter (where a.status = 'absent')::int                as unexcused_count
from public.attendance a
join public.class_sessions cs on cs.id = a.session_id and cs.deleted_at is null
join public.classes c on c.id = cs.class_id and c.deleted_at is null
where a.deleted_at is null
group by a.student_id, cs.class_id, c.org_id;

-- 5. BẢNG student_warnings (Cờ cảnh báo học vụ) -----------------
create table if not exists public.student_warnings (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  student_id    uuid not null references public.profiles (id),
  class_id      uuid not null references public.classes (id),
  -- attendance = vắng nhiều (cờ ĐỎ) | grade = học yếu (cờ CAM)
  warning_type  text not null check (warning_type in ('attendance', 'grade')),
  description   text not null,
  -- new -> notified (đã bắn Zalo phụ huynh) -> resolved
  status        text not null default 'new'
                check (status in ('new', 'notified', 'resolved')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- Mỗi (HS, lớp, loại cảnh báo) chỉ 1 dòng: quét lại = cập nhật mô tả
  constraint uq_warnings_student_class_type unique (student_id, class_id, warning_type)
);

create index if not exists idx_student_warnings_org on public.student_warnings (org_id);
create index if not exists idx_student_warnings_student on public.student_warnings (student_id);
create index if not exists idx_student_warnings_status on public.student_warnings (status);

drop trigger if exists trg_student_warnings_updated_at on public.student_warnings;
create trigger trg_student_warnings_updated_at
  before update on public.student_warnings
  for each row execute function public.set_updated_at();

-- 6. RLS ---------------------------------------------------------
alter table public.assessment_types enable row level security;
alter table public.student_warnings enable row level security;

drop policy if exists "assessment_types_read_all_auth" on public.assessment_types;
drop policy if exists "assessment_types_manage_admin_staff" on public.assessment_types;
drop policy if exists "warnings_admin_staff" on public.student_warnings;

-- Mọi user đăng nhập được ĐỌC loại bài kiểm tra (dùng chung hoặc trong subtree)
create policy "assessment_types_read_all_auth"
  on public.assessment_types for select
  using (
    deleted_at is null
    and (org_id is null or public.is_org_in_my_subtree(org_id)
         or public.get_my_role() = 'super_admin')
  );

-- Chỉ admin/staff được thêm/sửa loại riêng của org mình
create policy "assessment_types_manage_admin_staff"
  on public.assessment_types for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and org_id is not null
      and public.is_org_in_my_subtree(org_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and org_id is not null
      and public.is_org_in_my_subtree(org_id)
    )
  );

-- Cảnh báo học vụ: admin/staff trong subtree toàn quyền
create policy "warnings_admin_staff"
  on public.student_warnings for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );
