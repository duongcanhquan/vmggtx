-- ============================================================
-- 069: Performance — CRM list + dashboard aggregates
-- - Index hot path leads / lead_activities
-- - RPC crm_lead_activity_stats: count + last activity (không kéo hết dòng)
-- - RPC sum_org_payments: tổng thu theo org (dashboard, 1 round-trip)
-- Idempotent. CHƯA chạy trên DB thật → user chạy SQL Editor.
-- ============================================================

-- Index danh sách CRM: org + created_at (soft-delete)
create index if not exists idx_leads_org_created_live
  on public.leads (org_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_lead_activities_lead_created_live
  on public.lead_activities (lead_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_payments_org_live
  on public.payments (org_id)
  where deleted_at is null;

create index if not exists idx_profiles_students_org_live
  on public.profiles (org_id)
  where deleted_at is null and role = 'student';

-- Thống kê hoạt động CRM theo danh sách lead (SECURITY INVOKER → RLS giữ nguyên)
create or replace function public.crm_lead_activity_stats(p_lead_ids uuid[])
returns table (
  lead_id uuid,
  activity_count bigint,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.lead_id,
    count(*)::bigint as activity_count,
    max(a.created_at) as last_activity_at
  from public.lead_activities a
  where a.lead_id = any (p_lead_ids)
    and a.deleted_at is null
  group by a.lead_id;
$$;

grant execute on function public.crm_lead_activity_stats(uuid[]) to authenticated;

comment on function public.crm_lead_activity_stats(uuid[]) is
  'CRM: count + last activity_at theo lead_id (thay vì select toàn bộ lead_activities).';

-- Tổng tiền đã thu theo danh sách org (dashboard overview)
create or replace function public.sum_org_payments(p_org_ids uuid[])
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(p.amount_paid), 0)::numeric
  from public.payments p
  where p.org_id = any (p_org_ids)
    and p.deleted_at is null;
$$;

grant execute on function public.sum_org_payments(uuid[]) to authenticated;

comment on function public.sum_org_payments(uuid[]) is
  'Dashboard: tổng amount_paid theo subtree org (1 scalar, không kéo từng dòng).';
