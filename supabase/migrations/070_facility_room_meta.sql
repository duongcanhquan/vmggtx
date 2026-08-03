-- ============================================================
-- 070: Phòng học — sức chứa, mã phòng, vị trí, loại phòng
-- Mở rộng bảng facilities (033) phục vụ xếp TKB + quản lý cơ sở.
-- Idempotent. CHƯA chạy trên DB thật → user chạy SQL Editor.
-- ============================================================

alter table public.facilities
  add column if not exists capacity integer
    check (capacity is null or capacity > 0);

alter table public.facilities
  add column if not exists code text;

alter table public.facilities
  add column if not exists location text;

-- Loại phòng chi tiết (chỉ meaningful khi type = 'room')
alter table public.facilities
  add column if not exists room_kind text
    check (
      room_kind is null
      or room_kind in ('classroom', 'lab', 'meeting', 'hall', 'other')
    );

comment on column public.facilities.capacity is
  'Sức chứa (số người). Null = chưa khai báo.';
comment on column public.facilities.code is
  'Mã ngắn hiển thị TKB (VD: P.301).';
comment on column public.facilities.location is
  'Vị trí (tầng / dãy / tòa).';
comment on column public.facilities.room_kind is
  'Phân loại phòng: classroom|lab|meeting|hall|other (khi type=room).';

create index if not exists idx_facilities_org_type_live
  on public.facilities (org_id, type)
  where deleted_at is null and is_active = true;

-- Mặc định room_kind = classroom cho phòng hiện có chưa gán
update public.facilities
set room_kind = 'classroom'
where type = 'room'
  and room_kind is null
  and deleted_at is null;
