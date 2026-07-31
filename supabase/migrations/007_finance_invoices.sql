-- ============================================================
-- GDTX ERP - 007_finance_invoices
-- Module Tài chính: Học phí & Công nợ.
--   invoices : hóa đơn học phí của học viên (theo org_id)
--   payments : phiếu thu từng đợt (thu một phần hoặc toàn bộ)
-- Trạng thái hóa đơn được backend tự chuyển:
--   pending -> partial (thu chưa đủ) -> paid (SUM phiếu thu = amount)
-- ============================================================

-- 1. BẢNG invoices (Hóa đơn) -----------------------------------
create table if not exists public.invoices (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  student_id  uuid not null references public.profiles (id),
  amount      numeric(14, 2) not null check (amount > 0),
  status      text not null default 'pending'
              check (status in ('pending', 'partial', 'paid', 'cancelled')),
  due_date    date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_invoices_org on public.invoices (org_id);
create index if not exists idx_invoices_student on public.invoices (student_id);
create index if not exists idx_invoices_status_due on public.invoices (status, due_date);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- 2. BẢNG payments (Phiếu thu) ---------------------------------
create table if not exists public.payments (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  invoice_id      uuid not null references public.invoices (id),
  amount_paid     numeric(14, 2) not null check (amount_paid > 0),
  payment_method  text not null check (payment_method in ('cash', 'transfer')),
  recorded_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists idx_payments_org on public.payments (org_id);
create index if not exists idx_payments_invoice on public.payments (invoice_id);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- 3. ROW LEVEL SECURITY ----------------------------------------
-- Tái sử dụng helper của migration 005:
--   get_my_role()             : role của user đang đăng nhập
--   is_org_in_my_subtree(org) : org có thuộc nhánh tổ chức của tôi không
-- Quyền: super_admin thấy tất cả; campus_admin/academic_staff thao tác
-- trong subtree; teacher/student KHÔNG truy cập trực tiếp bảng tài chính.

alter table public.invoices enable row level security;
alter table public.payments enable row level security;

drop policy if exists "finance_select_invoices" on public.invoices;
drop policy if exists "finance_write_invoices"  on public.invoices;
drop policy if exists "finance_update_invoices" on public.invoices;
drop policy if exists "finance_select_payments" on public.payments;
drop policy if exists "finance_write_payments"  on public.payments;

create policy "finance_select_invoices"
  on public.invoices for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

create policy "finance_write_invoices"
  on public.invoices for insert
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

create policy "finance_update_invoices"
  on public.invoices for update
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

create policy "finance_select_payments"
  on public.payments for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

create policy "finance_write_payments"
  on public.payments for insert
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );
