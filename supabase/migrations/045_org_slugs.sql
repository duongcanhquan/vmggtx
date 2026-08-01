-- ============================================================
-- 045: Slug công khai cho cơ sở → cổng /coso/[slug]
--
-- Mỗi cơ sở (type=campus) có slug duy nhất (VD: cau-giay) để
-- vào cổng riêng: /coso/cau-giay (landing + link 3 cổng login).
-- Path-based (không cần DNS subdomain). Region/branch không bắt buộc slug.
-- ============================================================

alter table public.organizations
  add column if not exists slug text;

comment on column public.organizations.slug is
  'Slug URL công khai (chỉ campus). VD cau-giay → /coso/cau-giay';

-- Chuẩn hóa: lowercase, a-z 0-9 gạch ngang
alter table public.organizations
  drop constraint if exists organizations_slug_format;
alter table public.organizations
  add constraint organizations_slug_format
  check (
    slug is null
    or slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'
  );

-- Unique trong các bản ghi còn sống
create unique index if not exists idx_organizations_slug_live
  on public.organizations (slug)
  where slug is not null and deleted_at is null;

-- Backfill slug cho campus chưa có (từ tên, bỏ dấu + unique suffix)
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, name
    from public.organizations
    where type = 'campus'
      and deleted_at is null
      and (slug is null or btrim(slug) = '')
  loop
    base := lower(r.name);
    -- bỏ dấu tiếng Việt cơ bản
    base := translate(
      base,
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    );
    base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    if base = '' or length(base) < 2 then
      base := 'coso';
    end if;
    if length(base) > 40 then
      base := left(base, 40);
      base := regexp_replace(base, '-+$', '', 'g');
    end if;

    candidate := base;
    n := 2;
    while exists (
      select 1 from public.organizations o
      where o.slug = candidate and o.deleted_at is null and o.id <> r.id
    ) loop
      candidate := left(base, 40) || '-' || n::text;
      n := n + 1;
    end loop;

    update public.organizations set slug = candidate where id = r.id;
  end loop;
end $$;

-- RPC công khai: lấy thông tin cơ sở theo slug (chỉ id/name/slug)
create or replace function public.get_public_campus_by_slug(p_slug text)
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug
  from public.organizations o
  where o.deleted_at is null
    and o.type = 'campus'
    and o.slug = lower(trim(p_slug))
  limit 1;
$$;

revoke all on function public.get_public_campus_by_slug(text) from public;
grant execute on function public.get_public_campus_by_slug(text) to anon, authenticated;

comment on function public.get_public_campus_by_slug(text) is
  'Tra cứu công khai cơ sở theo slug cho cổng /coso/[slug] (không lộ dữ liệu nhạy cảm).';

-- Danh sách cơ sở công khai cho trang /coso (chọn cơ sở để vào login)
create or replace function public.list_public_campuses()
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug
  from public.organizations o
  where o.deleted_at is null
    and o.type = 'campus'
    and o.slug is not null
  order by o.name;
$$;

revoke all on function public.list_public_campuses() from public;
grant execute on function public.list_public_campuses() to anon, authenticated;

comment on function public.list_public_campuses() is
  'Danh sách cơ sở có slug — trang /coso chọn cơ sở để đăng nhập.';
