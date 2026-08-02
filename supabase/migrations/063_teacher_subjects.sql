-- ================================================================
-- 063: HỒ SƠ GV — ngành + môn dạy (spec D-CG3)
-- ADD ONLY: profiles.teaching_major + teacher_subjects
-- ================================================================

alter table public.profiles
  add column if not exists teaching_major text;

comment on column public.profiles.teaching_major is
  'Nganh day (MVP text). Chi dung cho role teacher.';

create table if not exists public.teacher_subjects (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  teacher_id  uuid not null references public.profiles (id),
  subject_id  uuid not null references public.subjects (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_teacher_subjects unique (teacher_id, subject_id)
);

create index if not exists idx_teacher_subjects_teacher
  on public.teacher_subjects (teacher_id)
  where deleted_at is null;

create index if not exists idx_teacher_subjects_org
  on public.teacher_subjects (org_id)
  where deleted_at is null;

drop trigger if exists trg_teacher_subjects_updated_at on public.teacher_subjects;
create trigger trg_teacher_subjects_updated_at
  before update on public.teacher_subjects
  for each row execute function public.set_updated_at();

alter table public.teacher_subjects enable row level security;

drop policy if exists "teacher_subjects_super_all" on public.teacher_subjects;
create policy "teacher_subjects_super_all"
  on public.teacher_subjects for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "teacher_subjects_staff_manage" on public.teacher_subjects;
create policy "teacher_subjects_staff_manage"
  on public.teacher_subjects for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "teacher_subjects_self_select" on public.teacher_subjects;
create policy "teacher_subjects_self_select"
  on public.teacher_subjects for select
  using (
    deleted_at is null
    and (
      teacher_id = auth.uid()
      or public.is_org_in_my_subtree(org_id)
    )
  );

comment on table public.teacher_subjects is
  'Mon GV duoc phep day (P1). Khong thay the classes.teacher_id.';
