-- ============================================================
-- GDTX ERP - 008_gradebook
-- Sổ điểm điện tử + cơ chế Khóa bảng điểm (Freeze).
--   assessments   : bài kiểm tra của lớp (hệ số, điểm tối đa)
--   grades        : điểm từng học viên theo bài kiểm tra
--   class_results : trạng thái tổng kết lớp (is_locked)
-- CHẶN 2 TẦNG khi is_locked = true:
--   1. Server Action từ chối sớm (thông báo thân thiện).
--   2. TRIGGER trên grades chặn tuyệt đối ở tầng DB
--      (kể cả khi ai đó gọi thẳng API Supabase).
-- ============================================================

-- 1. BẢNG assessments (Bài kiểm tra) ---------------------------
create table if not exists public.assessments (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  class_id    uuid not null references public.classes (id),
  name        text not null,                       -- VD: 'Giữa kỳ', '15 phút'
  weight      numeric(4, 2) not null default 1 check (weight > 0),
  max_score   numeric(5, 2) not null default 10 check (max_score > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_assessments_class on public.assessments (class_id);
create index if not exists idx_assessments_org on public.assessments (org_id);

drop trigger if exists trg_assessments_updated_at on public.assessments;
create trigger trg_assessments_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();

-- 2. BẢNG grades (Điểm số) -------------------------------------
create table if not exists public.grades (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references public.organizations (id),
  assessment_id  uuid not null references public.assessments (id),
  student_id     uuid not null references public.profiles (id),
  score          numeric(5, 2) not null check (score >= 0),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  -- Upsert theo (bài kiểm tra, học viên): nhập lại sẽ ghi đè
  constraint uq_grades_assessment_student unique (assessment_id, student_id)
);

create index if not exists idx_grades_assessment on public.grades (assessment_id);
create index if not exists idx_grades_student on public.grades (student_id);

drop trigger if exists trg_grades_updated_at on public.grades;
create trigger trg_grades_updated_at
  before update on public.grades
  for each row execute function public.set_updated_at();

-- 3. BẢNG class_results (Tổng kết / Khóa sổ) -------------------
create table if not exists public.class_results (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  class_id    uuid not null references public.classes (id) unique,
  is_locked   boolean not null default false,
  locked_at   timestamptz,
  locked_by   uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_class_results_class on public.class_results (class_id);

drop trigger if exists trg_class_results_updated_at on public.class_results;
create trigger trg_class_results_updated_at
  before update on public.class_results
  for each row execute function public.set_updated_at();

-- 4. TRIGGER CHẶN SỬA ĐIỂM KHI ĐÃ KHÓA (tầng DB) ---------------
create or replace function public.prevent_locked_grade_changes()
returns trigger
language plpgsql
as $$
declare
  v_class_id uuid;
  v_locked   boolean;
begin
  select a.class_id
  into v_class_id
  from public.assessments a
  where a.id = coalesce(new.assessment_id, old.assessment_id);

  select cr.is_locked
  into v_locked
  from public.class_results cr
  where cr.class_id = v_class_id
    and cr.deleted_at is null;

  if coalesce(v_locked, false) then
    raise exception 'GRADEBOOK_LOCKED: Bảng điểm của lớp đã được chốt, không thể thay đổi.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_grades_prevent_locked on public.grades;
create trigger trg_grades_prevent_locked
  before insert or update or delete on public.grades
  for each row execute function public.prevent_locked_grade_changes();

-- 5. HELPER: user hiện tại có phải giáo viên của lớp không? ----
create or replace function public.is_my_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.teacher_id = auth.uid()
      and c.deleted_at is null
  );
$$;

-- 6. ROW LEVEL SECURITY ----------------------------------------
-- super_admin: tất cả. campus_admin/academic_staff: trong subtree.
-- teacher: chỉ lớp mình phụ trách (kể cả lớp ở chi nhánh khác).

alter table public.assessments enable row level security;
alter table public.grades enable row level security;
alter table public.class_results enable row level security;

drop policy if exists "gradebook_all_assessments" on public.assessments;
drop policy if exists "gradebook_all_grades" on public.grades;
drop policy if exists "gradebook_all_class_results" on public.class_results;

create policy "gradebook_all_assessments"
  on public.assessments for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_class(class_id)
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_class(class_id)
  );

create policy "gradebook_all_grades"
  on public.grades for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or exists (
      select 1
      from public.assessments a
      where a.id = assessment_id
        and public.is_my_class(a.class_id)
    )
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or exists (
      select 1
      from public.assessments a
      where a.id = assessment_id
        and public.is_my_class(a.class_id)
    )
  );

create policy "gradebook_all_class_results"
  on public.class_results for all
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_class(class_id)
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff')
      and public.is_org_in_my_subtree(org_id)
    )
    or public.is_my_class(class_id)
  );
