-- ================================================================
-- 056: CHỨC DANH + MẪU QUYỀN MENU (theo cơ sở)
-- - Giữ role kỹ thuật (admin/giáo vụ/GV…) cho cổng + RLS (D08/D10).
-- - Thêm chức danh tùy tên (org-scoped) = mẫu menu_keys (tick).
-- - Gán profiles.job_title_id; quyền hiệu lực = title ∪ user grants.
-- - Kiêm nhiệm (049) vẫn chỉnh lệch từng người (cộng thêm).
-- ================================================================

-- 1. BẢNG job_titles ---------------------------------------------
create table if not exists public.job_titles (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  name            text not null,
  description     text,
  -- Gợi ý vai trò kỹ thuật khi tạo nhân sự (KHÔNG thay role thật)
  suggested_role  text check (
    suggested_role is null or suggested_role in (
      'campus_admin', 'academic_staff', 'admission_staff',
      'accountant', 'teacher'
    )
  ),
  menu_keys       text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists uq_job_titles_org_name_active
  on public.job_titles (org_id, lower(name))
  where deleted_at is null;

create index if not exists idx_job_titles_org
  on public.job_titles (org_id)
  where deleted_at is null;

alter table public.job_titles enable row level security;

drop policy if exists "job_titles_super_all" on public.job_titles;
create policy "job_titles_super_all"
  on public.job_titles for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "job_titles_campus_manage" on public.job_titles;
create policy "job_titles_campus_manage"
  on public.job_titles for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- Nhân sự trong subtree đọc được tên chức danh (hiển thị)
drop policy if exists "job_titles_subtree_read" on public.job_titles;
create policy "job_titles_subtree_read"
  on public.job_titles for select
  using (
    deleted_at is null
    and public.is_org_in_my_subtree(org_id)
  );

drop trigger if exists trg_job_titles_updated_at on public.job_titles;
create trigger trg_job_titles_updated_at
  before update on public.job_titles
  for each row execute function public.set_updated_at();

comment on table public.job_titles is
  'Chức danh tùy cơ sở = mẫu menu_keys. Role kỹ thuật vẫn ở profiles.role (D08/D10).';

-- 2. profiles.job_title_id ---------------------------------------
alter table public.profiles
  add column if not exists job_title_id uuid
    references public.job_titles (id);

create index if not exists idx_profiles_job_title
  on public.profiles (job_title_id)
  where deleted_at is null and job_title_id is not null;

comment on column public.profiles.job_title_id is
  'Chức danh (mẫu quyền) — union với user_menu_permissions khi tính grant.';

-- 3. has_menu_grant / get_my_menu_grants: title ∪ grants ----------
create or replace function public.has_menu_grant(p_user_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.user_menu_permissions ump
      on ump.user_id = p.id
    left join public.job_titles jt
      on jt.id = p.job_title_id
     and jt.deleted_at is null
    where p.id = p_user_id
      and p.deleted_at is null
      and (
        (ump.menu_keys is not null and p_key = any (ump.menu_keys))
        or (jt.menu_keys is not null and p_key = any (jt.menu_keys))
      )
  );
$$;

grant execute on function public.has_menu_grant(uuid, text) to authenticated;

create or replace function public.get_my_menu_grants()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array(
        select distinct k
        from (
          select unnest(coalesce(ump.menu_keys, '{}'::text[])) as k
          from public.user_menu_permissions ump
          where ump.user_id = auth.uid()
          union all
          select unnest(coalesce(jt.menu_keys, '{}'::text[])) as k
          from public.profiles p
          join public.job_titles jt
            on jt.id = p.job_title_id
           and jt.deleted_at is null
          where p.id = auth.uid()
            and p.deleted_at is null
        ) keys
        where k is not null and k <> ''
      )
    ),
    '{}'::text[]
  );
$$;

grant execute on function public.get_my_menu_grants() to authenticated;

comment on function public.get_my_menu_grants() is
  'Menu grants hiệu lực = chức danh (056) ∪ kiêm nhiệm (049).';
