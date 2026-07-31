-- ============================================================
-- GDTX ERP - 009_enrollments_student_portal
-- 1. Bảng enrollments: học viên ghi danh vào lớp (nền tảng cho
--    Cổng thông tin Học sinh, điểm danh đúng sĩ số, sổ điểm).
-- 2. Các policy RLS cho HỌC SINH tự xem dữ liệu của CHÍNH MÌNH:
--    lịch học (qua enrollments), điểm số, bài kiểm tra.
-- ============================================================

-- 1. BẢNG enrollments (Ghi danh) --------------------------------
create table if not exists public.enrollments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  class_id    uuid not null references public.classes (id),
  student_id  uuid not null references public.profiles (id),
  status      text not null default 'active'
              check (status in ('active', 'completed', 'dropped')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_enrollments_class_student unique (class_id, student_id)
);

create index if not exists idx_enrollments_class on public.enrollments (class_id);
create index if not exists idx_enrollments_student on public.enrollments (student_id);
create index if not exists idx_enrollments_org on public.enrollments (org_id);

drop trigger if exists trg_enrollments_updated_at on public.enrollments;
create trigger trg_enrollments_updated_at
  before update on public.enrollments
  for each row execute function public.set_updated_at();

-- 2. RLS cho enrollments ----------------------------------------
alter table public.enrollments enable row level security;

drop policy if exists "enrollments_admin_staff" on public.enrollments;
drop policy if exists "enrollments_teacher_own_class" on public.enrollments;
drop policy if exists "enrollments_student_own" on public.enrollments;

-- Staff/Admin: toàn quyền trong subtree
create policy "enrollments_admin_staff"
  on public.enrollments for all
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

-- Giáo viên: xem danh sách ghi danh của lớp mình phụ trách
create policy "enrollments_teacher_own_class"
  on public.enrollments for select
  using (public.is_my_class(class_id));

-- Học sinh: chỉ xem ghi danh của CHÍNH MÌNH
create policy "enrollments_student_own"
  on public.enrollments for select
  using (student_id = auth.uid());

-- 3. RLS BỔ SUNG cho Cổng thông tin Học sinh --------------------
-- Học sinh xem điểm của CHÍNH MÌNH (bảng grades - migration 008
-- hiện chỉ cho admin/staff/teacher).
drop policy if exists "student_select_own_grades" on public.grades;
create policy "student_select_own_grades"
  on public.grades for select
  using (student_id = auth.uid());

-- Học sinh xem BÀI KIỂM TRA của lớp mình đang ghi danh
-- (cần cho việc hiển thị tên bài + hệ số trong báo cáo điểm).
drop policy if exists "student_select_enrolled_assessments" on public.assessments;
create policy "student_select_enrolled_assessments"
  on public.assessments for select
  using (
    exists (
      select 1
      from public.enrollments e
      where e.class_id = assessments.class_id
        and e.student_id = auth.uid()
        and e.deleted_at is null
    )
  );
