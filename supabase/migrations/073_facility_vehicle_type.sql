-- ============================================================
-- 073: CSVC — thêm loại «xe» (vehicle) vào facilities
-- Dùng chung facility_bookings (033) cho đặt phòng / thiết bị / xe.
-- Idempotent. CHƯA chạy trên DB thật → user chạy SQL Editor.
-- ============================================================

alter table public.facilities drop constraint if exists facilities_type_check;

alter table public.facilities
  add constraint facilities_type_check
  check (type in ('room', 'projector', 'lab_equipment', 'vehicle'));

comment on column public.facilities.type is
  'room | projector | lab_equipment | vehicle (073) — đặt lịch qua facility_bookings.';
