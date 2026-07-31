-- ============================================================
-- GDTX ERP - 003_subjects
-- Bảng Môn học + trạng thái kích hoạt (phục vụ Check 2 khi tạo lớp).
-- Lớp học gắn với môn qua classes.subject_id.
-- ============================================================

create table if not exists public.subjects (
  id          uuid primary key default uuid_generate_v4(),
  -- org_id NULL = môn dùng chung toàn hệ thống; có giá trị = môn riêng của org đó
  org_id      uuid references public.organizations (id),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_subjects_org on public.subjects (org_id);
create index if not exists idx_subjects_active on public.subjects (is_active);

create trigger trg_subjects_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- Gắn môn học vào lớp
alter table public.classes
  add column if not exists subject_id uuid references public.subjects (id);

create index if not exists idx_classes_subject on public.classes (subject_id);
