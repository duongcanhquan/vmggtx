-- ============================================================
-- GDTX ERP - 015_secure_views
-- Rào chắn bảo mật cho dữ liệu tài chính nhạy cảm (Lương & Đơn giá).
--
-- (Yêu cầu gốc đặt tên 007_secure_views.sql nhưng số 007 đã dùng
--  bởi 007_finance_invoices.sql nên file này mang số 015.)
--
-- Nguyên tắc: Campus Admin xem được DANH SÁCH hợp đồng giáo viên
-- nhưng KHÔNG thấy số tiền nếu chưa được cấp quyền đặc biệt
-- (profiles.can_view_financials = true).
-- ============================================================

-- ---------------------------------------------------------------
-- 1. CỘT PHÂN QUYỀN ĐẶC BIỆT: profiles.can_view_financials
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists can_view_financials boolean not null default false;

comment on column public.profiles.can_view_financials is
  'Quyền xem dữ liệu tài chính nhạy cảm (lương, đơn giá). Mặc định false.';

-- Mặc định cấp quyền cho: super_admin + campus_admin gắn với tổ chức
-- cấp Cụm (region) trở lên (hq). Campus Admin cấp cơ sở/chi nhánh = false.
update public.profiles p
set can_view_financials = true
where p.role = 'super_admin'
   or (
     p.role = 'campus_admin'
     and exists (
       select 1
       from public.organizations o
       where o.id = p.org_id
         and o.type in ('hq', 'region')
     )
   );

-- ---------------------------------------------------------------
-- 2. HELPER: quyền tài chính của user hiện tại
--    SECURITY DEFINER để gọi được trong View mà không vướng RLS
--    của profiles (tránh đệ quy - cùng pattern get_my_role ở 005).
-- ---------------------------------------------------------------
create or replace function public.get_my_can_view_financials()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select can_view_financials from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------
-- 3. SECURE VIEW: vw_teacher_contracts_secure
--    - security_invoker = true: RLS của teacher_contracts VẪN áp
--      cho người truy vấn (không nhìn được hợp đồng ngoài phạm vi).
--    - Số tiền (base_salary, insurance_salary, base_hourly_rate)
--      trả về NULL nếu user KHÔNG có can_view_financials.
--    - financials_masked: cờ báo cho Frontend biết dữ liệu bị che.
--    Backend từ nay BẮT BUỘC query view này thay vì bảng gốc.
-- ---------------------------------------------------------------
create or replace view public.vw_teacher_contracts_secure
with (security_invoker = true)
as
select
  tc.id,
  tc.teacher_id,
  tc.org_id,
  tc.contract_type,
  case when public.get_my_can_view_financials() then tc.base_salary      end as base_salary,
  case when public.get_my_can_view_financials() then tc.insurance_salary end as insurance_salary,
  case when public.get_my_can_view_financials() then tc.base_hourly_rate end as base_hourly_rate,
  tc.required_hours_per_month,
  tc.insurance_percentage,
  tc.tax_percentage,
  tc.start_date,
  tc.end_date,
  tc.is_active,
  tc.created_at,
  tc.updated_at,
  tc.deleted_at,
  (not public.get_my_can_view_financials()) as financials_masked
from public.teacher_contracts tc;

comment on view public.vw_teacher_contracts_secure is
  'Hợp đồng giáo viên với số tiền bị che (NULL) nếu user không có can_view_financials. Query view này thay vì teacher_contracts.';

grant select on public.vw_teacher_contracts_secure to authenticated;
