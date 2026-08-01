-- ================================================================
-- 044: TẦNG LICENSE - BÁN ACCOUNT THEO CƠ SỞ (SaaS thương mại)
-- - Mỗi CƠ SỞ (thường là org type 'campus') có 1 license: gói dịch vụ,
--   danh sách MODULE được bật (menu_keys của menuRegistry.ts),
--   giới hạn học viên, hạn dùng, trạng thái active/suspended.
-- - Kế thừa theo cây: user ở nhánh con chịu license của org gần nhất
--   phía trên có license.
-- - get_my_menu_keys được nâng cấp: kết quả = ma trận phân quyền (043)
--   GIAO VỚI module đã mua -> không mua module thì campus_admin cũng
--   không thấy/không vào được, và không thể cấp cho nhân viên.
-- - Không có license = hệ thống nội bộ/legacy -> full quyền (fail-open).
-- ================================================================

create table if not exists public.tenant_licenses (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  plan_name     text not null default 'custom',
  -- Module đã mua (menu key theo menuRegistry.ts phía app)
  module_keys   text[] not null default '{}',
  -- null = không giới hạn học viên
  max_students  integer check (max_students is null or max_students > 0),
  -- null = vĩnh viễn
  valid_until   date,
  status        text not null default 'active'
                check (status in ('active', 'suspended')),
  notes         text,
  created_by    uuid references public.profiles (id),
  updated_at    timestamptz not null default now(),
  constraint uq_tenant_licenses_org unique (org_id)
);

create index if not exists idx_tenant_licenses_org on public.tenant_licenses (org_id);

alter table public.tenant_licenses enable row level security;

-- Chỉ super_admin thao tác trực tiếp bảng (bán hàng). App đọc license
-- của chính mình qua RPC get_my_license (security definer) bên dưới.
drop policy if exists "tenant_licenses_super_all" on public.tenant_licenses;
create policy "tenant_licenses_super_all"
  on public.tenant_licenses for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop trigger if exists trg_tenant_licenses_updated_at on public.tenant_licenses;
create trigger trg_tenant_licenses_updated_at
  before update on public.tenant_licenses
  for each row execute function public.set_updated_at();

comment on table public.tenant_licenses is
  'License theo cơ sở: gói + module đã mua + hạn dùng + giới hạn HV. Kế thừa xuống nhánh con.';

-- ----------------------------------------------------------------
-- RPC: license hiệu lực của CHÍNH user đang gọi (license của org
-- gần nhất trên chuỗi tổ tiên có license). null = không có license
-- (hệ thống nội bộ -> app fail-open). super_admin luôn null.
-- ----------------------------------------------------------------
create or replace function public.get_my_license()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org  uuid;
  v_lic  jsonb;
begin
  select p.role, p.org_id into v_role, v_org
  from profiles p
  where p.id = auth.uid() and p.deleted_at is null;

  if v_role is null or v_role = 'super_admin' or v_org is null then
    return null;
  end if;

  with recursive chain as (
    select o.id, o.parent_id, 0 as depth
    from organizations o
    where o.id = v_org
    union all
    select parent.id, parent.parent_id, chain.depth + 1
    from organizations parent
    join chain on parent.id = chain.parent_id
  )
  select jsonb_build_object(
    'org_id', tl.org_id,
    'plan_name', tl.plan_name,
    'module_keys', to_jsonb(tl.module_keys),
    'max_students', tl.max_students,
    'valid_until', tl.valid_until,
    'status', tl.status
  ) into v_lic
  from chain
  join tenant_licenses tl on tl.org_id = chain.id
  order by chain.depth asc
  limit 1;

  return v_lic;
end $$;

grant execute on function public.get_my_license() to authenticated;

comment on function public.get_my_license() is
  'License hiệu lực của user hiện tại (org gần nhất phía trên có license). null = không có license.';

-- ----------------------------------------------------------------
-- NÂNG CẤP get_my_menu_keys (043): giao ma trận phân quyền với
-- module đã mua trong license.
--   override o (null = dùng default), license l (null = không cap):
--   - o null,  l null  -> null (ma trận mặc định, full theo role)
--   - o null,  l có    -> l   (default theo role NHƯNG cap bởi module mua)
--   - o có,    l null  -> o
--   - o có,    l có    -> o ∩ l
-- ----------------------------------------------------------------
create or replace function public.get_my_menu_keys()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org  uuid;
  v_keys text[];
  v_lic  text[];
begin
  select p.role, p.org_id into v_role, v_org
  from profiles p
  where p.id = auth.uid() and p.deleted_at is null;

  if v_role is null or v_role = 'super_admin' or v_org is null then
    return null;
  end if;

  with recursive chain as (
    select o.id, o.parent_id, 0 as depth
    from organizations o
    where o.id = v_org
    union all
    select parent.id, parent.parent_id, chain.depth + 1
    from organizations parent
    join chain on parent.id = chain.parent_id
  ),
  override as (
    select mp.menu_keys
    from chain
    join menu_permissions mp on mp.org_id = chain.id and mp.role = v_role
    order by chain.depth asc
    limit 1
  ),
  license as (
    select tl.module_keys
    from chain
    join tenant_licenses tl on tl.org_id = chain.id
    order by chain.depth asc
    limit 1
  )
  select (select menu_keys from override), (select module_keys from license)
  into v_keys, v_lic;

  if v_lic is null then
    return v_keys;
  end if;
  if v_keys is null then
    return v_lic;
  end if;
  return coalesce(
    (select array_agg(k) from unnest(v_keys) k where k = any (v_lic)),
    '{}'::text[]
  );
end $$;

grant execute on function public.get_my_menu_keys() to authenticated;

comment on function public.get_my_menu_keys() is
  'Menu key hiệu lực = override phân quyền (043) GIAO module đã mua (044). null = full mặc định.';
