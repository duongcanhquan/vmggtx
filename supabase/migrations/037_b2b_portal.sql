-- ============================================================
-- 037: B2B PORTAL - Doanh nghiệp liên kết quản lý thực tập sinh
-- (Yêu cầu gốc đặt tên 017 nhưng repo đã tới 036 -> đánh số 037)
--
-- 1) enterprises  : doanh nghiệp đối tác của trung tâm (org_id)
-- 2) profiles     : role mới 'enterprise_partner' + cột enterprise_id
--    (đồng thời vá thêm 'accountant' vốn đã có trong code FE)
-- 3) internships  : kỳ thực tập - doanh nghiệp chấm enterprise_rating
--    (0-10) + feedback_notes; điểm ĐỒNG BỘ về hồ sơ học nghề
--    vocational_records.practice_score của trung tâm (migration 035)
-- ============================================================

-- ---------------------------------------------------------------
-- 1) DOANH NGHIỆP ĐỐI TÁC
-- ---------------------------------------------------------------
create table if not exists public.enterprises (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  name        text not null,
  industry    text,
  tax_code    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_enterprises_org on public.enterprises (org_id);

drop trigger if exists trg_enterprises_updated_at on public.enterprises;
create trigger trg_enterprises_updated_at
  before update on public.enterprises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 2) ROLE enterprise_partner + profiles.enterprise_id
-- ---------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'super_admin', 'campus_admin', 'academic_staff',
    'admission_staff', 'accountant', 'teacher', 'student',
    'enterprise_partner'
  ));

alter table public.profiles
  add column if not exists enterprise_id uuid references public.enterprises (id);

comment on column public.profiles.enterprise_id is
  'Tài khoản enterprise_partner thuộc doanh nghiệp nào (B2B Portal)';

-- Helper: doanh nghiệp của user hiện tại (dùng trong RLS, security definer
-- để không đệ quy RLS bảng profiles)
create or replace function public.get_my_enterprise_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select enterprise_id from public.profiles
  where id = auth.uid() and deleted_at is null
$$;

-- ---------------------------------------------------------------
-- 3) KỲ THỰC TẬP
-- ---------------------------------------------------------------
create table if not exists public.internships (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references public.organizations (id),
  student_id         uuid not null references public.profiles (id),
  enterprise_id      uuid not null references public.enterprises (id),
  position           text,                          -- vị trí thực tập
  start_date         date not null,
  end_date           date,
  status             text not null default 'active'
                     check (status in ('active', 'completed', 'terminated')),
  -- Doanh nghiệp chấm điểm thực hành (0-10) + nhận xét thái độ nghề nghiệp
  enterprise_rating  numeric(4, 2)
                     check (enterprise_rating is null or (enterprise_rating >= 0 and enterprise_rating <= 10)),
  feedback_notes     text,
  rated_by           uuid references public.profiles (id),
  rated_at           timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint chk_internship_dates check (end_date is null or end_date >= start_date)
);

create index if not exists idx_internships_enterprise
  on public.internships (enterprise_id, status);
create index if not exists idx_internships_student
  on public.internships (student_id);
create index if not exists idx_internships_org
  on public.internships (org_id);

drop trigger if exists trg_internships_updated_at on public.internships;
create trigger trg_internships_updated_at
  before update on public.internships
  for each row execute function public.set_updated_at();

-- Cột nhận điểm đồng bộ trên HỒ SƠ HỌC NGHỀ của trung tâm (035)
alter table public.vocational_records
  add column if not exists practice_score numeric(4, 2),
  add column if not exists practice_feedback text;

comment on column public.vocational_records.practice_score is
  'Điểm thực hành do doanh nghiệp chấm - đồng bộ tự động từ internships.enterprise_rating';

-- ----- RLS -----
alter table public.enterprises enable row level security;
alter table public.internships enable row level security;

drop policy if exists "enterprises_super_admin_all" on public.enterprises;
drop policy if exists "enterprises_staff_all" on public.enterprises;
drop policy if exists "enterprises_partner_select" on public.enterprises;
drop policy if exists "internships_super_admin_all" on public.internships;
drop policy if exists "internships_staff_all" on public.internships;
drop policy if exists "internships_partner_select" on public.internships;
drop policy if exists "internships_partner_update" on public.internships;
drop policy if exists "internships_student_select" on public.internships;

create policy "enterprises_super_admin_all"
  on public.enterprises for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "enterprises_staff_all"
  on public.enterprises for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Đối tác xem thông tin doanh nghiệp CỦA MÌNH
create policy "enterprises_partner_select"
  on public.enterprises for select
  using (id = public.get_my_enterprise_id() and deleted_at is null);

create policy "internships_super_admin_all"
  on public.internships for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "internships_staff_all"
  on public.internships for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Đối tác XEM thực tập sinh tại doanh nghiệp mình
create policy "internships_partner_select"
  on public.internships for select
  using (enterprise_id = public.get_my_enterprise_id() and deleted_at is null);

-- Đối tác CHẤM ĐIỂM (update) thực tập sinh của mình - không đổi enterprise
create policy "internships_partner_update"
  on public.internships for update
  using (enterprise_id = public.get_my_enterprise_id() and deleted_at is null)
  with check (enterprise_id = public.get_my_enterprise_id());

-- Học viên xem kỳ thực tập của CHÍNH MÌNH
create policy "internships_student_select"
  on public.internships for select
  using (student_id = auth.uid() and deleted_at is null);

-- Đối tác cần đọc TÊN học viên của mình: profiles đã có policy đọc
-- trong org? -> bổ sung policy hẹp: partner đọc profile các học viên
-- đang thực tập tại doanh nghiệp mình.
drop policy if exists "profiles_partner_read_interns" on public.profiles;
create policy "profiles_partner_read_interns"
  on public.profiles for select
  using (
    exists (
      select 1 from public.internships i
      where i.student_id = profiles.id
        and i.enterprise_id = public.get_my_enterprise_id()
        and i.deleted_at is null
    )
  );

comment on table public.enterprises is
  'Doanh nghiệp đối tác đào tạo kép/thực tập của trung tâm (B2B Portal)';
comment on table public.internships is
  'Kỳ thực tập của học viên tại doanh nghiệp - DN chấm điểm 0-10 + nhận xét';
