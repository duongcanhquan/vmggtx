-- ============================================================
-- GDTX ERP - 005_matrix_rbac
-- Ma trận Phân quyền (Matrix RBAC) cấp Database:
--   super_admin    : toàn hệ thống
--   campus_admin   : cơ sở của mình + toàn bộ cấp dưới (subtree)
--   academic_staff : xem học sinh trong phạm vi cơ sở mình
--   teacher/student: chỉ xem hồ sơ của chính mình
-- ============================================================

-- 1. CẬP NHẬT BỘ ROLE TRÊN profiles ----------------------------
-- Phải DROP constraint cũ TRƯỚC khi update dữ liệu, vì giá trị mới
-- (super_admin, campus_admin) không nằm trong danh sách check cũ.
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'super_admin'  where role = 'admin';
update public.profiles set role = 'campus_admin' where role = 'manager';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'campus_admin', 'academic_staff', 'teacher', 'student'));

-- Đảm bảo có org_id (đã tạo ở 001, giữ idempotent)
alter table public.profiles
  add column if not exists org_id uuid references public.organizations (id);

-- 2. HELPER FUNCTIONS (SECURITY DEFINER) -----------------------
-- BẮT BUỘC: policy trên profiles KHÔNG được subquery trực tiếp profiles
-- (gây đệ quy vô hạn). Các hàm security definer này bỏ qua RLS khi đọc
-- role/org_id của user đang đăng nhập.

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;
$$;

create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.org_id
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;
$$;

-- Org đích có nằm trong subtree (org của tôi + con/cháu) không?
create or replace function public.is_org_in_my_subtree(p_target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_target_org_id in (
    select public.get_descendant_org_ids(public.get_my_org_id())
  );
$$;

-- 3. ROW LEVEL SECURITY CHO profiles ---------------------------
alter table public.profiles enable row level security;

drop policy if exists "superadmin_select_all_profiles"   on public.profiles;
drop policy if exists "superadmin_insert_all_profiles"   on public.profiles;
drop policy if exists "superadmin_update_all_profiles"   on public.profiles;
drop policy if exists "campusadmin_select_subtree"       on public.profiles;
drop policy if exists "campusadmin_insert_subtree"       on public.profiles;
drop policy if exists "campusadmin_update_subtree"       on public.profiles;
drop policy if exists "self_select_own_profile"          on public.profiles;
drop policy if exists "staff_select_students_in_subtree" on public.profiles;

-- ===== Rule 1: super_admin - SELECT/INSERT/UPDATE tất cả =====
create policy "superadmin_select_all_profiles"
  on public.profiles for select
  using (public.get_my_role() = 'super_admin');

create policy "superadmin_insert_all_profiles"
  on public.profiles for insert
  with check (public.get_my_role() = 'super_admin');

create policy "superadmin_update_all_profiles"
  on public.profiles for update
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- ===== Rule 2: campus_admin - chỉ trong nhánh tổ chức của mình =====
create policy "campusadmin_select_subtree"
  on public.profiles for select
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- KHÔNG được tạo super_admin, KHÔNG được tạo nhân sự cho cơ sở ngoài nhánh
create policy "campusadmin_insert_subtree"
  on public.profiles for insert
  with check (
    public.get_my_role() = 'campus_admin'
    and role <> 'super_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- with check chặn cả việc UPDATE để "đẩy" nhân sự ra ngoài nhánh
-- hoặc nâng cấp ai đó lên super_admin
create policy "campusadmin_update_subtree"
  on public.profiles for update
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and role <> 'super_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- ===== Rule 3: academic_staff / teacher / student =====
-- 3a. Ai cũng xem được hồ sơ CHÍNH MÌNH
create policy "self_select_own_profile"
  on public.profiles for select
  using (id = auth.uid());

-- 3b. academic_staff xem được HỌC SINH trong phạm vi cơ sở mình
create policy "staff_select_students_in_subtree"
  on public.profiles for select
  using (
    public.get_my_role() = 'academic_staff'
    and role = 'student'
    and public.is_org_in_my_subtree(org_id)
  );

-- 4. RPC is_authorized: double-check quyền ở Backend ------------
-- Trả về TRUE nếu user có role >= p_required_role VÀ có quyền
-- thao tác trên p_target_org_id (super_admin: mọi org; còn lại:
-- org đích phải nằm trong subtree org của user).
create or replace function public.is_authorized(
  p_user_id        uuid,
  p_target_org_id  uuid,
  p_required_role  varchar
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role     text;
  v_org_id   uuid;
  v_weights  constant jsonb :=
    '{"student":1,"teacher":2,"academic_staff":3,"campus_admin":4,"super_admin":5}'::jsonb;
  v_user_weight     int;
  v_required_weight int;
begin
  select p.role, p.org_id
  into v_role, v_org_id
  from public.profiles p
  where p.id = p_user_id
    and p.deleted_at is null;

  -- User không tồn tại / đã bị xóa mềm
  if v_role is null then
    return false;
  end if;

  v_user_weight     := coalesce((v_weights ->> v_role)::int, 0);
  v_required_weight := coalesce((v_weights ->> p_required_role)::int, 99);

  -- Không đủ cấp bậc tối thiểu
  if v_user_weight < v_required_weight then
    return false;
  end if;

  -- super_admin: thao tác trên mọi org
  if v_role = 'super_admin' then
    return true;
  end if;

  -- Các role khác: org đích phải nằm trong subtree của org user trực thuộc
  if v_org_id is null or p_target_org_id is null then
    return false;
  end if;

  return p_target_org_id in (
    select public.get_descendant_org_ids(v_org_id)
  );
end;
$$;
