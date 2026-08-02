-- ============================================================
-- GDTX ERP - 054_lms_lesson_approval
-- Hỗ trợ giảng dạy: quy trình duyệt bài giảng LMS
--   draft -> pending_review -> published | rejected
-- + is_enrolled_in_class chỉ enrollment active
-- + setting require_lesson_approval (default true khi resolve)
-- ============================================================

-- 1. Mở rộng status + cột duyệt --------------------------------
alter table public.lms_lessons
  drop constraint if exists lms_lessons_status_check;

alter table public.lms_lessons
  add constraint lms_lessons_status_check
  check (status in ('draft', 'pending_review', 'published', 'rejected'));

alter table public.lms_lessons
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

comment on column public.lms_lessons.submitted_at is
  'Thời điểm GV gửi duyệt (pending_review).';
comment on column public.lms_lessons.reviewed_by is
  'Giáo vụ/Admin duyệt hoặc từ chối.';
comment on column public.lms_lessons.review_note is
  'Ghi chú duyệt / lý do từ chối.';

create index if not exists idx_lms_lessons_pending
  on public.lms_lessons (org_id, status)
  where deleted_at is null and status = 'pending_review';

-- 2. Enrollment active cho RLS học viên LMS --------------------
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
      and e.status = 'active'
      and e.deleted_at is null
  );
$$;

comment on function public.is_enrolled_in_class(uuid) is
  'HV đang ghi danh active (không bảo lưu/thôi học) của lớp.';

-- 3. Seed default config key (không ép ghi đè org đã có) -------
-- resolveSetting phía app default require_lesson_approval=true.
-- Org có thể set false trong org_settings.config để cho GV tự publish.
