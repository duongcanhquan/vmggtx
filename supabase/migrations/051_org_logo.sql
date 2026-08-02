-- ============================================================
-- 051 — Logo thương hiệu theo tổ chức (cổng login + trong app)
-- logo_url  : URL hiển thị (CDN công khai hoặc /api/org-logo/{id})
-- logo_key  : object key trên Cloudflare R2 (khi dùng API stream)
-- ============================================================

alter table public.organizations
  add column if not exists logo_url text;

alter table public.organizations
  add column if not exists logo_key text;

comment on column public.organizations.logo_url is
  'URL logo hien thi (https://… hoac /api/org-logo/{id}). NULL = dung emblem EDU SYSTEM.';
comment on column public.organizations.logo_key is
  'R2 object key cua logo; dung khi phuc vu qua /api/org-logo/{id}.';

-- RPC cong khai: tra them logo_url
-- Postgres KHONG cho CREATE OR REPLACE khi doi OUT/returns table
-- (045 chi co id,name,slug) -> DROP roi tao lai.
drop function if exists public.get_public_campus_by_slug(text);
drop function if exists public.list_public_campuses();

create function public.get_public_campus_by_slug(p_slug text)
returns table (id uuid, name text, slug text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug, o.logo_url
  from public.organizations o
  where o.deleted_at is null
    and o.type = 'campus'
    and o.slug = lower(trim(p_slug))
  limit 1;
$$;

revoke all on function public.get_public_campus_by_slug(text) from public;
grant execute on function public.get_public_campus_by_slug(text) to anon, authenticated;

create function public.list_public_campuses()
returns table (id uuid, name text, slug text, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug, o.logo_url
  from public.organizations o
  where o.deleted_at is null
    and o.type = 'campus'
    and o.slug is not null
  order by o.name;
$$;

revoke all on function public.list_public_campuses() from public;
grant execute on function public.list_public_campuses() to anon, authenticated;
