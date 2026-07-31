-- ============================================================
-- GDTX ERP - 001_multi_tier_schema
-- Hệ thống ERP Giáo dục ĐA TẦNG (Multi-tier):
--   HQ (Tổng công ty) -> Region (Cụm/Vùng) -> Campus (Cơ sở) -> Branch (Chi nhánh)
-- Thay thế hoàn toàn cấu trúc `campuses` cũ bằng cây `organizations`.
-- Quy ước: UUID PK, Soft Delete (deleted_at), audit đầy đủ.
-- ============================================================

-- 0. XÓA CẤU TRÚC CŨ (nếu có) ----------------------------------
drop table if exists public.attendance cascade;
drop table if exists public.lesson_materials cascade;
drop table if exists public.class_sessions cascade;
drop table if exists public.classes cascade;
drop table if exists public.profiles cascade;
drop table if exists public.campuses cascade;
drop function if exists public.check_schedule_conflict(uuid, text, timestamptz, timestamptz);
drop function if exists public.match_lesson_materials(vector, uuid, int);
drop function if exists public.get_descendant_org_ids(uuid);

-- 1. EXTENSIONS ------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists ltree;
create extension if not exists vector;

-- 2. TRIGGER tự cập nhật updated_at ---------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. ORGANIZATIONS (cấu trúc cây) ------------------------------
-- path dùng ltree: nhãn = uuid đổi '-' thành '_' (ltree không chấp nhận '-'),
-- ví dụ: hq_id.region_id.campus_id.branch_id
-- path được trigger tự sinh/duy trì từ parent_id, KHÔNG nhập tay.
create table public.organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  type        text not null check (type in ('hq', 'region', 'campus', 'branch')),
  parent_id   uuid references public.organizations (id),
  path        ltree not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint chk_org_not_self_parent check (parent_id is distinct from id)
);

create index idx_organizations_parent on public.organizations (parent_id);
create index idx_organizations_path_gist on public.organizations using gist (path);

create or replace function public.set_org_path()
returns trigger
language plpgsql
as $$
declare
  v_parent_path ltree;
  v_self_label  text := replace(new.id::text, '-', '_');
begin
  if new.parent_id is null then
    new.path := v_self_label::ltree;
  else
    select o.path into v_parent_path
    from public.organizations o
    where o.id = new.parent_id;

    if v_parent_path is null then
      raise exception 'Parent organization % khong ton tai', new.parent_id;
    end if;

    new.path := v_parent_path || v_self_label::ltree;
  end if;
  return new;
end;
$$;

create trigger trg_organizations_path
  before insert or update of parent_id on public.organizations
  for each row execute function public.set_org_path();

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- 4. PROFILES --------------------------------------------------
-- org_id: tổ chức mà user trực thuộc (quyết định phạm vi dữ liệu nhìn thấy).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text unique,
  role        text not null check (role in ('admin', 'manager', 'teacher', 'student')),
  org_id      uuid references public.organizations (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index idx_profiles_org on public.profiles (org_id);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 5. OPERATIONS: MỌI BẢNG BẮT BUỘC CÓ org_id ------------------

-- 5.1 classes (Lớp học)
create table public.classes (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  name        text not null,
  teacher_id  uuid references public.profiles (id),
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint chk_classes_dates check (end_date is null or start_date is null or end_date >= start_date)
);

create index idx_classes_org on public.classes (org_id);
create index idx_classes_teacher on public.classes (teacher_id);

create trigger trg_classes_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

-- 5.2 class_sessions (Buổi học)
create table public.class_sessions (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  class_id    uuid not null references public.classes (id),
  teacher_id  uuid references public.profiles (id),
  room        text,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint chk_session_time check (end_time > start_time)
);

create index idx_class_sessions_org on public.class_sessions (org_id);
create index idx_class_sessions_class on public.class_sessions (class_id);
create index idx_class_sessions_teacher_time on public.class_sessions (teacher_id, start_time, end_time);

create trigger trg_class_sessions_updated_at
  before update on public.class_sessions
  for each row execute function public.set_updated_at();

-- 5.3 attendance (Điểm danh)
create table public.attendance (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  session_id  uuid not null references public.class_sessions (id),
  student_id  uuid not null references public.profiles (id),
  status      text not null check (status in ('present', 'absent', 'late', 'excused')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_attendance_session_student unique (session_id, student_id)
);

create index idx_attendance_org on public.attendance (org_id);
create index idx_attendance_session on public.attendance (session_id);
create index idx_attendance_student on public.attendance (student_id);

create trigger trg_attendance_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

-- 5.4 lesson_materials (Tài liệu giảng dạy - AI/RAG, gắn theo lớp)
create table public.lesson_materials (
  id          uuid primary key default uuid_generate_v4(),
  class_id    uuid not null references public.classes (id),
  content     text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index idx_lesson_materials_class on public.lesson_materials (class_id);

create trigger trg_lesson_materials_updated_at
  before update on public.lesson_materials
  for each row execute function public.set_updated_at();

-- 6. PHÂN QUYỀN THEO CẤP BẬC (HIERARCHICAL RLS) ----------------

-- 6.1 Trả về ID của tổ chức p_org_id và TẤT CẢ tổ chức con/cháu.
-- Dùng ltree operator <@ (is descendant of) + index GiST => truy vấn cây O(log n).
-- SECURITY DEFINER để policy gọi được mà không bị RLS của organizations chặn.
create or replace function public.get_descendant_org_ids(p_org_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.organizations o
  where o.deleted_at is null
    and o.path <@ (
      select parent.path
      from public.organizations parent
      where parent.id = p_org_id
    );
$$;

-- 6.2 RLS trên classes: user chỉ SELECT được lớp thuộc org của mình
-- hoặc bất kỳ org con/cháu nào (Giám đốc Cụm thấy mọi Chi nhánh dưới quyền;
-- Chi nhánh A KHÔNG thấy Chi nhánh B vì B không nằm trong subtree của A).
alter table public.classes enable row level security;

create policy "select_classes_in_org_subtree"
  on public.classes
  for select
  using (
    deleted_at is null
    and org_id in (
      select public.get_descendant_org_ids(p.org_id)
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.org_id is not null
    )
  );

-- 7. RPC: CHỐNG TRÙNG LỊCH (giữ từ schema cũ) ------------------
create or replace function public.check_schedule_conflict(
  p_teacher_id  uuid,
  p_room        text,
  p_start_time  timestamptz,
  p_end_time    timestamptz
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.class_sessions cs
    where cs.deleted_at is null
      and (
        cs.teacher_id = p_teacher_id
        or (p_room is not null and cs.room = p_room)
      )
      and tstzrange(cs.start_time, cs.end_time) && tstzrange(p_start_time, p_end_time)
  );
$$;
