-- ============================================================
-- 075: Module Khảo thí tách biệt
-- - Công bố điểm (class_results.is_published)
-- - Cột điểm chính thức (assessments.is_official_exam)
-- - Phát đề theo lịch (exam_paper_releases)
-- - Lộ trình học tập HV (learning_pathways*)
-- - Backfill license: staff_ops → thêm exams
-- Idempotent. CHƯA chạy trên DB thật → user chạy SQL Editor.
-- ============================================================

-- 1) Công bố điểm lớp (HV/PH chỉ thấy khi published)
alter table public.class_results
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles (id);

create index if not exists idx_class_results_published
  on public.class_results (is_published)
  where deleted_at is null;

comment on column public.class_results.is_published is
  '075: true = đã công bố điểm cho HV/PH. Khác lock_status (chốt sổ).';

-- Lớp đã vận hành trước đây: giữ hiển thị điểm trên cổng (tránh "mất điểm" đột ngột)
update public.class_results
set is_published = true,
    published_at = coalesce(published_at, now())
where deleted_at is null
  and is_published = false;

-- 2) Đánh dấu cột điểm thuộc kỳ thi chính thức
alter table public.assessments
  add column if not exists is_official_exam boolean not null default false,
  add column if not exists exam_code text;

comment on column public.assessments.is_official_exam is
  '075: true = cột điểm thuộc kỳ thi chính thức (khảo thí kiểm soát).';

-- 3) Phát đề / nhận đề theo lịch thi
create table if not exists public.exam_paper_releases (
  id                uuid primary key default uuid_generate_v4(),
  org_id            uuid not null references public.organizations (id),
  assessment_id     uuid not null references public.assessments (id),
  exam_schedule_id  uuid references public.exam_schedules (id),
  exam_bank_id      uuid,
  title             text not null,
  paper_url         text,
  paper_body        text,
  variant_code      text,
  visible_from      timestamptz,
  visible_until     timestamptz,
  released_by       uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_exam_paper_releases_org
  on public.exam_paper_releases (org_id)
  where deleted_at is null;
create index if not exists idx_exam_paper_releases_assessment
  on public.exam_paper_releases (assessment_id)
  where deleted_at is null;

drop trigger if exists trg_exam_paper_releases_updated_at on public.exam_paper_releases;
create trigger trg_exam_paper_releases_updated_at
  before update on public.exam_paper_releases
  for each row execute function public.set_updated_at();

alter table public.exam_paper_releases enable row level security;

drop policy if exists "exam_paper_releases_select" on public.exam_paper_releases;
create policy "exam_paper_releases_select"
  on public.exam_paper_releases for select
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "exam_paper_releases_write" on public.exam_paper_releases;
create policy "exam_paper_releases_write"
  on public.exam_paper_releases for all
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

-- 4) Lộ trình học tập
create table if not exists public.learning_pathways (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  name        text not null,
  code        text,
  description text,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_learning_pathways_org
  on public.learning_pathways (org_id)
  where deleted_at is null;

drop trigger if exists trg_learning_pathways_updated_at on public.learning_pathways;
create trigger trg_learning_pathways_updated_at
  before update on public.learning_pathways
  for each row execute function public.set_updated_at();

create table if not exists public.learning_pathway_milestones (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  pathway_id    uuid not null references public.learning_pathways (id),
  title         text not null,
  description   text,
  sort_order    integer not null default 0,
  min_score     numeric(5, 2),
  credit_hint   numeric(6, 2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_pathway_milestones_pathway
  on public.learning_pathway_milestones (pathway_id, sort_order)
  where deleted_at is null;

drop trigger if exists trg_pathway_milestones_updated_at on public.learning_pathway_milestones;
create trigger trg_pathway_milestones_updated_at
  before update on public.learning_pathway_milestones
  for each row execute function public.set_updated_at();

create table if not exists public.student_pathway_enrollments (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  pathway_id    uuid not null references public.learning_pathways (id),
  student_id    uuid not null references public.profiles (id),
  status        text not null default 'active'
                check (status in ('active', 'completed', 'paused', 'withdrawn')),
  started_at    date not null default (current_date),
  completed_at  date,
  note          text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint uq_student_pathway unique (pathway_id, student_id)
);

create index if not exists idx_student_pathway_student
  on public.student_pathway_enrollments (student_id)
  where deleted_at is null;

drop trigger if exists trg_student_pathway_enrollments_updated_at
  on public.student_pathway_enrollments;
create trigger trg_student_pathway_enrollments_updated_at
  before update on public.student_pathway_enrollments
  for each row execute function public.set_updated_at();

create table if not exists public.student_pathway_progress (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  enrollment_id   uuid not null references public.student_pathway_enrollments (id),
  milestone_id    uuid not null references public.learning_pathway_milestones (id),
  status          text not null default 'pending'
                  check (status in ('pending', 'in_progress', 'done', 'waived')),
  score           numeric(5, 2),
  evidence_note   text,
  completed_at    timestamptz,
  updated_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint uq_pathway_progress unique (enrollment_id, milestone_id)
);

create index if not exists idx_pathway_progress_enrollment
  on public.student_pathway_progress (enrollment_id)
  where deleted_at is null;

drop trigger if exists trg_student_pathway_progress_updated_at
  on public.student_pathway_progress;
create trigger trg_student_pathway_progress_updated_at
  before update on public.student_pathway_progress
  for each row execute function public.set_updated_at();

-- RLS lộ trình
alter table public.learning_pathways enable row level security;
alter table public.learning_pathway_milestones enable row level security;
alter table public.student_pathway_enrollments enable row level security;
alter table public.student_pathway_progress enable row level security;

drop policy if exists "learning_pathways_select" on public.learning_pathways;
create policy "learning_pathways_select"
  on public.learning_pathways for select
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "learning_pathways_write" on public.learning_pathways;
create policy "learning_pathways_write"
  on public.learning_pathways for all
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

drop policy if exists "pathway_milestones_all" on public.learning_pathway_milestones;
create policy "pathway_milestones_all"
  on public.learning_pathway_milestones for all
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

drop policy if exists "student_pathway_enrollments_all" on public.student_pathway_enrollments;
create policy "student_pathway_enrollments_all"
  on public.student_pathway_enrollments for all
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_in_my_subtree(org_id)
    or student_id = auth.uid()
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

drop policy if exists "student_pathway_progress_all" on public.student_pathway_progress;
create policy "student_pathway_progress_all"
  on public.student_pathway_progress for all
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

-- 5) Backfill license: đơn vị đã mua staff_ops → mở thêm exams
update public.tenant_licenses
set module_keys = (
  select array_agg(distinct k)
  from unnest(coalesce(module_keys, '{}'::text[]) || array['exams']) as k
),
updated_at = now()
where status = 'active'
  and 'staff_ops' = any(module_keys)
  and not ('exams' = any(module_keys));
