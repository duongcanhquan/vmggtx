-- ================================================================
-- 060: GẮN PHÒNG CSVC VÀO BUỔI HỌC (P3)
-- - CHỈ ADD cột facility_id nullable — GIỮ nguyên room (text)
-- ================================================================

alter table public.class_sessions
  add column if not exists facility_id uuid
    references public.facilities (id);

create index if not exists idx_class_sessions_facility
  on public.class_sessions (facility_id)
  where deleted_at is null and facility_id is not null;

comment on column public.class_sessions.facility_id is
  'FK facilities (P3). room text van dung — khong thay the.';
