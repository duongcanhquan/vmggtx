-- ============================================================
-- 034 - CÁ NHÂN HÓA GIAO DIỆN (USER PERSONALIZATION)
-- (đặt số 034 vì 014 đã được dùng cho migration khác)
--
-- 1) user_preferences : cấu hình giao diện của TỪNG người dùng
--    - dashboard_layout (jsonb): grid layout các widget trang chủ
--      VD: [{"i":"attendance_chart","x":0,"y":0,"w":6,"h":4}]
--    - table_views (jsonb): trạng thái Data Table theo từng bảng
--      VD: {"students": {"hidden":["email"],"pinned":["full_name"],
--           "order":["student_code","full_name","phone"]}}
--    - theme_settings (jsonb): sáng/tối + màu chủ đạo
--      VD: {"mode":"dark","accent":"#6366f1"}
--
-- 2) global_layout_templates : layout mặc định QTV áp cho từng ROLE
--    - is_forced = true -> user KHÔNG được tự sửa layout (client
--      đọc template trước, thấy is_forced thì khóa chức năng kéo thả)
--
-- 3) RLS:
--    - User chỉ SELECT/UPDATE (+INSERT lần đầu) bản ghi CỦA MÌNH.
--    - Campus Admin quản lý global_layout_templates trong subtree
--      của tổ chức mình; thành viên org chỉ ĐỌC để áp layout.
--
-- [ĐA TẦNG] org_id + RLS subtree. Idempotent: chạy lại không lỗi.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) USER PREFERENCES
-- ---------------------------------------------------------------
create table if not exists public.user_preferences (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  org_id            uuid references public.organizations (id),
  dashboard_layout  jsonb not null default '[]'::jsonb,
  table_views       jsonb not null default '{}'::jsonb,
  theme_settings    jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Mỗi người dùng đúng 1 bản ghi: client upsert theo user_id
  constraint uq_user_preferences_user unique (user_id)
);

create index if not exists idx_user_preferences_org
  on public.user_preferences (org_id);

drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;
create trigger trg_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

comment on table public.user_preferences is
  'Cá nhân hóa giao diện từng user: grid layout dashboard, cột bảng, theme';
comment on column public.user_preferences.dashboard_layout is
  'Grid layout widget trang chủ: [{"i","x","y","w","h"}...]';
comment on column public.user_preferences.table_views is
  'Trạng thái Data Table theo bảng: {table_key: {hidden[], pinned[], order[]}}';
comment on column public.user_preferences.theme_settings is
  'Theme: {"mode":"light|dark","accent":"#hex"...}';

-- ---------------------------------------------------------------
-- 2) GLOBAL LAYOUT TEMPLATES (QTV áp đặt layout theo role)
-- ---------------------------------------------------------------
create table if not exists public.global_layout_templates (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  role_target     varchar(50) not null check (
    role_target in (
      'campus_admin', 'academic_staff', 'admission_staff',
      'accountant', 'teacher', 'student', 'parent'
    )
  ),
  default_layout  jsonb not null default '[]'::jsonb,
  -- true = user KHÔNG được tự sửa layout (dashboard khóa kéo thả)
  is_forced       boolean not null default false,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- Mỗi org chỉ 1 template cho mỗi role
  constraint uq_layout_template_org_role unique (org_id, role_target)
);

create index if not exists idx_layout_templates_org
  on public.global_layout_templates (org_id) where deleted_at is null;

drop trigger if exists trg_layout_templates_updated_at on public.global_layout_templates;
create trigger trg_layout_templates_updated_at
  before update on public.global_layout_templates
  for each row execute function public.set_updated_at();

comment on table public.global_layout_templates is
  'Layout dashboard mặc định QTV áp cho từng role; is_forced = cấm user tự sửa';

-- ---------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------
alter table public.user_preferences enable row level security;
alter table public.global_layout_templates enable row level security;

drop policy if exists "user_preferences_own_select" on public.user_preferences;
drop policy if exists "user_preferences_own_insert" on public.user_preferences;
drop policy if exists "user_preferences_own_update" on public.user_preferences;
drop policy if exists "user_preferences_super_admin_all" on public.user_preferences;
drop policy if exists "layout_templates_super_admin_all" on public.global_layout_templates;
drop policy if exists "layout_templates_campus_admin_all" on public.global_layout_templates;
drop policy if exists "layout_templates_member_select" on public.global_layout_templates;

-- User CHỈ thao tác bản ghi của CHÍNH MÌNH (không DELETE - reset thì
-- update về default rỗng; giữ bản ghi để tránh mồ côi race upsert)
create policy "user_preferences_own_select"
  on public.user_preferences for select
  using (user_id = auth.uid());

create policy "user_preferences_own_insert"
  on public.user_preferences for insert
  with check (
    user_id = auth.uid()
    -- org_id (nếu ghi) phải đúng org thật của user, không nhận từ client bừa
    and (org_id is null or org_id = public.get_my_org_id())
  );

create policy "user_preferences_own_update"
  on public.user_preferences for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (org_id is null or org_id = public.get_my_org_id())
  );

create policy "user_preferences_super_admin_all"
  on public.user_preferences for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Campus Admin quản lý template trong SUBTREE tổ chức mình
create policy "layout_templates_super_admin_all"
  on public.global_layout_templates for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "layout_templates_campus_admin_all"
  on public.global_layout_templates for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- Mọi thành viên org ĐỌC template của org mình để áp layout
-- (client kiểm tra is_forced -> khóa chức năng tự sắp xếp)
create policy "layout_templates_member_select"
  on public.global_layout_templates for select
  using (org_id = public.get_my_org_id() and deleted_at is null);
