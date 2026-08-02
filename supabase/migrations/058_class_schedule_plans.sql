-- ================================================================
-- 058: KẾ HOẠCH XẾP LỊCH LỚP (TKB tầng 3)
-- - class_schedule_plans: số buổi/tuần + ngày/slot ưu tiên
-- ================================================================

create table if not exists public.class_schedule_plans (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null references public.organizations (id),
  class_id             uuid not null references public.classes (id),
  sessions_per_week    int not null default 2
                       check (sessions_per_week >= 1 and sessions_per_week <= 14),
  -- JS getDay(): 0=CN … 6=T7
  preferred_weekdays   int[] not null default '{1,3,5}',
  preferred_slot_ids   text[] not null default '{}',
  default_room         text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create unique index if not exists uq_class_schedule_plans_class_active
  on public.class_schedule_plans (class_id)
  where deleted_at is null;

create index if not exists idx_class_schedule_plans_org
  on public.class_schedule_plans (org_id)
  where deleted_at is null and is_active = true;

alter table public.class_schedule_plans enable row level security;

drop policy if exists "csp_super_all" on public.class_schedule_plans;
create policy "csp_super_all"
  on public.class_schedule_plans for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "csp_staff_manage" on public.class_schedule_plans;
create policy "csp_staff_manage"
  on public.class_schedule_plans for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "csp_subtree_read" on public.class_schedule_plans;
create policy "csp_subtree_read"
  on public.class_schedule_plans for select
  using (
    deleted_at is null
    and public.is_org_in_my_subtree(org_id)
  );

drop trigger if exists trg_class_schedule_plans_updated_at on public.class_schedule_plans;
create trigger trg_class_schedule_plans_updated_at
  before update on public.class_schedule_plans
  for each row execute function public.set_updated_at();

comment on table public.class_schedule_plans is
  'Mau xep lich lop — auto TKB greedy (D24 tang 3).';
