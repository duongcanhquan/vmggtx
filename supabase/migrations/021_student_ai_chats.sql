-- ============================================================
-- GDTX ERP - 021_student_ai_chats
-- Nhật ký câu hỏi học sinh gửi Trợ lý AI (Chat Tutor / Copilot).
--
-- Phục vụ trang "Hồ sơ Học sinh 360°": cố vấn học tập xem học
-- sinh hay hỏi AI về môn/lớp nào nhất để tư vấn kịp thời.
-- ============================================================

create table if not exists public.student_ai_chats (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  student_id  uuid not null references public.profiles (id),
  class_id    uuid references public.classes (id),
  task_type   text not null default 'tutor' check (task_type in ('tutor', 'lesson_plan', 'hr_query')),
  question    text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_student_ai_chats_student
  on public.student_ai_chats (student_id, created_at desc);
create index if not exists idx_student_ai_chats_org
  on public.student_ai_chats (org_id);

-- ---------------------------------------------------------------
-- RLS:
-- - Học sinh đọc/ghi lịch sử CỦA MÌNH.
-- - super_admin đọc tất cả; campus_admin/academic_staff đọc trong
--   subtree (cố vấn học tập).
-- - API routes ghi log bằng Service Role (bỏ qua RLS) nên không
--   cần policy insert cho staff.
-- ---------------------------------------------------------------
alter table public.student_ai_chats enable row level security;

drop policy if exists "student_ai_chats_owner_select" on public.student_ai_chats;
drop policy if exists "student_ai_chats_owner_insert" on public.student_ai_chats;
drop policy if exists "student_ai_chats_staff_select" on public.student_ai_chats;

create policy "student_ai_chats_owner_select"
  on public.student_ai_chats for select
  using (student_id = auth.uid());

create policy "student_ai_chats_owner_insert"
  on public.student_ai_chats for insert
  with check (student_id = auth.uid());

create policy "student_ai_chats_staff_select"
  on public.student_ai_chats for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
  );
