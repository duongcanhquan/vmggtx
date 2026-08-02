-- ============================================================
-- 050 — Tài khoản phụ huynh (email + mật khẩu)
-- Không dùng Supabase Auth session; sau khi xác thực cấp cookie
-- parent_session (HMAC) như luồng OTP cũ.
-- ============================================================

create table if not exists public.parent_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  student_id uuid not null references public.profiles (id),
  email text not null,
  password_hash text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.parent_accounts is
  'Tai khoan phu huynh: email + mat khau. Session = cookie HMAC parent_session.';

create unique index if not exists uq_parent_accounts_email_alive
  on public.parent_accounts (lower(email))
  where deleted_at is null;

create index if not exists idx_parent_accounts_student
  on public.parent_accounts (student_id)
  where deleted_at is null;

create index if not exists idx_parent_accounts_org
  on public.parent_accounts (org_id)
  where deleted_at is null;

alter table public.parent_accounts enable row level security;

-- Chi service_role / admin thao tac (login + quan tri). Khong policy public.
-- Staff co the xem trong subtree (sau nay UI quan ly PH).
drop policy if exists parent_accounts_staff_select on public.parent_accounts;
create policy parent_accounts_staff_select
  on public.parent_accounts
  for select
  to authenticated
  using (
    deleted_at is null
    and public.is_org_in_my_subtree(org_id)
  );

-- Demo: tao 1 TK phu huynh / hoc vien neu chua co
-- Mat khau Demo@123456 (scrypt salt:hash)
do $$
declare
  v_hash text := '5ced20b76d1c784a8484ec6bccaa1394:db80d23336e993af8959e4ba146ec7e12c2c1aecdc7342b05e8c07c98ebefe8b2d64159a1e9978e892edb3427c09221fbef78c5513a23f9057eecff2c3985a68';
  r record;
  v_email text;
begin
  for r in
    select p.id as student_id, p.org_id, p."MaSV" as masv, p.full_name
    from public.profiles p
    where p.role = 'student'
      and p.deleted_at is null
      and p."MaSV" is not null
    order by p."MaSV"
    limit 40
  loop
    v_email := 'parent.' || lower(replace(coalesce(r.masv, r.student_id::text), '-', '')) || '@gdtx-demo.edu.vn';
    if not exists (
      select 1 from public.parent_accounts pa
      where lower(pa.email) = lower(v_email) and pa.deleted_at is null
    ) then
      insert into public.parent_accounts (org_id, student_id, email, password_hash, full_name)
      values (
        r.org_id,
        r.student_id,
        v_email,
        v_hash,
        'Phụ huynh của ' || coalesce(r.full_name, r.masv)
      );
    end if;
  end loop;
end $$;
