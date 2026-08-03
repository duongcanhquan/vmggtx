-- ============================================================
-- GDTX ERP - 071_campus_admin_view_financials
-- Quản lý cơ sở (campus_admin) = cấp vận hành cao nhất trong cơ sở
-- → LUÔN xem được lương/đơn giá trong phạm vi org (D30).
-- Migration 015 trước đây chỉ cấp flag cho admin HQ/region.
-- ============================================================

-- 1. Backfill cột trên profile
update public.profiles
set can_view_financials = true
where role in ('super_admin', 'campus_admin')
  and can_view_financials is distinct from true
  and deleted_at is null;

-- 2. Helper: role quản trị luôn true; role khác theo cột flag
create or replace function public.get_my_can_view_financials()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select
        case
          when p.role in ('super_admin', 'campus_admin') then true
          else p.can_view_financials
        end
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
    ),
    false
  );
$$;

comment on function public.get_my_can_view_financials() is
  'true nếu super_admin/campus_admin, hoặc profiles.can_view_financials = true (kế toán được cấp).';
