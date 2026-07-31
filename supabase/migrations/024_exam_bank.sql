-- ============================================================
-- GDTX ERP - 024_exam_bank
-- 1. BẢNG exam_bank: Ngân hàng đề thi/đề kiểm tra của cơ sở
--    (Bộ phận Khảo thí quản lý, giáo viên trong subtree được đọc).
-- 2. RLS BỔ SUNG cho profiles: academic_staff được xem hồ sơ
--    GIÁO VIÊN trong subtree (005 chỉ cho xem học sinh -> các trang
--    Staff hiển thị tên GV như thời khóa biểu/lớp học bị RLS chặn).
-- ============================================================

-- 0. HELPER (idempotent - cũng có trong 999_final_rls_patch, khai báo
--    ở đây để 024 chạy được độc lập theo thứ tự tên file) ----------
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

-- 1. BẢNG exam_bank -----------------------------------------------
create table if not exists public.exam_bank (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  subject_id   uuid references public.subjects (id),
  title        text not null,
  description  text,
  content      text,                             -- nội dung đề / link tài liệu
  grade_level  text,                             -- VD: 'Lớp 12', 'Ôn thi THPT'
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_exam_bank_org on public.exam_bank (org_id);
create index if not exists idx_exam_bank_subject on public.exam_bank (subject_id);

drop trigger if exists trg_exam_bank_updated_at on public.exam_bank;
create trigger trg_exam_bank_updated_at
  before update on public.exam_bank
  for each row execute function public.set_updated_at();

alter table public.exam_bank enable row level security;

-- Staff/Admin trong subtree: toàn quyền
drop policy if exists "exam_bank_staff_all" on public.exam_bank;
create policy "exam_bank_staff_all"
  on public.exam_bank for all
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

-- Giáo viên: chỉ ĐỌC đề của org liên quan (subtree/tổ tiên - đề dùng chung)
drop policy if exists "exam_bank_teacher_read" on public.exam_bank;
create policy "exam_bank_teacher_read"
  on public.exam_bank for select
  using (
    public.get_my_role() = 'teacher'
    and public.is_org_related(org_id)
  );

-- 2a. RLS BỔ SUNG: học viên xem HÓA ĐƠN + PHIẾU THU của chính mình --
--     (007 chỉ cho staff/admin -> trang Học phí của Student Portal
--      không đọc được dữ liệu của chính học viên)
drop policy if exists "invoices_student_own" on public.invoices;
create policy "invoices_student_own"
  on public.invoices for select
  using (student_id = auth.uid());

drop policy if exists "payments_student_own" on public.payments;
create policy "payments_student_own"
  on public.payments for select
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.student_id = auth.uid()
    )
  );

-- 2. RLS BỔ SUNG: staff xem hồ sơ GIÁO VIÊN trong subtree ----------
drop policy if exists "staff_select_teachers_in_subtree" on public.profiles;
create policy "staff_select_teachers_in_subtree"
  on public.profiles for select
  using (
    public.get_my_role() = 'academic_staff'
    and role = 'teacher'
    and public.is_org_in_my_subtree(org_id)
  );
