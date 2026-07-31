-- ============================================================
-- GDTX ERP - 023_exam_office
-- MODULE KHẢO THÍ (Staff Portal):
--   1. assessments.grading_deadline  : hạn chót nhập điểm của bài thi
--   2. class_results.lock_status     : 'open' | 'review' | 'locked'
--      - lock_status là NGUỒN SỰ THẬT mới; is_locked chuyển thành
--        GENERATED COLUMN (lock_status = 'locked') để mọi code đọc
--        is_locked cũ vẫn chạy đúng, không bao giờ lệch trạng thái.
--   3. Trigger prevent_locked_grade_changes nâng cấp: chặn cả khi
--      QUÁ HẠN grading_deadline (tầng DB - tầng 1 là Server Action).
--      Khảo thí "Gia hạn nhập điểm" = dời grading_deadline về tương
--      lai + mở lock_status -> trigger tự cho nhập lại.
-- ============================================================

-- 1. assessments.grading_deadline --------------------------------
alter table public.assessments
  add column if not exists grading_deadline timestamptz;

comment on column public.assessments.grading_deadline is
  'Hạn chót giáo viên được nhập/sửa điểm bài thi này. NULL = không giới hạn.';

-- 2. class_results.lock_status ------------------------------------
alter table public.class_results
  add column if not exists lock_status text not null default 'open'
  check (lock_status in ('open', 'review', 'locked'));

-- Backfill từ cột boolean cũ
update public.class_results
set lock_status = 'locked'
where is_locked = true
  and lock_status <> 'locked';

-- is_locked -> GENERATED COLUMN (chỉ đọc, luôn khớp lock_status)
alter table public.class_results drop column if exists is_locked;
alter table public.class_results
  add column is_locked boolean generated always as (lock_status = 'locked') stored;

create index if not exists idx_class_results_lock_status
  on public.class_results (lock_status);

-- 3. Trigger chặn sửa điểm: khóa sổ HOẶC quá hạn nhập điểm ---------
create or replace function public.prevent_locked_grade_changes()
returns trigger
language plpgsql
as $$
declare
  v_class_id uuid;
  v_deadline timestamptz;
  v_status   text;
begin
  select a.class_id, a.grading_deadline
  into v_class_id, v_deadline
  from public.assessments a
  where a.id = coalesce(new.assessment_id, old.assessment_id);

  select cr.lock_status
  into v_status
  from public.class_results cr
  where cr.class_id = v_class_id
    and cr.deleted_at is null;

  if coalesce(v_status, 'open') = 'locked' then
    raise exception 'GRADEBOOK_LOCKED: Bảng điểm của lớp đã được chốt, không thể thay đổi.';
  end if;

  if v_deadline is not null and now() > v_deadline then
    raise exception 'GRADING_DEADLINE_PASSED: Đã hết hạn nhập điểm. Vui lòng liên hệ phòng Khảo thí.';
  end if;

  return coalesce(new, old);
end;
$$;

-- Trigger trg_grades_prevent_locked (migration 008) giữ nguyên,
-- function trên đã được thay thế in-place.
