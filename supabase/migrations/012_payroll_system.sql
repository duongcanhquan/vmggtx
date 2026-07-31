-- ============================================================
-- GDTX ERP - 012_payroll_system
-- Hoàn thiện hệ thống tính lương phức tạp cho GDTX:
--   biên chế (full_time) / thỉnh giảng (visiting) / khoán giờ (hourly)
--
-- (Yêu cầu gốc đặt tên 005_payroll_system.sql nhưng số 005 đã dùng
--  bởi 005_matrix_rbac.sql. Migration 010 đã tạo teacher_contracts +
--  payrolls phiên bản đầu; file này NÂNG CẤP lên spec đầy đủ:
--   1. teacher_contracts: thêm loại 'hourly', thêm insurance_salary,
--      đổi tên cột theo chuẩn mới.
--   2. rate_modifiers: hệ số đơn giá theo môn/khối/lớp đặc biệt.
--   3. payrolls: thêm contract_snapshot (jsonb bằng chứng),
--      total_allowance, đổi tên cột lương.
--  MỌI bảng đều có org_id. "enum" cài bằng CHECK constraint - nhất
--  quán với toàn bộ schema hiện có, dễ mở rộng giá trị về sau.)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. NÂNG CẤP teacher_contracts
-- ---------------------------------------------------------------

-- 1.1 contract_type: bổ sung 'hourly' (khoán giờ).
--     Giữ 'probation' cho dữ liệu cũ (migration 010) không bị gãy.
alter table public.teacher_contracts
  drop constraint if exists teacher_contracts_contract_type_check;
alter table public.teacher_contracts
  add constraint teacher_contracts_contract_type_check
  check (contract_type in ('full_time', 'visiting', 'hourly', 'probation'));

-- 1.2 Đổi tên cột theo spec mới (an toàn khi chạy lại nhờ check tồn tại)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'teacher_contracts'
               and column_name = 'hourly_rate') then
    alter table public.teacher_contracts rename column hourly_rate to base_hourly_rate;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'teacher_contracts'
               and column_name = 'required_hours') then
    alter table public.teacher_contracts
      rename column required_hours to required_hours_per_month;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'teacher_contracts'
               and column_name = 'insurance_rate') then
    alter table public.teacher_contracts
      rename column insurance_rate to insurance_percentage;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'teacher_contracts'
               and column_name = 'tax_rate') then
    alter table public.teacher_contracts rename column tax_rate to tax_percentage;
  end if;
end $$;

-- 1.3 Mức lương làm căn cứ đóng BHXH (0 = dùng base_salary)
alter table public.teacher_contracts
  add column if not exists insurance_salary numeric(14, 2) not null default 0
  check (insurance_salary >= 0);

comment on column public.teacher_contracts.contract_type is
  'full_time: biên chế | visiting: thỉnh giảng | hourly: khoán giờ | probation: thử việc (legacy)';
comment on column public.teacher_contracts.base_salary is
  'Lương cơ bản - áp dụng cho full_time';
comment on column public.teacher_contracts.insurance_salary is
  'Mức lương làm căn cứ đóng BHXH (0 = dùng base_salary)';
comment on column public.teacher_contracts.required_hours_per_month is
  'Số tiết nghĩa vụ/tháng (full_time)';
comment on column public.teacher_contracts.base_hourly_rate is
  'Đơn giá 1 tiết mặc định (visiting/hourly) hoặc đơn giá tiết vượt giờ (full_time)';
comment on column public.teacher_contracts.tax_percentage is
  'Mức khấu trừ thuế TNCN, ví dụ 10 = 10%';
comment on column public.teacher_contracts.insurance_percentage is
  'Mức trích BHXH/BHYT người lao động, ví dụ 10.5 = 10.5%';

-- ---------------------------------------------------------------
-- 2. BẢNG rate_modifiers (Hệ số đơn giá)
-- ---------------------------------------------------------------
-- Ví dụ: dạy Toán đơn giá x1.2; Khối 12 cộng thêm 20.000đ/tiết.
create table if not exists public.rate_modifiers (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations (id),
  condition_type   text not null
                   check (condition_type in ('subject', 'grade_level', 'special_class')),
  condition_value  varchar(120) not null,          -- 'Toán', 'Khối 12', 'Lớp VIP'...
  rate_multiplier  numeric(6, 3) not null default 1
                   check (rate_multiplier > 0),    -- hệ số nhân đơn giá, VD 1.2
  added_amount     numeric(12, 2) not null default 0
                   check (added_amount >= 0),      -- tiền cộng thêm cố định/tiết
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists idx_rate_modifiers_org on public.rate_modifiers (org_id);
create index if not exists idx_rate_modifiers_condition
  on public.rate_modifiers (condition_type, condition_value);

drop trigger if exists trg_rate_modifiers_updated_at on public.rate_modifiers;
create trigger trg_rate_modifiers_updated_at
  before update on public.rate_modifiers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 3. NÂNG CẤP payrolls
-- ---------------------------------------------------------------

-- 3.1 Đổi tên cột lương theo spec mới
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'payrolls'
               and column_name = 'regular_hours_pay') then
    alter table public.payrolls rename column regular_hours_pay to regular_pay;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'payrolls'
               and column_name = 'overtime_hours_pay') then
    alter table public.payrolls rename column overtime_hours_pay to teaching_pay;
  end if;
end $$;

-- 3.2 Snapshot hợp đồng tại thời điểm chốt (BẰNG CHỨNG pháp lý -
--     hợp đồng đổi sau này không làm sai lệch bảng lương đã chốt)
alter table public.payrolls
  add column if not exists contract_snapshot jsonb;

-- 3.3 Tổng phụ cấp (từ rate_modifiers hoặc nhập tay)
alter table public.payrolls
  add column if not exists total_allowance numeric(14, 2) not null default 0
  check (total_allowance >= 0);

comment on column public.payrolls.contract_snapshot is
  'Bản chụp JSON của teacher_contracts tại thời điểm chốt lương';
comment on column public.payrolls.regular_pay is 'Lương cơ bản (full_time)';
comment on column public.payrolls.teaching_pay is 'Tiền dạy theo tiết / overtime';
comment on column public.payrolls.total_allowance is 'Tổng phụ cấp (hệ số đơn giá, thưởng...)';

-- ---------------------------------------------------------------
-- 4. RLS cho rate_modifiers (teacher_contracts/payrolls đã bật ở 010)
-- ---------------------------------------------------------------
alter table public.rate_modifiers enable row level security;

drop policy if exists "rate_modifiers_admin_staff" on public.rate_modifiers;
drop policy if exists "rate_modifiers_teacher_read" on public.rate_modifiers;

-- Admin/Giáo vụ: toàn quyền trong subtree tổ chức của mình
create policy "rate_modifiers_admin_staff"
  on public.rate_modifiers for all
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

-- Giáo viên được ĐỌC hệ số của org mình (minh bạch cách tính lương)
create policy "rate_modifiers_teacher_read"
  on public.rate_modifiers for select
  using (
    public.get_my_role() = 'teacher'
    and org_id = public.get_my_org_id()
  );
