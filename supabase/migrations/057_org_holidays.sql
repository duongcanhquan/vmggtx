-- ================================================================
-- 057: NGÀY NGHỈ THEO CƠ SỞ (TKB tầng 1)
-- - org_holidays: nghỉ lễ / nghỉ đột xuất per org
-- - Kế thừa: app walk tổ tiên khi check (cùng pattern settings)
-- - RPC is_org_holiday(org_id, date) SECURITY DEFINER
-- ================================================================

create table if not exists public.org_holidays (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  holiday_date  date not null,
  name          text not null,
  holiday_type  text not null default 'holiday'
                check (holiday_type in ('holiday', 'break')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index if not exists uq_org_holidays_org_date_active
  on public.org_holidays (org_id, holiday_date)
  where deleted_at is null;

create index if not exists idx_org_holidays_org_date
  on public.org_holidays (org_id, holiday_date)
  where deleted_at is null;

alter table public.org_holidays enable row level security;

drop policy if exists "org_holidays_super_all" on public.org_holidays;
create policy "org_holidays_super_all"
  on public.org_holidays for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "org_holidays_staff_manage" on public.org_holidays;
create policy "org_holidays_staff_manage"
  on public.org_holidays for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "org_holidays_subtree_read" on public.org_holidays;
create policy "org_holidays_subtree_read"
  on public.org_holidays for select
  using (
    deleted_at is null
    and public.is_org_in_my_subtree(org_id)
  );

drop trigger if exists trg_org_holidays_updated_at on public.org_holidays;
create trigger trg_org_holidays_updated_at
  before update on public.org_holidays
  for each row execute function public.set_updated_at();

comment on table public.org_holidays is
  'Ngay nghi theo co so — skip/block khi xep TKB (D24 tang 1).';

-- true nếu org hoặc tổ tiên có ngày nghỉ active
create or replace function public.is_org_holiday(p_org_id uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cur uuid := p_org_id;
  v_parent uuid;
begin
  if p_org_id is null or p_date is null then
    return false;
  end if;

  for i in 1..10 loop
    if exists (
      select 1 from public.org_holidays h
      where h.org_id = v_cur
        and h.holiday_date = p_date
        and h.deleted_at is null
    ) then
      return true;
    end if;

    select parent_id into v_parent
    from public.organizations
    where id = v_cur and deleted_at is null;

    exit when v_parent is null;
    v_cur := v_parent;
  end loop;

  return false;
end;
$$;

grant execute on function public.is_org_holiday(uuid, date) to authenticated;
