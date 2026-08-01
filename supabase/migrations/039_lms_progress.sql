-- ============================================================
-- 039: LMS PROGRESS - Theo dõi học sinh HỌC / KHÔNG HỌC
--
-- lms_lesson_progress: mỗi (bài giảng, học viên) một dòng.
--   - first_viewed_at / last_viewed_at / view_count: hệ thống tự
--     ghi khi học viên MỞ bài giảng (trackLessonView).
--   - completed_at: học viên tự đánh dấu "Đã học xong".
--
-- Giáo viên/giáo vụ dùng bảng này (tab "Theo dõi" trong LMS) để
-- biết ai chưa học bài, kết hợp bài nộp + lượt làm quiz -> kiểm
-- soát đầy đủ tình hình học tập online.
-- ============================================================

create table if not exists public.lms_lesson_progress (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations (id),
  lesson_id        uuid not null references public.lms_lessons (id) on delete cascade,
  student_id       uuid not null references public.profiles (id),
  first_viewed_at  timestamptz not null default now(),
  last_viewed_at   timestamptz not null default now(),
  view_count       int not null default 1 check (view_count >= 1),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists uq_lms_progress_per_student
  on public.lms_lesson_progress (lesson_id, student_id);
create index if not exists idx_lms_progress_student
  on public.lms_lesson_progress (student_id);
create index if not exists idx_lms_progress_org
  on public.lms_lesson_progress (org_id);

drop trigger if exists trg_lms_lesson_progress_updated_at on public.lms_lesson_progress;
create trigger trg_lms_lesson_progress_updated_at
  before update on public.lms_lesson_progress
  for each row execute function public.set_updated_at();

-- ----- RLS -----
alter table public.lms_lesson_progress enable row level security;

drop policy if exists "lms_progress_student_select" on public.lms_lesson_progress;
drop policy if exists "lms_progress_student_insert" on public.lms_lesson_progress;
drop policy if exists "lms_progress_student_update" on public.lms_lesson_progress;
drop policy if exists "lms_progress_teacher_select" on public.lms_lesson_progress;

-- Học viên: xem/ghi tiến độ CỦA MÌNH với bài giảng lớp mình ghi danh
create policy "lms_progress_student_select"
  on public.lms_lesson_progress for select
  using (student_id = auth.uid());

create policy "lms_progress_student_insert"
  on public.lms_lesson_progress for insert
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.lms_lessons l
      where l.id = lesson_id
        and l.deleted_at is null
        and l.status = 'published'
        and public.is_enrolled_in_class(l.class_id)
    )
  );

create policy "lms_progress_student_update"
  on public.lms_lesson_progress for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- GV của lớp + Staff/Admin subtree: đọc để theo dõi tình hình học
create policy "lms_progress_teacher_select"
  on public.lms_lesson_progress for select
  using (
    public.get_my_role() = 'super_admin'
    or exists (
      select 1 from public.lms_lessons l
      where l.id = lesson_id and public.is_class_teacher(l.class_id)
    )
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );

comment on table public.lms_lesson_progress is
  'Tiến độ học bài giảng LMS: học viên mở bài -> tự ghi view; completed_at = tự đánh dấu học xong';
