-- ============================================================
-- GDTX ERP - 010_hr_payroll_schema
-- Module Lương & Hợp đồng cho cơ chế nhân sự Biên chế/Thỉnh giảng:
--   teacher_contracts : hợp đồng giáo viên (full_time/visiting/probation)
--   payrolls          : bảng lương hàng tháng (draft -> approved -> paid)
-- Quy ước dự án: UUID PK, org_id BẮT BUỘC, soft delete (deleted_at),
-- trigger updated_at, RLS theo subtree tổ chức.
-- (Yêu cầu gốc đặt tên 004_hr_payroll_schema.sql nhưng số 004 đã
--  được dùng bởi 004_profiles_contact.sql nên chuyển thành 010.)
-- ============================================================

-- 1. BẢNG teacher_contracts (Hợp đồng giáo viên) ----------------
create table if not exists public.teacher_contracts (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  teacher_id      uuid not null references public.profiles (id),
  contract_type   text not null
                  check (contract_type in ('full_time', 'visiting', 'probation')),
  base_salary     numeric(14, 2) not null default 0 check (base_salary >= 0),
  -- Đơn giá 1 tiết dạy (dùng cho thỉnh giảng và tiết vượt của biên chế)
  hourly_rate     numeric(12, 2) not null default 0 check (hourly_rate >= 0),
  -- Số tiết nghĩa vụ/tháng (chỉ ý nghĩa với full_time/probation)
  required_hours  int not null default 0 check (required_hours >= 0),
  -- % trích bảo hiểm trên lương cơ bản (VD: 10.5 = 10.5%)
  insurance_rate  numeric(5, 2) not null default 0
                  check (insurance_rate >= 0 and insurance_rate <= 100),
  -- % thuế TNCN trên tổng thu nhập (VD: 10 = 10%)
  tax_rate        numeric(5, 2) not null default 0
                  check (tax_rate >= 0 and tax_rate <= 100),
  start_date      date,
  end_date        date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint chk_contract_dates
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists idx_teacher_contracts_org
  on public.teacher_contracts (org_id);
create index if not exists idx_teacher_contracts_teacher
  on public.teacher_contracts (teacher_id);

-- Mỗi giáo viên chỉ có 1 hợp đồng ACTIVE tại 1 tổ chức
create unique index if not exists uq_teacher_contracts_active
  on public.teacher_contracts (teacher_id, org_id)
  where is_active = true and deleted_at is null;

drop trigger if exists trg_teacher_contracts_updated_at on public.teacher_contracts;
create trigger trg_teacher_contracts_updated_at
  before update on public.teacher_contracts
  for each row execute function public.set_updated_at();

-- 2. BẢNG payrolls (Bảng lương hàng tháng) ----------------------
create table if not exists public.payrolls (
  id                   uuid primary key default uuid_generate_v4(),
  org_id               uuid not null references public.organizations (id),
  teacher_id           uuid not null references public.profiles (id),
  month                int not null check (month between 1 and 12),
  year                 int not null check (year between 2000 and 2100),
  -- Tổng số giờ/tiết dạy THỰC TẾ trong tháng (đếm từ class_sessions
  -- đã diễn ra VÀ có dữ liệu điểm danh = giáo viên có check-in)
  total_hours_taught   numeric(7, 2) not null default 0,
  regular_hours_pay    numeric(14, 2) not null default 0,
  overtime_hours_pay   numeric(14, 2) not null default 0,
  insurance_deduction  numeric(14, 2) not null default 0,
  tax_deduction        numeric(14, 2) not null default 0,
  net_pay              numeric(14, 2) not null default 0,
  status               text not null default 'draft'
                       check (status in ('draft', 'approved', 'paid')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  -- Tính lại lương tháng = ghi đè bản draft cũ (upsert theo bộ 3 này)
  constraint uq_payrolls_teacher_month unique (teacher_id, month, year)
);

create index if not exists idx_payrolls_org on public.payrolls (org_id);
create index if not exists idx_payrolls_teacher on public.payrolls (teacher_id);
create index if not exists idx_payrolls_period on public.payrolls (year, month);

drop trigger if exists trg_payrolls_updated_at on public.payrolls;
create trigger trg_payrolls_updated_at
  before update on public.payrolls
  for each row execute function public.set_updated_at();

-- 3. ROW LEVEL SECURITY -----------------------------------------
-- super_admin: tất cả. campus_admin/academic_staff: trong subtree.
-- teacher: chỉ XEM hợp đồng + bảng lương của CHÍNH MÌNH.

alter table public.teacher_contracts enable row level security;
alter table public.payrolls enable row level security;

drop policy if exists "hr_admin_staff_contracts" on public.teacher_contracts;
drop policy if exists "hr_teacher_own_contract" on public.teacher_contracts;
drop policy if exists "hr_admin_staff_payrolls" on public.payrolls;
drop policy if exists "hr_teacher_own_payroll" on public.payrolls;

create policy "hr_admin_staff_contracts"
  on public.teacher_contracts for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

create policy "hr_teacher_own_contract"
  on public.teacher_contracts for select
  using (teacher_id = auth.uid());

create policy "hr_admin_staff_payrolls"
  on public.payrolls for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

create policy "hr_teacher_own_payroll"
  on public.payrolls for select
  using (teacher_id = auth.uid());
