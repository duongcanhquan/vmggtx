-- ============================================================
-- 054: CRM — đánh giá tư vấn + thông tin đóng tiền trên lead
-- ============================================================

alter table public.leads
  add column if not exists strengths text,
  add column if not exists weaknesses text,
  add column if not exists needs text,
  add column if not exists potential_rating text,
  add column if not exists deposit_amount numeric(14, 2),
  add column if not exists payment_notes text;

alter table public.leads drop constraint if exists leads_potential_rating_check;
alter table public.leads
  add constraint leads_potential_rating_check
  check (
    potential_rating is null
    or potential_rating in ('high', 'medium', 'low', 'unknown')
  );

comment on column public.leads.strengths is 'Diem manh (tu van)';
comment on column public.leads.weaknesses is 'Diem yeu (tu van)';
comment on column public.leads.needs is 'Nhu cau hoc vien / gia dinh';
comment on column public.leads.potential_rating is 'Danh gia tiem nang: high|medium|low|unknown';
comment on column public.leads.deposit_amount is 'So tien dat coc / dong truoc khi nhap hoc';
comment on column public.leads.payment_notes is 'Ghi chu dong tien tuyen sinh';
