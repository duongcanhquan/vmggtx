-- ============================================================
-- 076 - Thong bao chung: pham vi gui (toan bo / theo lop / ca nhan)
-- Idempotent.
-- ============================================================

alter table public.announcements
  add column if not exists target_scope text not null default 'all';

alter table public.announcements
  drop constraint if exists announcements_target_scope_check;

alter table public.announcements
  add constraint announcements_target_scope_check
  check (target_scope in ('all', 'class', 'individual'));

alter table public.announcements
  add column if not exists target_class_ids uuid[] not null default '{}';

alter table public.announcements
  add column if not exists target_user_ids uuid[] not null default '{}';

comment on column public.announcements.target_scope is
  'all = ca nhom audience; class = theo lop; individual = user/HV cu the';
comment on column public.announcements.target_class_ids is
  'Danh sach lop khi target_scope=class';
comment on column public.announcements.target_user_ids is
  'Danh sach profile (HV/GV) khi target_scope=individual; PH nhan theo student_id';
