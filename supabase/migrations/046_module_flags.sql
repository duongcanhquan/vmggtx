-- ================================================================
-- 046: MODULE FLAGS - Trung tâm Module của Super Admin
-- - Bật/tắt CẢ MODULE hoặc 1 PHẦN (feature) của module:
--   + org_id NULL  = áp dụng TOÀN HỆ THỐNG.
--   + org_id có    = áp dụng cho cơ sở đó (và toàn subtree bên dưới).
--   + feature_key NULL = cả module; có = 1 tính năng con (VD 'students.import').
-- - Chỉ lưu dòng khi TẮT (enabled = false) hoặc muốn ghi chú; không có
--   dòng = đang BẬT (mặc định mọi thứ bật -> bảng nhỏ, tra nhanh).
-- - RPC get_my_module_flags() trả về danh sách module/feature bị tắt
--   với user hiện tại (gộp global + chuỗi org tổ tiên) -> middleware
--   chặn URL, client ẩn menu/nút. super_admin không bị chặn.
-- ================================================================

create table if not exists public.module_flags (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid references public.organizations (id) on delete cascade,
  module_key  text not null,
  feature_key text,
  enabled     boolean not null default true,
  note        text,
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

-- Unique kể cả khi org_id/feature_key null (tránh 2 dòng trùng phạm vi)
create unique index if not exists module_flags_scope_uq
  on public.module_flags (
    coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
    module_key,
    coalesce(feature_key, '')
  );

create index if not exists module_flags_org_idx on public.module_flags (org_id);

alter table public.module_flags enable row level security;

-- Mọi user đăng nhập đọc được (client cần biết để ẩn UI)
drop policy if exists module_flags_select on public.module_flags;
create policy module_flags_select on public.module_flags
  for select to authenticated using (true);

-- Chỉ super_admin ghi
drop policy if exists module_flags_write on public.module_flags;
create policy module_flags_write on public.module_flags
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
        and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
        and p.deleted_at is null
    )
  );

-- ----------------------------------------------------------------
-- RPC: danh sách module/feature bị TẮT hiệu lực với user hiện tại.
-- Trả về jsonb: { "modules": ["crm", ...], "features": ["students.import", ...] }
-- Gộp: global (org_id null) + mọi org trên chuỗi tổ tiên của org user.
-- super_admin -> luôn rỗng (không bị chặn để còn quản trị).
-- ----------------------------------------------------------------
create or replace function public.get_my_module_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role   text;
  v_org    uuid;
  v_result jsonb;
begin
  select role, org_id into v_role, v_org
  from profiles
  where id = auth.uid() and deleted_at is null;

  if v_role is null or v_role = 'super_admin' then
    return jsonb_build_object('modules', '[]'::jsonb, 'features', '[]'::jsonb);
  end if;

  with recursive chain as (
    select o.id, o.parent_id from organizations o where o.id = v_org
    union all
    select parent.id, parent.parent_id
    from organizations parent
    join chain on parent.id = chain.parent_id
  ),
  off_flags as (
    select mf.module_key, mf.feature_key
    from module_flags mf
    where mf.enabled = false
      and (mf.org_id is null or mf.org_id in (select id from chain))
  )
  select jsonb_build_object(
    'modules',
    coalesce(
      (select jsonb_agg(distinct module_key) from off_flags where feature_key is null),
      '[]'::jsonb
    ),
    'features',
    coalesce(
      (select jsonb_agg(distinct module_key || '.' || feature_key)
       from off_flags where feature_key is not null),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.get_my_module_flags() to authenticated;

comment on table public.module_flags is
  'Công tắc module/feature của Super Admin: global (org_id null) hoặc theo cơ sở. Chỉ lưu dòng khi tắt.';
comment on function public.get_my_module_flags() is
  'Module/feature bị tắt hiệu lực với user hiện tại: {modules: [], features: []}. super_admin luôn rỗng.';
