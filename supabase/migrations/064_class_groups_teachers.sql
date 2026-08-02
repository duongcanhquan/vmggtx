-- ================================================================
-- 064: LỚP HÀNH CHÍNH + NHIỀU GV HỌC PHẦN (spec D-CG1 / D-CG2)
-- - class_groups (cohort)
-- - class_group_members
-- - classes.group_id nullable (classes = học phần)
-- - class_teachers (lead | co | grader)
-- ================================================================

create table if not exists public.class_groups (
  id                    uuid primary key default uuid_generate_v4(),
  org_id                uuid not null references public.organizations (id),
  name                  text not null,
  homeroom_teacher_id   uuid references public.profiles (id),
  max_students          int check (max_students is null or max_students > 0),
  start_date            date,
  end_date              date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint chk_class_groups_dates
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists idx_class_groups_org
  on public.class_groups (org_id)
  where deleted_at is null;

drop trigger if exists trg_class_groups_updated_at on public.class_groups;
create trigger trg_class_groups_updated_at
  before update on public.class_groups
  for each row execute function public.set_updated_at();

create table if not exists public.class_group_members (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  group_id    uuid not null references public.class_groups (id),
  student_id  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_class_group_members unique (group_id, student_id)
);

create index if not exists idx_class_group_members_group
  on public.class_group_members (group_id)
  where deleted_at is null;

drop trigger if exists trg_class_group_members_updated_at on public.class_group_members;
create trigger trg_class_group_members_updated_at
  before update on public.class_group_members
  for each row execute function public.set_updated_at();

alter table public.classes
  add column if not exists group_id uuid references public.class_groups (id);

create index if not exists idx_classes_group
  on public.classes (group_id)
  where deleted_at is null and group_id is not null;

comment on column public.classes.group_id is
  'FK class_groups (cohort). NULL = hoc phan doc lap (du lieu cu).';

create table if not exists public.class_teachers (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  class_id    uuid not null references public.classes (id),
  teacher_id  uuid not null references public.profiles (id),
  role        text not null default 'co'
              check (role in ('lead', 'co', 'grader')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_class_teachers unique (class_id, teacher_id)
);

create index if not exists idx_class_teachers_class
  on public.class_teachers (class_id)
  where deleted_at is null;

create index if not exists idx_class_teachers_teacher
  on public.class_teachers (teacher_id)
  where deleted_at is null;

-- Toi da 1 lead / hoc phan (partial unique)
create unique index if not exists uq_class_teachers_one_lead
  on public.class_teachers (class_id)
  where deleted_at is null and role = 'lead';

drop trigger if exists trg_class_teachers_updated_at on public.class_teachers;
create trigger trg_class_teachers_updated_at
  before update on public.class_teachers
  for each row execute function public.set_updated_at();

-- RLS
alter table public.class_groups enable row level security;
alter table public.class_group_members enable row level security;
alter table public.class_teachers enable row level security;

drop policy if exists "class_groups_super_all" on public.class_groups;
create policy "class_groups_super_all"
  on public.class_groups for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "class_groups_staff_manage" on public.class_groups;
create policy "class_groups_staff_manage"
  on public.class_groups for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'admission_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'admission_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "class_groups_member_select" on public.class_groups;
create policy "class_groups_member_select"
  on public.class_groups for select
  using (
    deleted_at is null
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "class_group_members_super_all" on public.class_group_members;
create policy "class_group_members_super_all"
  on public.class_group_members for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "class_group_members_staff" on public.class_group_members;
create policy "class_group_members_staff"
  on public.class_group_members for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'admission_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'admission_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "class_teachers_super_all" on public.class_teachers;
create policy "class_teachers_super_all"
  on public.class_teachers for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "class_teachers_staff" on public.class_teachers;
create policy "class_teachers_staff"
  on public.class_teachers for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "class_teachers_self_select" on public.class_teachers;
create policy "class_teachers_self_select"
  on public.class_teachers for select
  using (deleted_at is null and teacher_id = auth.uid());

comment on table public.class_groups is
  'Lop hanh chinh (cohort). Hoc phan = classes.group_id.';
comment on table public.class_teachers is
  'Nhieu GV / hoc phan: lead | co | grader.';
