-- ================================================================
-- 065: RUBRIC LMS (spec D-RB1..3)
-- ADD ONLY — không đổi lms_submissions.score / feedback
-- ================================================================

create table if not exists public.lms_rubrics (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  assignment_id   uuid not null references public.lms_assignments (id),
  title           text not null default 'Rubric chấm điểm',
  max_score       numeric(4, 2) not null default 10
                  check (max_score > 0 and max_score <= 10),
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint uq_lms_rubrics_assignment unique (assignment_id)
);

create index if not exists idx_lms_rubrics_org
  on public.lms_rubrics (org_id)
  where deleted_at is null;

drop trigger if exists trg_lms_rubrics_updated_at on public.lms_rubrics;
create trigger trg_lms_rubrics_updated_at
  before update on public.lms_rubrics
  for each row execute function public.set_updated_at();

create table if not exists public.lms_rubric_criteria (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  rubric_id    uuid not null references public.lms_rubrics (id) on delete cascade,
  sort_order   int not null default 0,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_lms_rubric_criteria_rubric
  on public.lms_rubric_criteria (rubric_id)
  where deleted_at is null;

drop trigger if exists trg_lms_rubric_criteria_updated_at on public.lms_rubric_criteria;
create trigger trg_lms_rubric_criteria_updated_at
  before update on public.lms_rubric_criteria
  for each row execute function public.set_updated_at();

create table if not exists public.lms_rubric_levels (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  criterion_id  uuid not null references public.lms_rubric_criteria (id) on delete cascade,
  sort_order    int not null default 0,
  label         text not null,
  points        numeric(4, 2) not null check (points >= 0 and points <= 10),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_lms_rubric_levels_criterion
  on public.lms_rubric_levels (criterion_id)
  where deleted_at is null;

drop trigger if exists trg_lms_rubric_levels_updated_at on public.lms_rubric_levels;
create trigger trg_lms_rubric_levels_updated_at
  before update on public.lms_rubric_levels
  for each row execute function public.set_updated_at();

create table if not exists public.lms_submission_grades (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations (id),
  submission_id    uuid not null references public.lms_submissions (id),
  selections       jsonb not null default '{}'::jsonb,
  computed_score   numeric(4, 2),
  feedback         text,
  status           text not null default 'draft'
                   check (status in ('draft', 'final')),
  graded_by        uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint uq_lms_submission_grades unique (submission_id)
);

create index if not exists idx_lms_submission_grades_org
  on public.lms_submission_grades (org_id)
  where deleted_at is null;

drop trigger if exists trg_lms_submission_grades_updated_at on public.lms_submission_grades;
create trigger trg_lms_submission_grades_updated_at
  before update on public.lms_submission_grades
  for each row execute function public.set_updated_at();

-- RLS: staff subtree + teacher of class (via assignment -> class)
alter table public.lms_rubrics enable row level security;
alter table public.lms_rubric_criteria enable row level security;
alter table public.lms_rubric_levels enable row level security;
alter table public.lms_submission_grades enable row level security;

drop policy if exists "lms_rubrics_super" on public.lms_rubrics;
create policy "lms_rubrics_super" on public.lms_rubrics for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "lms_rubrics_staff" on public.lms_rubrics;
create policy "lms_rubrics_staff" on public.lms_rubrics for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'teacher')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'teacher')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "lms_rubric_criteria_staff" on public.lms_rubric_criteria;
create policy "lms_rubric_criteria_staff" on public.lms_rubric_criteria for all
  using (
    public.get_my_role() in ('super_admin', 'campus_admin', 'academic_staff', 'teacher')
    and (public.get_my_role() = 'super_admin' or public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() in ('super_admin', 'campus_admin', 'academic_staff', 'teacher')
    and (public.get_my_role() = 'super_admin' or public.is_org_in_my_subtree(org_id))
  );

drop policy if exists "lms_rubric_levels_staff" on public.lms_rubric_levels;
create policy "lms_rubric_levels_staff" on public.lms_rubric_levels for all
  using (
    public.get_my_role() in ('super_admin', 'campus_admin', 'academic_staff', 'teacher')
    and (public.get_my_role() = 'super_admin' or public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() in ('super_admin', 'campus_admin', 'academic_staff', 'teacher')
    and (public.get_my_role() = 'super_admin' or public.is_org_in_my_subtree(org_id))
  );

drop policy if exists "lms_submission_grades_staff" on public.lms_submission_grades;
create policy "lms_submission_grades_staff" on public.lms_submission_grades for all
  using (
    public.get_my_role() in ('super_admin', 'campus_admin', 'academic_staff', 'teacher')
    and (public.get_my_role() = 'super_admin' or public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() in ('super_admin', 'campus_admin', 'academic_staff', 'teacher')
    and (public.get_my_role() = 'super_admin' or public.is_org_in_my_subtree(org_id))
  );

comment on table public.lms_rubrics is 'Rubric theo assignment LMS (065).';
comment on table public.lms_submission_grades is 'Draft/final selections rubric; sync score khi final.';
