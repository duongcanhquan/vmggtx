-- ============================================================
-- GDTX ERP - 025_lms
-- LMS ĐƠN GIẢN: Bài giảng - Bài tập (nộp online) - Kiểm tra trắc nghiệm
--
--   lms_lessons        : bài giảng theo lớp (nội dung + file R2 + video)
--   lms_assignments    : bài tập giao cho lớp (hạn nộp, điểm tối đa)
--   lms_submissions    : bài nộp của học viên (file R2/văn bản, chấm điểm)
--   lms_quizzes        : đề kiểm tra trắc nghiệm (thời lượng, phát hành)
--   lms_quiz_questions : câu hỏi (options jsonb, ĐÁP ÁN ĐÚNG - bảo mật)
--   lms_quiz_attempts  : lượt làm bài (tự chấm server-side)
--
-- File đính kèm lưu trên Cloudflare R2, DB chỉ giữ metadata jsonb:
--   [{ "key": "org/../file.pdf", "name": "file.pdf", "size": 123, "type": "application/pdf" }]
--
-- BẢO MẬT ĐÁP ÁN: lms_quiz_questions KHÔNG có policy SELECT cho học
-- viên. Học viên nhận câu hỏi (đã cắt correct_index) và nộp bài qua
-- Server Action dùng Service Role sau khi xác thực ghi danh.
-- ============================================================

-- 1. BÀI GIẢNG ---------------------------------------------------
create table if not exists public.lms_lessons (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  class_id    uuid not null references public.classes (id),
  title       text not null,
  description text,
  content     text,                          -- nội dung bài giảng (markdown/text)
  video_url   text,                          -- link YouTube/Vimeo nhúng
  attachments jsonb not null default '[]',   -- file R2 metadata
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_lms_lessons_class on public.lms_lessons (class_id, status);
create index if not exists idx_lms_lessons_org on public.lms_lessons (org_id);

-- 2. BÀI TẬP -----------------------------------------------------
create table if not exists public.lms_assignments (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  class_id     uuid not null references public.classes (id),
  lesson_id    uuid references public.lms_lessons (id),
  title        text not null,
  instructions text,
  attachments  jsonb not null default '[]',
  due_at       timestamptz,                  -- NULL = không hạn
  max_score    numeric(4, 2) not null default 10 check (max_score > 0 and max_score <= 10),
  allow_late   boolean not null default true,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_lms_assignments_class on public.lms_assignments (class_id);
create index if not exists idx_lms_assignments_org on public.lms_assignments (org_id);

-- 3. BÀI NỘP -----------------------------------------------------
create table if not exists public.lms_submissions (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  assignment_id uuid not null references public.lms_assignments (id),
  student_id    uuid not null references public.profiles (id),
  content       text,                        -- trả lời dạng văn bản
  attachments   jsonb not null default '[]', -- file bài nộp trên R2
  is_late       boolean not null default false,
  submitted_at  timestamptz not null default now(),
  score         numeric(4, 2) check (score is null or (score >= 0 and score <= 10)),
  feedback      text,
  graded_by     uuid references public.profiles (id),
  graded_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Mỗi học viên 1 bài nộp / bài tập (nộp lại = update)
create unique index if not exists uq_lms_submission_per_student
  on public.lms_submissions (assignment_id, student_id)
  where deleted_at is null;
create index if not exists idx_lms_submissions_org on public.lms_submissions (org_id);

-- 4. KIỂM TRA TRẮC NGHIỆM ---------------------------------------
create table if not exists public.lms_quizzes (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references public.organizations (id),
  class_id         uuid not null references public.classes (id),
  title            text not null,
  description      text,
  duration_minutes int not null default 15 check (duration_minutes between 1 and 180),
  is_published     boolean not null default false,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists idx_lms_quizzes_class on public.lms_quizzes (class_id, is_published);
create index if not exists idx_lms_quizzes_org on public.lms_quizzes (org_id);

create table if not exists public.lms_quiz_questions (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  quiz_id       uuid not null references public.lms_quizzes (id) on delete cascade,
  question      text not null,
  options       jsonb not null,              -- ["A...", "B...", "C...", "D..."]
  correct_index int not null check (correct_index >= 0),
  points        numeric(4, 2) not null default 1 check (points > 0),
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_lms_quiz_questions_quiz
  on public.lms_quiz_questions (quiz_id, position);

create table if not exists public.lms_quiz_attempts (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  quiz_id      uuid not null references public.lms_quizzes (id),
  student_id   uuid not null references public.profiles (id),
  answers      jsonb not null default '{}',  -- { "questionId": chosenIndex }
  score        numeric(4, 2),                -- thang 0-10, server tự chấm
  total_points numeric(6, 2),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Mỗi học viên 1 lượt làm / đề
create unique index if not exists uq_lms_attempt_per_student
  on public.lms_quiz_attempts (quiz_id, student_id);
create index if not exists idx_lms_quiz_attempts_org on public.lms_quiz_attempts (org_id);

-- 5. TRIGGER updated_at ------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'lms_lessons', 'lms_assignments', 'lms_submissions',
    'lms_quizzes', 'lms_quiz_questions', 'lms_quiz_attempts'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%s', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%s
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- 6. HELPER -------------------------------------------------------
-- (nhúng lại is_enrolled_in_class để 025 tự chạy được trước 999)
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

-- Tôi có phải GV của lớp này không?
create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.teacher_id = auth.uid()
      and c.deleted_at is null
  );
$$;

-- 7. ROW LEVEL SECURITY ------------------------------------------
alter table public.lms_lessons enable row level security;
alter table public.lms_assignments enable row level security;
alter table public.lms_submissions enable row level security;
alter table public.lms_quizzes enable row level security;
alter table public.lms_quiz_questions enable row level security;
alter table public.lms_quiz_attempts enable row level security;

-- 7.1 Bài giảng: GV lớp + Staff/Admin subtree toàn quyền;
--     học viên CHỈ đọc bài PUBLISHED của lớp mình ghi danh.
drop policy if exists "lms_lessons_manage" on public.lms_lessons;
create policy "lms_lessons_manage" on public.lms_lessons for all
  using (
    public.get_my_role() = 'super_admin'
    or public.is_class_teacher(class_id)
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() = 'super_admin'
    or public.is_class_teacher(class_id)
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );

drop policy if exists "lms_lessons_student_read" on public.lms_lessons;
create policy "lms_lessons_student_read" on public.lms_lessons for select
  using (
    status = 'published'
    and deleted_at is null
    and public.is_enrolled_in_class(class_id)
  );

-- 7.2 Bài tập: như bài giảng (học viên đọc mọi bài tập lớp mình)
drop policy if exists "lms_assignments_manage" on public.lms_assignments;
create policy "lms_assignments_manage" on public.lms_assignments for all
  using (
    public.get_my_role() = 'super_admin'
    or public.is_class_teacher(class_id)
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() = 'super_admin'
    or public.is_class_teacher(class_id)
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );

drop policy if exists "lms_assignments_student_read" on public.lms_assignments;
create policy "lms_assignments_student_read" on public.lms_assignments for select
  using (deleted_at is null and public.is_enrolled_in_class(class_id));

-- 7.3 Bài nộp: học viên tạo/sửa bài CỦA MÌNH khi CHƯA chấm;
--     GV lớp + Staff subtree đọc và chấm.
drop policy if exists "lms_submissions_student_own" on public.lms_submissions;
create policy "lms_submissions_student_own" on public.lms_submissions for select
  using (student_id = auth.uid());

drop policy if exists "lms_submissions_student_insert" on public.lms_submissions;
create policy "lms_submissions_student_insert" on public.lms_submissions for insert
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.lms_assignments a
      where a.id = assignment_id
        and a.deleted_at is null
        and public.is_enrolled_in_class(a.class_id)
    )
  );

drop policy if exists "lms_submissions_student_update" on public.lms_submissions;
create policy "lms_submissions_student_update" on public.lms_submissions for update
  using (student_id = auth.uid() and score is null)   -- đã chấm thì khóa
  with check (student_id = auth.uid());

drop policy if exists "lms_submissions_teacher" on public.lms_submissions;
create policy "lms_submissions_teacher" on public.lms_submissions for all
  using (
    public.get_my_role() = 'super_admin'
    or exists (
      select 1 from public.lms_assignments a
      where a.id = assignment_id and public.is_class_teacher(a.class_id)
    )
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );

-- 7.4 Quiz: GV/Staff toàn quyền; học viên đọc đề PUBLISHED lớp mình
--     (KHÔNG gồm câu hỏi - xem 7.5)
drop policy if exists "lms_quizzes_manage" on public.lms_quizzes;
create policy "lms_quizzes_manage" on public.lms_quizzes for all
  using (
    public.get_my_role() = 'super_admin'
    or public.is_class_teacher(class_id)
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() = 'super_admin'
    or public.is_class_teacher(class_id)
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );

drop policy if exists "lms_quizzes_student_read" on public.lms_quizzes;
create policy "lms_quizzes_student_read" on public.lms_quizzes for select
  using (
    is_published = true
    and deleted_at is null
    and public.is_enrolled_in_class(class_id)
  );

-- 7.5 Câu hỏi: CHỈ GV/Staff. Học viên KHÔNG có policy nào
--     -> không bao giờ đọc được correct_index qua client.
--     Học viên nhận câu hỏi (đã cắt đáp án) qua Server Action Service Role.
drop policy if exists "lms_quiz_questions_manage" on public.lms_quiz_questions;
create policy "lms_quiz_questions_manage" on public.lms_quiz_questions for all
  using (
    public.get_my_role() = 'super_admin'
    or exists (
      select 1 from public.lms_quizzes q
      where q.id = quiz_id and public.is_class_teacher(q.class_id)
    )
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );

-- 7.6 Lượt làm bài: học viên xem KẾT QUẢ của mình; GV lớp + Staff xem
--     tất cả. INSERT/UPDATE chỉ qua Service Role (server tự chấm) ->
--     không có policy ghi cho client = không thể sửa điểm.
drop policy if exists "lms_quiz_attempts_student_own" on public.lms_quiz_attempts;
create policy "lms_quiz_attempts_student_own" on public.lms_quiz_attempts for select
  using (student_id = auth.uid());

drop policy if exists "lms_quiz_attempts_teacher" on public.lms_quiz_attempts;
create policy "lms_quiz_attempts_teacher" on public.lms_quiz_attempts for select
  using (
    public.get_my_role() = 'super_admin'
    or exists (
      select 1 from public.lms_quizzes q
      where q.id = quiz_id and public.is_class_teacher(q.class_id)
    )
    or (public.get_my_role() in ('campus_admin', 'academic_staff')
        and public.is_org_in_my_subtree(org_id))
  );
