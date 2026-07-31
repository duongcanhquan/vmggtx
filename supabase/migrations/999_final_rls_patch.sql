-- ============================================================
-- GDTX ERP - 999_final_rls_patch
-- FINAL SECURITY AUDIT: vá các bảng bị BỎ SÓT Row Level Security.
--
-- Phát hiện khi audit:
--   1. organizations, class_sessions, attendance, subjects:
--      CHƯA HỀ bật RLS -> bất kỳ user đăng nhập nào cũng đọc/ghi
--      được dữ liệu của MỌI chi nhánh (vi phạm đa tầng).
--   2. classes: đã bật RLS (001) nhưng CHỈ có policy SELECT
--      -> Staff INSERT/UPDATE lớp qua session client bị chặn ngầm.
--
-- Dựa trên helpers có sẵn: get_my_role(), is_org_in_my_subtree()
-- (005), is_my_class() (008). Bổ sung 2 helper SECURITY DEFINER
-- để tránh RLS đệ quy khi policy tham chiếu bảng khác.
-- ============================================================

-- 0. HELPERS ------------------------------------------------------

-- Org "liên quan" tới user: nằm trong subtree của org user HOẶC là
-- tổ tiên (để hiển thị tên Cụm/HQ trên breadcrumb, badge...).
create or replace function public.is_org_related(p_target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.organizations me on me.id = p.org_id
    join public.organizations target on target.id = p_target_org_id
    where p.id = auth.uid()
      and p.deleted_at is null
      and (target.path <@ me.path or me.path <@ target.path)
  );
$$;

-- User hiện tại là giáo viên của buổi học này?
create or replace function public.is_my_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_sessions cs
    where cs.id = p_session_id
      and cs.teacher_id = auth.uid()
      and cs.deleted_at is null
  );
$$;

-- User hiện tại (học viên) có ghi danh vào lớp này không?
create or replace function public.is_enrolled_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.class_id = p_class_id
      and e.student_id = auth.uid()
      and e.deleted_at is null
  );
$$;

-- Giáo viên có dạy học viên này không? (qua enrollments + classes)
create or replace function public.teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id and c.deleted_at is null
    where e.student_id = p_student_id
      and e.deleted_at is null
      and c.teacher_id = auth.uid()
  );
$$;

-- 0b. PROFILES: GV được xem hồ sơ HỌC VIÊN lớp mình dạy ------------
-- (005 chỉ cho self + staff -> sổ điểm/điểm danh của GV bị RLS chặn)
drop policy if exists "teacher_select_my_students" on public.profiles;
create policy "teacher_select_my_students"
  on public.profiles for select
  using (
    public.get_my_role() = 'teacher'
    and role = 'student'
    and public.teaches_student(id)
  );

-- 1. ORGANIZATIONS ------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists "orgs_select_related" on public.organizations;
create policy "orgs_select_related"
  on public.organizations for select
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_related(id)
  );

drop policy if exists "orgs_superadmin_write" on public.organizations;
create policy "orgs_superadmin_write"
  on public.organizations for insert
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "orgs_admin_update" on public.organizations;
create policy "orgs_admin_update"
  on public.organizations for update
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'campus_admin'
      and public.is_org_in_my_subtree(id)
    )
  );

drop policy if exists "orgs_superadmin_delete" on public.organizations;
create policy "orgs_superadmin_delete"
  on public.organizations for delete
  using (public.get_my_role() = 'super_admin');

-- 2. CLASSES: bổ sung policy GHI (001 chỉ có SELECT) ---------------
drop policy if exists "classes_staff_write" on public.classes;
create policy "classes_staff_write"
  on public.classes for insert
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

drop policy if exists "classes_staff_update" on public.classes;
create policy "classes_staff_update"
  on public.classes for update
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

-- 3. CLASS_SESSIONS ------------------------------------------------
alter table public.class_sessions enable row level security;

drop policy if exists "sessions_select_scoped" on public.class_sessions;
create policy "sessions_select_scoped"
  on public.class_sessions for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or teacher_id = auth.uid()          -- GV thấy buổi mình dạy (mọi chi nhánh)
    or public.is_my_class(class_id)     -- GV chủ nhiệm lớp
    or public.is_enrolled_in_class(class_id)  -- Học viên đã ghi danh
  );

drop policy if exists "sessions_staff_write" on public.class_sessions;
create policy "sessions_staff_write"
  on public.class_sessions for insert
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

drop policy if exists "sessions_update_scoped" on public.class_sessions;
create policy "sessions_update_scoped"
  on public.class_sessions for update
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    -- GV được update buổi của MÌNH (check-in, đánh dấu hoàn thành)
    or teacher_id = auth.uid()
  );

drop policy if exists "sessions_staff_delete" on public.class_sessions;
create policy "sessions_staff_delete"
  on public.class_sessions for delete
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );

-- 4. ATTENDANCE ----------------------------------------------------
alter table public.attendance enable row level security;

drop policy if exists "attendance_select_scoped" on public.attendance;
create policy "attendance_select_scoped"
  on public.attendance for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_session(session_id)  -- GV của buổi học
    or student_id = auth.uid()           -- Học viên xem điểm danh của mình
  );

drop policy if exists "attendance_write_scoped" on public.attendance;
create policy "attendance_write_scoped"
  on public.attendance for insert
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_session(session_id)
  );

drop policy if exists "attendance_update_scoped" on public.attendance;
create policy "attendance_update_scoped"
  on public.attendance for update
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_session(session_id)
  );

-- 5. SUBJECTS ------------------------------------------------------
alter table public.subjects enable row level security;

drop policy if exists "subjects_select_related" on public.subjects;
create policy "subjects_select_related"
  on public.subjects for select
  using (
    public.get_my_role() = 'super_admin'
    or public.is_org_related(org_id)  -- gồm cả môn do Cụm/HQ định nghĩa
  );

drop policy if exists "subjects_staff_write" on public.subjects;
create policy "subjects_staff_write"
  on public.subjects for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );
