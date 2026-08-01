-- ============================================================
-- 035: HỒ SƠ ĐÀO TẠO KÉP (GDNN-GDTX)
-- (Yêu cầu gốc đặt tên 015 nhưng repo đã tới 034 -> đánh số 035)
--
-- 1) profiles."MaSV": mã định danh CỐT LÕI của học viên (unique),
--    dùng làm khóa upsert khi import Excel. Tên cột giữ nguyên
--    dạng "MaSV" (quoted, phân biệt hoa thường) khớp header file.
-- 2) vocational_records: hồ sơ HỌC NGHỀ (GDNN) - doanh nghiệp
--    liên kết, bậc kỹ năng, trạng thái.
-- 3) academic_records: hồ sơ VĂN HÓA (GDTX) - khối lớp, GPA.
-- ============================================================

-- ----- 1) Cột MaSV trên profiles -----
alter table public.profiles
  add column if not exists "MaSV" varchar(50);

comment on column public.profiles."MaSV" is
  'Mã sinh viên - định danh cốt lõi cho đào tạo kép, khóa upsert khi import Excel';

-- Unique khi còn hiệu lực (cho phép nhiều NULL - GV/nhân viên không có MaSV)
create unique index if not exists uq_profiles_masv
  on public.profiles ("MaSV")
  where "MaSV" is not null and deleted_at is null;

-- Backfill từ student_code (migration 028) khi không gây trùng
update public.profiles p
set "MaSV" = p.student_code
where p."MaSV" is null
  and p.student_code is not null
  and p.deleted_at is null
  and not exists (
    select 1 from public.profiles q
    where q."MaSV" = p.student_code and q.id <> p.id
  );

-- ----- 2) Hồ sơ học nghề (GDNN) -----
create table if not exists public.vocational_records (
  id                     uuid primary key default uuid_generate_v4(),
  student_id             uuid not null references public.profiles (id) on delete cascade,
  org_id                 uuid not null references public.organizations (id),
  -- Doanh nghiệp liên kết đào tạo (bảng đối tác sẽ bổ sung sau)
  partner_enterprise_id  uuid,
  partner_enterprise_name text,
  -- Nghề đào tạo + bậc kỹ năng
  vocation               text,
  skill_level            text not null default 'so_cap'
                         check (skill_level in ('so_cap', 'trung_cap', 'cao_dang')),
  status                 text not null default 'in_progress'
                         check (status in ('pending', 'in_progress', 'completed', 'suspended', 'dropped')),
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create index if not exists idx_vocational_records_student
  on public.vocational_records (student_id);
create index if not exists idx_vocational_records_org
  on public.vocational_records (org_id);

drop trigger if exists trg_vocational_records_updated_at on public.vocational_records;
create trigger trg_vocational_records_updated_at
  before update on public.vocational_records
  for each row execute function public.set_updated_at();

-- ----- 3) Hồ sơ văn hóa (GDTX) -----
create table if not exists public.academic_records (
  id             uuid primary key default uuid_generate_v4(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  org_id         uuid not null references public.organizations (id),
  -- Khối lớp văn hóa đang theo học (10/11/12)
  current_grade  text not null default '10'
                 check (current_grade in ('10', '11', '12')),
  -- GPA thang 10
  gpa            numeric(4, 2) check (gpa >= 0 and gpa <= 10),
  school_year    text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists idx_academic_records_student
  on public.academic_records (student_id);
create index if not exists idx_academic_records_org
  on public.academic_records (org_id);

drop trigger if exists trg_academic_records_updated_at on public.academic_records;
create trigger trg_academic_records_updated_at
  before update on public.academic_records
  for each row execute function public.set_updated_at();

-- ----- RLS -----
alter table public.vocational_records enable row level security;
alter table public.academic_records enable row level security;

drop policy if exists "vocational_super_admin_all" on public.vocational_records;
drop policy if exists "vocational_staff_all" on public.vocational_records;
drop policy if exists "vocational_student_select" on public.vocational_records;
drop policy if exists "academic_rec_super_admin_all" on public.academic_records;
drop policy if exists "academic_rec_staff_all" on public.academic_records;
drop policy if exists "academic_rec_student_select" on public.academic_records;

create policy "vocational_super_admin_all"
  on public.vocational_records for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "vocational_staff_all"
  on public.vocational_records for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Học sinh xem hồ sơ học nghề của CHÍNH MÌNH
create policy "vocational_student_select"
  on public.vocational_records for select
  using (student_id = auth.uid() and deleted_at is null);

create policy "academic_rec_super_admin_all"
  on public.academic_records for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "academic_rec_staff_all"
  on public.academic_records for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Học sinh xem hồ sơ văn hóa của CHÍNH MÌNH
create policy "academic_rec_student_select"
  on public.academic_records for select
  using (student_id = auth.uid() and deleted_at is null);
