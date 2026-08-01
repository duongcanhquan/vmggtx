-- ============================================================
-- 048: TÁI CẤU TRÚC CÂY TỔ CHỨC THEO ĐÚNG MÔ HÌNH KINH DOANH
--
-- MÔ HÌNH CHUẨN (docs/ORG_MODEL.md):
--   Hệ thống (hq, root — chỉ Super Admin)
--   └── KHÁCH HÀNG = Đơn vị (type='campus', có slug, có license)
--       └── Cơ sở / Trung tâm / Nhánh (type='branch', slug = mã đường dẫn con)
--
-- DỮ LIỆU DEMO CŨ BỊ NGƯỢC: "TRƯỜNG CAO ĐẲNG VIỆT MỸ" (khách hàng)
-- đang là root hq; các khối HN/HCM là 'region'; các cơ sở lá lại là
-- 'campus' có cổng /coso/ riêng — sai mô hình. Migration này:
--   1. Đổi root cũ thành "Hệ thống"; tạo Đơn vị khách hàng mang tên cũ
--      (kèm slug) ngay dưới root; dời toàn bộ cây xuống dưới Đơn vị đó.
--   2. Mọi node dưới Đơn vị -> 'branch' (GIỮ slug để làm URL phân cấp
--      /coso/khach-hang/co-so-1/nhanh-1).
--   3. Rebuild toàn bộ ltree path (trigger chỉ tính node bị đổi cha,
--      không lan xuống con cháu).
--   4. Gộp license lẻ ở các cơ sở lá lên Đơn vị khách hàng (union
--      module_keys, lấy hạn xa nhất) rồi xóa license cấp nhánh.
--
-- Idempotent: chỉ chạy phần tái cấu trúc khi root chưa mang tên 'Hệ thống'.
-- LƯU Ý: tài khoản campus_admin đang gắn ở node lá vẫn giữ nguyên org_id
-- (thành admin nhánh — quản trong nhánh đó). Admin TOÀN Đơn vị cần được
-- gắn org_id = Đơn vị khách hàng (chỉnh ở trang Tài khoản nếu cần).
-- ============================================================

-- ---------- 1 + 2: dựng lại cấu trúc ----------
do $$
declare
  v_root     uuid;
  v_root_name text;
  v_customer uuid;
  v_slug     text;
  n          int;
begin
  select id, name into v_root, v_root_name
  from public.organizations
  where parent_id is null and deleted_at is null
  order by created_at
  limit 1;

  if v_root is null then
    raise notice '048: khong tim thay root — bo qua.';
    return;
  end if;

  if v_root_name <> 'Hệ thống' then
    -- Sinh slug từ tên khách hàng (bỏ dấu tiếng Việt cơ bản)
    v_slug := lower(v_root_name);
    v_slug := translate(
      v_slug,
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    );
    v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    if v_slug = '' or length(v_slug) < 2 then v_slug := 'don-vi'; end if;
    if length(v_slug) > 40 then
      v_slug := regexp_replace(left(v_slug, 40), '-+$', '', 'g');
    end if;
    n := 2;
    while exists (
      select 1 from public.organizations o
      where o.slug = v_slug and o.deleted_at is null
    ) loop
      v_slug := left(v_slug, 40) || '-' || n::text;
      n := n + 1;
    end loop;

    -- Tạo Đơn vị KHÁCH HÀNG mang tên cũ, ngay dưới root
    insert into public.organizations (name, type, parent_id, slug)
    values (v_root_name, 'campus', v_root, v_slug)
    returning id into v_customer;

    -- Root cũ trở thành gốc hệ thống (chỉ Super Admin)
    update public.organizations
    set name = 'Hệ thống', slug = null
    where id = v_root;

    -- Dời toàn bộ con trực tiếp của root (trừ Đơn vị mới) xuống dưới Đơn vị
    update public.organizations
    set parent_id = v_customer
    where parent_id = v_root
      and id <> v_customer
      and deleted_at is null;

    raise notice '048: da tao Don vi khach hang "%" (slug %) va don cay xuong duoi.',
      v_root_name, v_slug;
  end if;

  -- Chuẩn hóa loại node theo tầng:
  -- con trực tiếp của root = KHÁCH HÀNG ('campus'); sâu hơn = 'branch'.
  update public.organizations o
  set type = 'campus'
  where o.deleted_at is null
    and o.parent_id = v_root
    and o.type <> 'campus';

  update public.organizations o
  set type = 'branch'
  where o.deleted_at is null
    and o.parent_id is not null
    and o.parent_id <> v_root
    and o.type in ('region', 'campus', 'hq');
end $$;

-- ---------- 3: rebuild TOÀN BỘ ltree path từ parent_id ----------
with recursive tree as (
  select id, replace(id::text, '-', '_')::ltree as new_path
  from public.organizations
  where parent_id is null
  union all
  select o.id, t.new_path || replace(o.id::text, '-', '_')::ltree
  from public.organizations o
  join tree t on o.parent_id = t.id
)
update public.organizations o
set path = t.new_path
from tree t
where o.id = t.id and o.path <> t.new_path;

-- ---------- 4: gộp license lên Đơn vị khách hàng ----------
-- Với mỗi Đơn vị (con trực tiếp của root): nếu chưa có license riêng mà
-- các nhánh bên trong có -> tạo license Đơn vị = union module, hạn xa nhất.
do $$
declare
  v_root uuid;
  r record;
  v_modules jsonb;
  v_until date;
begin
  select id into v_root
  from public.organizations
  where parent_id is null and deleted_at is null
  order by created_at limit 1;
  if v_root is null then return; end if;

  for r in
    select o.id
    from public.organizations o
    where o.parent_id = v_root and o.type = 'campus' and o.deleted_at is null
  loop
    if not exists (select 1 from public.tenant_licenses tl where tl.org_id = r.id) then
      -- union module_keys của mọi license trong cây con
      select
        coalesce(jsonb_agg(distinct mk), '[]'::jsonb),
        max(tl.valid_until)
      into v_modules, v_until
      from public.tenant_licenses tl
      join public.organizations d
        on d.id = tl.org_id and d.deleted_at is null
      cross join lateral jsonb_array_elements_text(to_jsonb(tl.module_keys)) as mk
      where d.path <@ (select path from public.organizations where id = r.id)
        and tl.org_id <> r.id;

      if v_modules is not null and jsonb_array_length(v_modules) > 0 then
        insert into public.tenant_licenses
          (org_id, plan_name, module_keys, valid_until, status)
        select r.id, 'custom',
               (select array_agg(x) from jsonb_array_elements_text(v_modules) as x),
               v_until, 'active';
      end if;
    end if;

    -- Xóa license cấp nhánh (license chỉ tồn tại ở cấp Đơn vị)
    delete from public.tenant_licenses tl
    using public.organizations d
    where tl.org_id = d.id
      and d.deleted_at is null
      and d.path <@ (select path from public.organizations where id = r.id)
      and tl.org_id <> r.id;
  end loop;
end $$;

-- Slug giờ dùng cho CẢ branch (mã đường dẫn con trong URL phân cấp)
comment on column public.organizations.slug is
  'Slug URL: campus = cổng /coso/[slug]; branch = mã đường dẫn con /coso/[campus]/[branch]/…';
