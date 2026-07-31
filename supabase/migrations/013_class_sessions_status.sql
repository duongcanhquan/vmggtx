-- ============================================================
-- GDTX ERP - 013_class_sessions_status
-- Thêm vòng đời cho buổi học để Engine Tính Lương đếm chính xác
-- "số tiết ĐÃ DẠY" (status = 'completed').
--
-- Quy ước:
--   scheduled : đã xếp lịch, chưa diễn ra / chưa chốt.
--   completed : giáo viên đã CHỐT ĐIỂM DANH (check-in) - buổi này
--               được tính công khi chạy bảng lương.
--   cancelled : buổi bị hủy, không tính công.
-- ============================================================

alter table public.class_sessions
  add column if not exists status text not null default 'scheduled'
  check (status in ('scheduled', 'completed', 'cancelled'));

comment on column public.class_sessions.status is
  'scheduled | completed (đã chốt điểm danh - tính lương) | cancelled';

-- Backfill dữ liệu cũ: buổi nào đã có bản ghi điểm danh nghĩa là
-- giáo viên đã chốt -> đánh dấu completed
update public.class_sessions cs
set status = 'completed'
where cs.status = 'scheduled'
  and cs.deleted_at is null
  and exists (
    select 1
    from public.attendance a
    where a.session_id = cs.id
      and a.deleted_at is null
  );

-- Index phục vụ query lương: đếm buổi theo GV + trạng thái + tháng
create index if not exists idx_class_sessions_teacher_status_time
  on public.class_sessions (teacher_id, status, start_time);
