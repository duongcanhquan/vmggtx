-- ================================================================
-- 043: MA TRẬN PHÂN QUYỀN MENU ĐỘNG (2 tầng ủy quyền)
-- - super_admin cấp quyền menu cho campus_admin của từng trường.
-- - campus_admin cấp tiếp cho giáo vụ/tuyển sinh/kế toán/giáo viên
--   trong cơ sở của mình (KHÔNG vượt quá quyền mình được cấp -
--   chặn ở Server Action).
-- - Kế thừa theo CÂY tổ chức: user lấy override GẦN NHẤT tính từ
--   org của mình đi ngược lên gốc; không có override -> ma trận
--   mặc định trong code (menuRegistry.ts).
-- - Không được cấp -> không thấy menu + middleware chặn URL.
-- ================================================================

create table if not exists public.menu_permissions (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  role        text not null check (role in (
                'campus_admin', 'academic_staff', 'admission_staff',
                'accountant', 'teacher'
              )),
  -- Danh sách menu key được phép (theo menuRegistry.ts phía app)
  menu_keys   text[] not null default '{}',
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now(),
  constraint uq_menu_permissions_org_role unique (org_id, role)
);

create index if not exists idx_menu_permissions_org on public.menu_permissions (org_id);

alter table public.menu_permissions enable row level security;

-- super_admin: toàn quyền mọi cơ sở, mọi role
drop policy if exists "menu_perms_super_all" on public.menu_permissions;
create policy "menu_perms_super_all"
  on public.menu_permissions for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- campus_admin: quản lý trong SUBTREE của mình, KHÔNG được tự sửa
-- quyền của role campus_admin (quyền đó do super_admin cấp)
drop policy if exists "menu_perms_campus_manage" on public.menu_permissions;
create policy "menu_perms_campus_manage"
  on public.menu_permissions for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
    and role <> 'campus_admin'
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
    and role <> 'campus_admin'
  );

-- campus_admin cần ĐỌC được cả dòng campus_admin của org mình
-- (để biết trần quyền được cấp - không sửa được vì policy trên)
drop policy if exists "menu_perms_campus_read_own" on public.menu_permissions;
create policy "menu_perms_campus_read_own"
  on public.menu_permissions for select
  using (
    public.get_my_role() = 'campus_admin'
    and (public.is_org_in_my_subtree(org_id) or org_id = public.get_my_org_id())
  );

drop trigger if exists trg_menu_permissions_updated_at on public.menu_permissions;
create trigger trg_menu_permissions_updated_at
  before update on public.menu_permissions
  for each row execute function public.set_updated_at();

comment on table public.menu_permissions is
  'Ghi đè ma trận menu theo (org, role). Kế thừa: override gần nhất trên cây org thắng; không có -> default trong code.';

-- ----------------------------------------------------------------
-- RPC: bộ menu key hiệu lực của CHÍNH user đang gọi.
-- SECURITY DEFINER: tự walk cây tổ chức (bỏ qua RLS bảng orgs).
-- Trả về:
--   null  = không có override -> app dùng ma trận mặc định
--   text[]= danh sách key được phép (override gần nhất)
-- super_admin luôn trả null (thấy tất cả theo default matrix).
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
  select mp.menu_keys into v_keys
  from chain
  join menu_permissions mp on mp.org_id = chain.id and mp.role = v_role
  order by chain.depth asc
  limit 1;

  return v_keys;
end $$;

grant execute on function public.get_my_menu_keys() to authenticated;

comment on function public.get_my_menu_keys() is
  'Menu key hiệu lực của user hiện tại (override gần nhất trên cây org). null = dùng ma trận mặc định.';
