-- ============================================================
-- GDTX ERP - 019_dynamic_fields
-- HỆ THỐNG TRƯỜNG DỮ LIỆU ĐỘNG (Dynamic Custom Fields):
-- Mỗi cơ sở (org_id) tự định nghĩa thuộc tính riêng cho Học sinh,
-- Giáo viên, Lớp học - KHÔNG hardcode cứng schema.
--
-- (Yêu cầu gốc đặt tên 011_dynamic_fields.sql nhưng số 011 đã dùng
--  bởi 011_assessment_types_warnings.sql nên file này mang số 019.
--  Bảng campuses đã được thay bằng organizations từ migration 001,
--  nên custom_metadata được thêm vào organizations thay cho campuses.)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. CỘT custom_metadata (jsonb) - nơi LƯU GIÁ TRỊ các trường động
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists custom_metadata jsonb not null default '{}'::jsonb;

alter table public.classes
  add column if not exists custom_metadata jsonb not null default '{}'::jsonb;

alter table public.organizations
  add column if not exists custom_metadata jsonb not null default '{}'::jsonb;

comment on column public.profiles.custom_metadata is
  'Giá trị các trường động do cơ sở tự định nghĩa (org_custom_fields). VD: {"shoe_size": 42}';

-- ---------------------------------------------------------------
-- 2. BẢNG org_custom_fields - nơi ĐỊNH NGHĨA các trường động
-- ---------------------------------------------------------------
create table if not exists public.org_custom_fields (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  entity_type  text not null check (entity_type in ('student', 'teacher', 'class')),
  -- Tên biến kỹ thuật (snake_case) - key trong custom_metadata
  field_name   varchar(60) not null check (field_name ~ '^[a-z][a-z0-9_]{0,59}$'),
  -- Tên hiển thị trên form, VD: 'Cỡ giày'
  field_label  varchar(120) not null,
  field_type   text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  -- Danh sách lựa chọn khi field_type = 'select': ["S", "M", "L"]
  options      jsonb not null default '[]'::jsonb,
  is_required  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- Mỗi org không được trùng tên biến trong cùng 1 loại entity
create unique index if not exists uq_org_custom_fields_name
  on public.org_custom_fields (org_id, entity_type, field_name)
  where deleted_at is null;

create index if not exists idx_org_custom_fields_org_entity
  on public.org_custom_fields (org_id, entity_type);

drop trigger if exists trg_org_custom_fields_updated_at on public.org_custom_fields;
create trigger trg_org_custom_fields_updated_at
  before update on public.org_custom_fields
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 3. RLS
--    - super_admin: toàn quyền.
--    - campus_admin: định nghĩa trường cho org trong subtree.
--    - Thành viên khác: chỉ ĐỌC định nghĩa của org mình (form
--      thêm học sinh của Staff/Teacher cần đọc để render).
-- ---------------------------------------------------------------
alter table public.org_custom_fields enable row level security;

drop policy if exists "org_custom_fields_super_admin_all" on public.org_custom_fields;
drop policy if exists "org_custom_fields_campus_admin_all" on public.org_custom_fields;
drop policy if exists "org_custom_fields_member_read" on public.org_custom_fields;

create policy "org_custom_fields_super_admin_all"
  on public.org_custom_fields for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "org_custom_fields_campus_admin_all"
  on public.org_custom_fields for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );

create policy "org_custom_fields_member_read"
  on public.org_custom_fields for select
  using (
    org_id = public.get_my_org_id()
    or public.is_org_in_my_subtree(org_id)
  );
