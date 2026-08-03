-- ============================================================
-- GDTX ERP - 072_hr_personnel_dossier
-- Hồ sơ nhân sự chuyên nghiệp: giấy tờ (CCCD…), ngày thử việc HĐ,
-- loại thông báo nhắc HĐ/sinh nhật; cấu hình khóa quyền NS nhạy cảm.
-- Không tạo role kỹ thuật mới (D23) — Trưởng phòng NS = chức danh + menu.
-- ============================================================

-- 1) Hợp đồng: mốc hết thử việc (nhắc riêng với end_date)
alter table public.teacher_contracts
  add column if not exists probation_end_date date;

comment on column public.teacher_contracts.probation_end_date is
  'Ngay ket thuc thu viec (neu co). Null = khong theo doi thu viec.';

-- Secure view: expose probation_end_date (khong nhay cam so tien)
drop view if exists public.vw_teacher_contracts_secure;
create view public.vw_teacher_contracts_secure
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
  tc.probation_end_date,
  tc.is_active,
  tc.created_at,
  tc.updated_at,
  tc.deleted_at,
  (not public.get_my_can_view_financials()) as financials_masked
from public.teacher_contracts tc;

comment on view public.vw_teacher_contracts_secure is
  'Hop dong GV: so tien NULL neu thieu can_view_financials; gom probation_end_date.';

grant select on public.vw_teacher_contracts_secure to authenticated;

-- 2) Giấy tờ nhân sự (CCCD, bằng cấp…) — file trên R2, metadata trong DB
create table if not exists public.staff_documents (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  profile_id   uuid not null references public.profiles (id),
  doc_type     text not null
               check (doc_type in (
                 'cccd_front', 'cccd_back', 'contract_scan',
                 'degree', 'certificate', 'other'
               )),
  file_key     text not null,
  file_name    varchar(255) not null,
  file_size    int,
  mime_type    varchar(120),
  notes        text,
  uploaded_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_staff_documents_profile
  on public.staff_documents (profile_id)
  where deleted_at is null;

create index if not exists idx_staff_documents_org
  on public.staff_documents (org_id)
  where deleted_at is null;

drop trigger if exists trg_staff_documents_updated_at on public.staff_documents;
create trigger trg_staff_documents_updated_at
  before update on public.staff_documents
  for each row execute function public.set_updated_at();

alter table public.staff_documents enable row level security;

drop policy if exists "staff_documents_admin_all" on public.staff_documents;
drop policy if exists "staff_documents_own_select" on public.staff_documents;

-- campus_admin / super_admin quản lý trong subtree
create policy "staff_documents_admin_all"
  on public.staff_documents for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'campus_admin'
      and public.is_org_in_my_subtree(org_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'campus_admin'
      and public.is_org_in_my_subtree(org_id)
    )
  );

-- Nhân sự xem giấy tờ của CHÍNH MÌNH (không upload qua client thường)
create policy "staff_documents_own_select"
  on public.staff_documents for select
  using (profile_id = auth.uid() and deleted_at is null);

-- ref_id: cho phép text (invoice uuid hoặc bday:profile:year)
alter table public.user_notifications
  alter column ref_id type text using ref_id::text;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in (
    'general',
    'tuition_reminder',
    'schedule_change',
    'announcement',
    'hr_contract_end',
    'hr_probation_end',
    'hr_birthday'
  ));

-- 4) Gợi ý cấu hình mặc định (merge JSONB nếu đã có record)
-- hr_sensitive_locked: true = chỉ campus_admin vào hồ sơ NS nhạy cảm
-- hr_remind_contract_days / hr_remind_probation_days: số ngày trước hạn
comment on table public.staff_documents is
  'Ho so giay to nhan su (CCCD, bang cap...). File R2; metadata + RLS theo org.';
