-- ============================================================
-- 074: Thanh toán học phí atomic + đặt CSVC trạng thái pending
-- Idempotent. CHƯA chạy trên DB thật → user chạy SQL Editor.
-- ============================================================

-- 1) Thu tiền atomic (FOR UPDATE chống race double-pay)
create or replace function public.record_payment_atomic(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
  v_paid_before numeric(14, 2);
  v_remaining numeric(14, 2);
  v_paid_total numeric(14, 2);
  v_new_status text;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error', 'So tien thu phai > 0.');
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer') then
    return jsonb_build_object('error', 'Phuong thuc thanh toan khong hop le.');
  end if;

  select * into v_inv
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('error', 'Hoa don khong ton tai hoac ban khong co quyen.');
  end if;
  if v_inv.status = 'paid' then
    return jsonb_build_object('error', 'Hoa don nay da thanh toan du.');
  end if;
  if v_inv.status = 'cancelled' then
    return jsonb_build_object('error', 'Hoa don da bi huy, khong the thu tien.');
  end if;

  select coalesce(sum(amount_paid), 0) into v_paid_before
  from public.payments
  where invoice_id = p_invoice_id
    and deleted_at is null;

  v_remaining := v_inv.amount - v_paid_before;
  if p_amount > v_remaining then
    return jsonb_build_object(
      'error',
      format('So tien thu vuot so con lai (%s).', v_remaining)
    );
  end if;

  insert into public.payments (org_id, invoice_id, amount_paid, payment_method, recorded_by)
  values (v_inv.org_id, p_invoice_id, p_amount, p_payment_method, p_recorded_by);

  v_paid_total := v_paid_before + p_amount;
  v_new_status := case when v_paid_total >= v_inv.amount then 'paid' else 'partial' end;

  update public.invoices
  set status = v_new_status
  where id = p_invoice_id;

  return jsonb_build_object(
    'new_status', v_new_status,
    'remaining', v_inv.amount - v_paid_total
  );
end;
$$;

comment on function public.record_payment_atomic is
  '074: Thu tien hoa don trong 1 transaction (FOR UPDATE) — chong double-pay.';

grant execute on function public.record_payment_atomic(uuid, numeric, text, uuid) to authenticated;

-- 2) Dat CSVC: them trang thai pending (cho duyet)
alter table public.facility_bookings drop constraint if exists facility_bookings_status_check;
alter table public.facility_bookings
  add constraint facility_bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled'));

-- Exclusion chi chan khung gio da confirmed (pending chua khoa)
do $$ begin
  alter table public.facility_bookings drop constraint if exists excl_facility_booking_overlap;
exception when undefined_object then null;
end $$;

alter table public.facility_bookings
  add constraint excl_facility_booking_overlap
  exclude using gist (
    facility_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status = 'confirmed' and deleted_at is null);

-- Cap nhat RPC conflict: chi coi confirmed la trung
create or replace function public.check_facility_conflict(
  p_facility_id uuid,
  p_start_time  timestamptz,
  p_end_time    timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.facility_bookings fb
    where fb.facility_id = p_facility_id
      and fb.status = 'confirmed'
      and fb.deleted_at is null
      and tstzrange(fb.start_time, fb.end_time) && tstzrange(p_start_time, p_end_time)
  );
$$;

-- Cho phep insert pending (GV) hoac confirmed (duyet)
drop policy if exists "facility_bookings_member_insert" on public.facility_bookings;
create policy "facility_bookings_member_insert"
  on public.facility_bookings for insert
  with check (
    reserved_by = auth.uid()
    and status in ('pending', 'confirmed')
    and exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and f.org_id = public.get_my_org_id()
        and f.is_active = true
        and f.deleted_at is null
    )
  );
