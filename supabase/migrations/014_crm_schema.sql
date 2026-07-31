-- ============================================================
-- GDTX ERP - 014_crm_schema
-- CRM Tuyển sinh (Pre-enrollment): quản lý Leads (học sinh tiềm năng)
-- cho Tư vấn viên (admission_staff).
--
-- (Yêu cầu gốc đặt tên 006_crm_schema.sql nhưng số 006 đã dùng bởi
--  006_custom_jwt_claims.sql nên file này mang số 014.)
--
-- Gồm:
--   1. Role mới: admission_staff (Tư vấn viên tuyển sinh).
--   2. Bảng leads + lead_activities (mọi bảng đều có org_id).
--   3. RLS: admission_staff CHỈ thấy leads mình quản lý hoặc chưa có
--      người quản lý (trong org của mình); campus_admin thấy tất cả
--      leads trong subtree; super_admin thấy tất cả.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. ROLE MỚI: admission_staff
-- ---------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'super_admin', 'campus_admin', 'academic_staff',
    'admission_staff', 'teacher', 'student'
  ));

-- ---------------------------------------------------------------
-- 2. BẢNG leads (Học sinh tiềm năng)
-- ---------------------------------------------------------------
create table if not exists public.leads (
  id                     uuid primary key default uuid_generate_v4(),
  org_id                 uuid not null references public.organizations (id),
  full_name              text not null,
  phone                  varchar(20) not null,
  interested_subject_id  uuid references public.subjects (id),
  status                 text not null default 'new'
                         check (status in ('new', 'contacted', 'test_scheduled', 'enrolled', 'lost')),
  counselor_id           uuid references public.profiles (id),  -- người tư vấn phụ trách
  notes                  text,
  -- Liên kết sau khi chuyển hóa Lead -> Student chính thức
  converted_student_id   uuid references public.profiles (id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create index if not exists idx_leads_org on public.leads (org_id);
create index if not exists idx_leads_counselor on public.leads (counselor_id);
create index if not exists idx_leads_status on public.leads (org_id, status);
create index if not exists idx_leads_phone on public.leads (phone);

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 3. BẢNG lead_activities (Nhật ký chăm sóc lead)
-- ---------------------------------------------------------------
create table if not exists public.lead_activities (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references public.organizations (id),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  activity_type  text not null check (activity_type in ('call', 'email', 'meeting')),
  description    text,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead on public.lead_activities (lead_id);
create index if not exists idx_lead_activities_org on public.lead_activities (org_id);

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

drop policy if exists "leads_super_admin_all"     on public.leads;
drop policy if exists "leads_campus_admin_all"    on public.leads;
drop policy if exists "leads_admission_select"    on public.leads;
drop policy if exists "leads_admission_insert"    on public.leads;
drop policy if exists "leads_admission_update"    on public.leads;

-- 4.1 super_admin: toàn quyền
create policy "leads_super_admin_all"
  on public.leads for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- 4.2 campus_admin (+ academic_staff hỗ trợ vận hành): toàn quyền
--     với leads trong subtree tổ chức của mình
create policy "leads_campus_admin_all"
  on public.leads for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- 4.3 admission_staff: CHỈ leads trong org của mình VÀ
--     (do mình quản lý HOẶC chưa có người quản lý)
create policy "leads_admission_select"
  on public.leads for select
  using (
    public.get_my_role() = 'admission_staff'
    and org_id = public.get_my_org_id()
    and (counselor_id = auth.uid() or counselor_id is null)
  );

-- Tư vấn viên tạo lead mới cho org của mình (tự gán mình hoặc để trống)
create policy "leads_admission_insert"
  on public.leads for insert
  with check (
    public.get_my_role() = 'admission_staff'
    and org_id = public.get_my_org_id()
    and (counselor_id = auth.uid() or counselor_id is null)
  );

-- Cập nhật (đổi trạng thái Kanban, nhận lead chưa ai phụ trách...):
-- vẫn trong phạm vi org mình + lead của mình hoặc chưa ai nhận
create policy "leads_admission_update"
  on public.leads for update
  using (
    public.get_my_role() = 'admission_staff'
    and org_id = public.get_my_org_id()
    and (counselor_id = auth.uid() or counselor_id is null)
  )
  with check (
    public.get_my_role() = 'admission_staff'
    and org_id = public.get_my_org_id()
    and (counselor_id = auth.uid() or counselor_id is null)
  );

-- 4.4 lead_activities: nhìn thấy/ghi được nếu nhìn thấy lead gốc
--     (subquery vào leads tự áp RLS của leads cho user đang truy vấn)
drop policy if exists "lead_activities_select" on public.lead_activities;
drop policy if exists "lead_activities_insert" on public.lead_activities;

create policy "lead_activities_select"
  on public.lead_activities for select
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
  );

create policy "lead_activities_insert"
  on public.lead_activities for insert
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.leads l where l.id = lead_id)
  );
