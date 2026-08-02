-- ================================================================
-- 066: HR — quỹ phép, đơn nghỉ, override ngày công, lương văn phòng
-- Spec: 2026-08-02-hr-personnel-leave-design.md (D28)
-- ADD-only; soft delete; org_id + RLS subtree
-- ================================================================

-- 1) Quỹ phép theo năm ------------------------------------------------
create table if not exists public.hr_leave_balances (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  profile_id      uuid not null references public.profiles (id),
  year            int not null check (year >= 2000 and year <= 2100),
  entitled_days   numeric(6,2) not null default 12
                  check (entitled_days >= 0),
  used_days       numeric(6,2) not null default 0
                  check (used_days >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint uq_hr_leave_balances_active
    unique (org_id, profile_id, year)
);

create index if not exists idx_hr_leave_balances_org
  on public.hr_leave_balances (org_id, year)
  where deleted_at is null;

drop trigger if exists trg_hr_leave_balances_updated_at on public.hr_leave_balances;
create trigger trg_hr_leave_balances_updated_at
  before update on public.hr_leave_balances
  for each row execute function public.set_updated_at();

-- 2) Đơn nghỉ HR (tách teacher_requests) ------------------------------
create table if not exists public.hr_leave_requests (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  profile_id      uuid not null references public.profiles (id),
  leave_type      text not null default 'annual'
                  check (leave_type in ('annual', 'unpaid', 'other')),
  start_date      date not null,
  end_date        date not null,
  days_count      numeric(6,2) not null check (days_count > 0),
  reason          text,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by     uuid references public.profiles (id),
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_hr_leave_dates check (end_date >= start_date)
);

create index if not exists idx_hr_leave_requests_org_status
  on public.hr_leave_requests (org_id, status)
  where deleted_at is null;

create index if not exists idx_hr_leave_requests_profile
  on public.hr_leave_requests (profile_id, start_date)
  where deleted_at is null;

drop trigger if exists trg_hr_leave_requests_updated_at on public.hr_leave_requests;
create trigger trg_hr_leave_requests_updated_at
  before update on public.hr_leave_requests
  for each row execute function public.set_updated_at();

-- 3) Override ngày công -----------------------------------------------
create table if not exists public.hr_workday_overrides (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  profile_id      uuid not null references public.profiles (id),
  work_date       date not null,
  status          text not null
                  check (status in ('present', 'absent', 'leave', 'holiday', 'remote')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint uq_hr_workday_overrides_active
    unique (org_id, profile_id, work_date)
);

create index if not exists idx_hr_workday_overrides_org_date
  on public.hr_workday_overrides (org_id, work_date)
  where deleted_at is null;

drop trigger if exists trg_hr_workday_overrides_updated_at on public.hr_workday_overrides;
create trigger trg_hr_workday_overrides_updated_at
  before update on public.hr_workday_overrides
  for each row execute function public.set_updated_at();

-- 4) Lương văn phòng (cố định / tháng) --------------------------------
create table if not exists public.staff_salary_terms (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  profile_id      uuid not null references public.profiles (id),
  monthly_base    numeric(14,2) not null check (monthly_base >= 0),
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_staff_salary_dates
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists idx_staff_salary_terms_profile
  on public.staff_salary_terms (profile_id)
  where deleted_at is null;

drop trigger if exists trg_staff_salary_terms_updated_at on public.staff_salary_terms;
create trigger trg_staff_salary_terms_updated_at
  before update on public.staff_salary_terms
  for each row execute function public.set_updated_at();

comment on table public.hr_leave_balances is
  'Quy phep nam theo nhan su (D28).';
comment on table public.hr_leave_requests is
  'Don nghi HR — tach teacher_requests nghi buoi day.';
comment on table public.hr_workday_overrides is
  'Override ngay cong hybrid (D-HR5).';
comment on table public.staff_salary_terms is
  'Luong van phong co dinh theo thang (D-HR6).';

-- 5) RLS --------------------------------------------------------------
alter table public.hr_leave_balances enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_workday_overrides enable row level security;
alter table public.staff_salary_terms enable row level security;

-- Super admin
drop policy if exists "hr_leave_balances_super" on public.hr_leave_balances;
create policy "hr_leave_balances_super" on public.hr_leave_balances
  for all using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "hr_leave_requests_super" on public.hr_leave_requests;
create policy "hr_leave_requests_super" on public.hr_leave_requests
  for all using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "hr_workday_overrides_super" on public.hr_workday_overrides;
create policy "hr_workday_overrides_super" on public.hr_workday_overrides
  for all using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "staff_salary_terms_super" on public.staff_salary_terms;
create policy "staff_salary_terms_super" on public.staff_salary_terms
  for all using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Managers subtree
drop policy if exists "hr_leave_balances_mgr" on public.hr_leave_balances;
create policy "hr_leave_balances_mgr" on public.hr_leave_balances
  for all using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "hr_leave_requests_mgr" on public.hr_leave_requests;
create policy "hr_leave_requests_mgr" on public.hr_leave_requests
  for all using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "hr_workday_overrides_mgr" on public.hr_workday_overrides;
create policy "hr_workday_overrides_mgr" on public.hr_workday_overrides
  for all using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "staff_salary_terms_mgr" on public.staff_salary_terms;
create policy "staff_salary_terms_mgr" on public.staff_salary_terms
  for all using (
    public.get_my_role() in ('campus_admin', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );

-- Self: đọc quỹ / đơn / công của mình; tạo đơn nghỉ
drop policy if exists "hr_leave_balances_self" on public.hr_leave_balances;
create policy "hr_leave_balances_self" on public.hr_leave_balances
  for select using (profile_id = auth.uid() and deleted_at is null);

drop policy if exists "hr_leave_requests_self_select" on public.hr_leave_requests;
create policy "hr_leave_requests_self_select" on public.hr_leave_requests
  for select using (profile_id = auth.uid() and deleted_at is null);

drop policy if exists "hr_leave_requests_self_insert" on public.hr_leave_requests;
create policy "hr_leave_requests_self_insert" on public.hr_leave_requests
  for insert with check (
    profile_id = auth.uid()
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "hr_leave_requests_self_cancel" on public.hr_leave_requests;
create policy "hr_leave_requests_self_cancel" on public.hr_leave_requests
  for update using (
    profile_id = auth.uid()
    and status = 'pending'
    and deleted_at is null
  )
  with check (profile_id = auth.uid());

drop policy if exists "hr_workday_overrides_self" on public.hr_workday_overrides;
create policy "hr_workday_overrides_self" on public.hr_workday_overrides
  for select using (profile_id = auth.uid() and deleted_at is null);
