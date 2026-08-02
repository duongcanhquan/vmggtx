-- ================================================================
-- 062: CÔNG THỨC HỌC PHÍ TỐI THIỂU (P5)
-- - Bảng MỚI tuition_rules — không sửa invoices.amount
-- ================================================================

create table if not exists public.tuition_rules (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  name            text not null,
  -- flat | per_credit | monthly
  billing_mode    text not null default 'flat'
                  check (billing_mode in ('flat', 'per_credit', 'monthly')),
  amount          numeric(14,2) not null check (amount >= 0),
  -- optional: áp cho 1 môn / 1 lớp; null = áp theo danh sách HV chọn lúc chạy
  subject_id      uuid references public.subjects (id),
  class_id        uuid references public.classes (id),
  note            text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists idx_tuition_rules_org
  on public.tuition_rules (org_id)
  where deleted_at is null and is_active = true;

drop trigger if exists trg_tuition_rules_updated_at on public.tuition_rules;
create trigger trg_tuition_rules_updated_at
  before update on public.tuition_rules
  for each row execute function public.set_updated_at();

alter table public.tuition_rules enable row level security;

drop policy if exists "tuition_rules_super_all" on public.tuition_rules;
create policy "tuition_rules_super_all"
  on public.tuition_rules for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "tuition_rules_staff_manage" on public.tuition_rules;
create policy "tuition_rules_staff_manage"
  on public.tuition_rules for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );

comment on table public.tuition_rules is
  'Cong thuc hoc phi (P5). Sinh draft invoices — khong doi cot invoices cu.';
