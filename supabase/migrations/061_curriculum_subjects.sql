-- ================================================================
-- 061: CURRICULUM TỐI THIỂU TRÊN subjects (P4)
-- - CHỈ ADD COLUMN — không đổi name/id/org_id
-- ================================================================

alter table public.subjects
  add column if not exists code text,
  add column if not exists credits numeric(4,1),
  add column if not exists total_periods int,
  add column if not exists prerequisites uuid[] not null default '{}',
  add column if not exists learning_outcomes text;

comment on column public.subjects.code is 'Ma mon (tuy chon) — khong thay MaSV/student_code.';
comment on column public.subjects.credits is 'So tin chi (P4).';
comment on column public.subjects.total_periods is 'Tong so tiet.';
comment on column public.subjects.prerequisites is 'Mang subject.id tien quyet.';
comment on column public.subjects.learning_outcomes is 'Chuan dau ra (text).';
