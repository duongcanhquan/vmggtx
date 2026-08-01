-- ================================================================
-- 049: QUYỀN KIÊM NHIỆM THEO TỪNG NHÂN SỰ (user-level grants)
--
-- Quản lý cơ sở có TOÀN QUYỀN trong đơn vị mình, được gán THÊM
-- hạng mục quản lý cho 1 nhân sự cụ thể (kiêm nhiệm). Ví dụ:
-- giáo viên kiêm quản lý Học phí, tuyển sinh kiêm Điểm danh...
--
-- NGUYÊN TẮC:
-- - Quyền gán theo user là quyền BỔ SUNG (cộng vào quyền vai trò),
--   KHÔNG thay thế ma trận role (menu_permissions - 043).
-- - Được gán = MỞ THẬT 3 tầng: menu hiện ra + middleware cho vào
--   URL + RLS/is_authorized cho đọc-ghi dữ liệu hạng mục đó.
-- - Trần an toàn: grant mở tối đa NGANG CẤP GIÁO VỤ (vận hành).
--   Hạng mục quản trị cơ sở (tài khoản, cài đặt, phân quyền) vẫn
--   yêu cầu vai trò Quản lý cơ sở thật.
-- ================================================================

-- 1. BẢNG user_menu_permissions ---------------------------------
create table if not exists public.user_menu_permissions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  -- org của nhân sự tại thời điểm gán (để RLS giới hạn phạm vi quản lý)
  org_id      uuid not null references public.organizations (id),
  menu_keys   text[] not null default '{}',
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_user_menu_permissions_org
  on public.user_menu_permissions (org_id);

alter table public.user_menu_permissions enable row level security;

drop policy if exists "user_grants_super_all" on public.user_menu_permissions;
create policy "user_grants_super_all"
  on public.user_menu_permissions for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- campus_admin: gán/gỡ cho nhân sự trong subtree của mình
drop policy if exists "user_grants_campus_manage" on public.user_menu_permissions;
create policy "user_grants_campus_manage"
  on public.user_menu_permissions for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- Ai cũng đọc được grant của CHÍNH MÌNH (hiển thị menu phía client)
drop policy if exists "user_grants_self_read" on public.user_menu_permissions;
create policy "user_grants_self_read"
  on public.user_menu_permissions for select
  using (user_id = auth.uid());

drop trigger if exists trg_user_menu_permissions_updated_at on public.user_menu_permissions;
create trigger trg_user_menu_permissions_updated_at
  before update on public.user_menu_permissions
  for each row execute function public.set_updated_at();

comment on table public.user_menu_permissions is
  'Quyền kiêm nhiệm gán theo TỪNG nhân sự (bổ sung vào quyền vai trò). Campus admin gán trong subtree.';

-- 2. HELPER ------------------------------------------------------

-- User có được gán hạng mục p_key không? (security definer - dùng
-- được trong RLS policy của các bảng nghiệp vụ)
create or replace function public.has_menu_grant(p_user_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_menu_permissions ump
    where ump.user_id = p_user_id
      and p_key = any (ump.menu_keys)
  );
$$;

grant execute on function public.has_menu_grant(uuid, text) to authenticated;

-- Danh sách grant của CHÍNH user đang gọi (cho menu phía client)
create or replace function public.get_my_menu_grants()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ump.menu_keys from public.user_menu_permissions ump where ump.user_id = auth.uid()),
    '{}'::text[]
  );
$$;

grant execute on function public.get_my_menu_grants() to authenticated;

-- 3. get_my_access_state v2: thêm menu_grants --------------------
create or replace function public.get_my_access_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lic    jsonb;
  v_keys   text[];
  v_grants text[];
  v_flags  jsonb;
  v_ok     boolean := true;
begin
  -- 1. License hiệu lực (044). Lỗi/chưa có -> coi như không license (ok).
  begin
    v_lic := get_my_license();
  exception when others then
    v_lic := null;
  end;
  if v_lic is not null then
    if v_lic->>'status' = 'suspended' then
      v_ok := false;
    end if;
    if v_ok and (v_lic->>'valid_until') is not null
       and (v_lic->>'valid_until')::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
      v_ok := false;
    end if;
  end if;

  -- 2. Ma trận menu theo role (043). Lỗi -> null (dùng ma trận mặc định).
  begin
    v_keys := get_my_menu_keys();
  exception when others then
    v_keys := null;
  end;

  -- 3. Quyền kiêm nhiệm theo user (049). Lỗi -> rỗng.
  begin
    v_grants := get_my_menu_grants();
  exception when others then
    v_grants := '{}'::text[];
  end;

  -- 4. Công tắc module (046). Lỗi -> rỗng (bật hết).
  begin
    v_flags := get_my_module_flags();
  exception when others then
    v_flags := null;
  end;

  return jsonb_build_object(
    'license_ok', v_ok,
    'menu_keys', case when v_keys is null then null else to_jsonb(v_keys) end,
    'menu_grants', to_jsonb(coalesce(v_grants, '{}'::text[])),
    'off_modules', coalesce(v_flags->'modules', '[]'::jsonb),
    'off_features', coalesce(v_flags->'features', '[]'::jsonb)
  );
end $$;

grant execute on function public.get_my_access_state() to authenticated;

-- 4. is_authorized v2: nhận thêm p_menu_key ----------------------
-- - Bổ sung trọng số cho các role mới (tuyển sinh/kế toán = ngang
--   giáo viên; đối tác doanh nghiệp = ngang học viên).
-- - p_menu_key: nếu user KHÔNG đủ cấp bậc nhưng ĐƯỢC GÁN kiêm nhiệm
--   hạng mục này -> vẫn cho qua, tối đa NGANG CẤP GIÁO VỤ (3).
--   Yêu cầu campus_admin trở lên thì grant KHÔNG mở được.
drop function if exists public.is_authorized(uuid, uuid, varchar);

create or replace function public.is_authorized(
  p_user_id        uuid,
  p_target_org_id  uuid,
  p_required_role  varchar,
  p_menu_key       text default null
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
    '{"student":1,"enterprise_partner":1,"teacher":2,"admission_staff":2,"accountant":2,"academic_staff":3,"campus_admin":4,"super_admin":5}'::jsonb;
  v_user_weight     int;
  v_required_weight int;
begin
  select p.role, p.org_id
  into v_role, v_org_id
  from public.profiles p
  where p.id = p_user_id
    and p.deleted_at is null;

  if v_role is null then
    return false;
  end if;

  v_user_weight     := coalesce((v_weights ->> v_role)::int, 0);
  v_required_weight := coalesce((v_weights ->> p_required_role)::int, 99);

  if v_user_weight < v_required_weight then
    -- Kiêm nhiệm: grant theo user mở tối đa mức Giáo vụ (3)
    if p_menu_key is null
       or v_required_weight > 3
       or not public.has_menu_grant(p_user_id, p_menu_key) then
      return false;
    end if;
  end if;

  if v_role = 'super_admin' then
    return true;
  end if;

  if v_org_id is null or p_target_org_id is null then
    return false;
  end if;

  return p_target_org_id in (
    select public.get_descendant_org_ids(v_org_id)
  );
end;
$$;

grant execute on function public.is_authorized(uuid, uuid, varchar, text) to authenticated;

comment on function public.is_authorized(uuid, uuid, varchar, text) is
  'Kiểm tra cấp bậc role + phạm vi org. p_menu_key: quyền kiêm nhiệm (049) mở tối đa mức Giáo vụ.';

-- 5. RLS MỞ DỮ LIỆU CHO NGƯỜI ĐƯỢC GÁN ---------------------------
-- Mỗi hạng mục nghiệp vụ thêm 1 policy: được gán key + org trong
-- subtree -> đọc/ghi như giáo vụ. (Policy OR với policy sẵn có.)

-- 5.0 [VÁ BUG CŨ] Giáo vụ SỬA hồ sơ học sinh trong subtree:
-- 005 chỉ cho campus_admin UPDATE profiles -> giáo vụ bấm "Sửa hồ sơ"
-- bị RLS chặn IM LẶNG (0 dòng cập nhật). Vá: academic_staff được
-- update hồ sơ role='student' trong phạm vi của mình.
drop policy if exists "staff_update_students_in_subtree" on public.profiles;
create policy "staff_update_students_in_subtree"
  on public.profiles for update
  using (
    public.get_my_role() = 'academic_staff'
    and role = 'student'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'academic_staff'
    and role = 'student'
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.1 Hồ sơ học sinh (key: students)
drop policy if exists "grant_students_select_profiles" on public.profiles;
create policy "grant_students_select_profiles"
  on public.profiles for select
  using (
    role = 'student'
    and public.has_menu_grant(auth.uid(), 'students')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "grant_students_update_profiles" on public.profiles;
create policy "grant_students_update_profiles"
  on public.profiles for update
  using (
    role = 'student'
    and public.has_menu_grant(auth.uid(), 'students')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    role = 'student'
    and public.has_menu_grant(auth.uid(), 'students')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.2 Ghi danh (key: students - quản lý từ hồ sơ học sinh)
drop policy if exists "grant_students_all_enrollments" on public.enrollments;
create policy "grant_students_all_enrollments"
  on public.enrollments for all
  using (
    public.has_menu_grant(auth.uid(), 'students')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'students')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.3 Lớp học (key: classes; người được gán students cũng cần ĐỌC lớp)
drop policy if exists "grant_classes_all" on public.classes;
create policy "grant_classes_all"
  on public.classes for all
  using (
    public.has_menu_grant(auth.uid(), 'classes')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'classes')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "grant_students_select_classes" on public.classes;
create policy "grant_students_select_classes"
  on public.classes for select
  using (
    public.has_menu_grant(auth.uid(), 'students')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.4 Buổi học (key: classes toàn quyền; attendance đọc)
drop policy if exists "grant_classes_all_sessions" on public.class_sessions;
create policy "grant_classes_all_sessions"
  on public.class_sessions for all
  using (
    public.has_menu_grant(auth.uid(), 'classes')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'classes')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "grant_attendance_select_sessions" on public.class_sessions;
create policy "grant_attendance_select_sessions"
  on public.class_sessions for select
  using (
    public.has_menu_grant(auth.uid(), 'attendance')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.5 Điểm danh (key: attendance)
drop policy if exists "grant_attendance_all" on public.attendance;
create policy "grant_attendance_all"
  on public.attendance for all
  using (
    public.has_menu_grant(auth.uid(), 'attendance')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'attendance')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.6 Học phí & Công nợ (key: finance_invoices)
drop policy if exists "grant_finance_all_invoices" on public.invoices;
create policy "grant_finance_all_invoices"
  on public.invoices for all
  using (
    public.has_menu_grant(auth.uid(), 'finance_invoices')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'finance_invoices')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "grant_finance_all_payments" on public.payments;
create policy "grant_finance_all_payments"
  on public.payments for all
  using (
    public.has_menu_grant(auth.uid(), 'finance_invoices')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'finance_invoices')
    and public.is_org_in_my_subtree(org_id)
  );

-- Người được gán học phí cần ĐỌC hồ sơ học sinh (tên trên hóa đơn)
drop policy if exists "grant_finance_select_students" on public.profiles;
create policy "grant_finance_select_students"
  on public.profiles for select
  using (
    role = 'student'
    and public.has_menu_grant(auth.uid(), 'finance_invoices')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.7 Tuyển sinh CRM (key: crm)
drop policy if exists "grant_crm_all_leads" on public.leads;
create policy "grant_crm_all_leads"
  on public.leads for all
  using (
    public.has_menu_grant(auth.uid(), 'crm')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'crm')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.8 Hồ sơ Giảng viên + gán lớp (key: teachers)
drop policy if exists "grant_teachers_select_profiles" on public.profiles;
create policy "grant_teachers_select_profiles"
  on public.profiles for select
  using (
    role = 'teacher'
    and public.has_menu_grant(auth.uid(), 'teachers')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "grant_teachers_select_classes" on public.classes;
create policy "grant_teachers_select_classes"
  on public.classes for select
  using (
    public.has_menu_grant(auth.uid(), 'teachers')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "grant_teachers_update_classes" on public.classes;
create policy "grant_teachers_update_classes"
  on public.classes for update
  using (
    public.has_menu_grant(auth.uid(), 'teachers')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'teachers')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.9 Tài sản & Khấu hao (key: assets)
drop policy if exists "grant_assets_all" on public.assets;
create policy "grant_assets_all"
  on public.assets for all
  using (
    public.has_menu_grant(auth.uid(), 'assets')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'assets')
    and public.is_org_in_my_subtree(org_id)
  );

-- 5.10 Thông báo chung (key: announcements)
drop policy if exists "grant_announcements_all" on public.announcements;
create policy "grant_announcements_all"
  on public.announcements for all
  using (
    public.has_menu_grant(auth.uid(), 'announcements')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.has_menu_grant(auth.uid(), 'announcements')
    and public.is_org_in_my_subtree(org_id)
  );
