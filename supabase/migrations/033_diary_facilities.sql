-- ============================================================
-- 033 - SỔ ĐẦU BÀI ĐIỆN TỬ + ĐẶT PHÒNG & THIẾT BỊ
--
-- 1) class_sessions.diary_notes (jsonb) - Tổng kết buổi học:
--    { "actual_content": "Nội dung thực dạy (so với giáo án)",
--      "attitude": "good" | "fair" | "noisy",
--      "reminders": "Nhắc nhở chung" }
--    Tự động hiển thị lên Parent Portal (sổ liên lạc).
--
-- 2) facilities + facility_bookings - Quản lý tài sản:
--    - RPC check_facility_conflict: chống trùng giờ đặt (giống
--      logic check_schedule_conflict của lịch học).
--    - EXCLUSION CONSTRAINT (btree_gist): chặn double-booking
--      ngay tầng database kể cả khi 2 người đặt CÙNG LÚC (race).
--
-- [ĐA TẦNG] org_id + RLS subtree. Idempotent.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) SỔ ĐẦU BÀI ĐIỆN TỬ
-- ---------------------------------------------------------------
alter table public.class_sessions
  add column if not exists diary_notes jsonb;

comment on column public.class_sessions.diary_notes is
  'Sổ đầu bài: {actual_content, attitude(good|fair|noisy), reminders} - hiển thị Parent Portal';

-- ---------------------------------------------------------------
-- 2) TÀI SẢN (PHÒNG / THIẾT BỊ)
-- ---------------------------------------------------------------
create extension if not exists btree_gist;

create table if not exists public.facilities (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  type        text not null check (type in ('room', 'projector', 'lab_equipment')),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_facilities_org
  on public.facilities (org_id) where deleted_at is null;

drop trigger if exists trg_facilities_updated_at on public.facilities;
create trigger trg_facilities_updated_at
  before update on public.facilities
  for each row execute function public.set_updated_at();

create table if not exists public.facility_bookings (
  id           uuid primary key default uuid_generate_v4(),
  facility_id  uuid not null references public.facilities (id) on delete cascade,
  reserved_by  uuid not null references public.profiles (id),
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  purpose      text,
  status       text not null default 'confirmed'
               check (status in ('confirmed', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint chk_booking_time check (end_time > start_time)
);

create index if not exists idx_facility_bookings_facility
  on public.facility_bookings (facility_id, start_time);
create index if not exists idx_facility_bookings_reserver
  on public.facility_bookings (reserved_by);

drop trigger if exists trg_facility_bookings_updated_at on public.facility_bookings;
create trigger trg_facility_bookings_updated_at
  before update on public.facility_bookings
  for each row execute function public.set_updated_at();

-- CHẶN DOUBLE-BOOKING TẦNG DB: 2 booking 'confirmed' của cùng
-- 1 tài sản không được giao nhau về thời gian (kể cả race condition).
do $$ begin
  alter table public.facility_bookings
    add constraint excl_facility_booking_overlap
    exclude using gist (
      facility_id with =,
      tstzrange(start_time, end_time) with &&
    ) where (status = 'confirmed' and deleted_at is null);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end $$;

-- RPC chống trùng giờ (dùng cho validate thân thiện trước khi insert)
create or replace function public.check_facility_conflict(
  p_facility_id uuid,
  p_start_time  timestamptz,
  p_end_time    timestamptz
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.facility_bookings fb
    where fb.facility_id = p_facility_id
      and fb.status = 'confirmed'
      and fb.deleted_at is null
      and tstzrange(fb.start_time, fb.end_time) && tstzrange(p_start_time, p_end_time)
  );
$$;

-- ----- RLS -----
alter table public.facilities enable row level security;
alter table public.facility_bookings enable row level security;

drop policy if exists "facilities_super_admin_all" on public.facilities;
drop policy if exists "facilities_staff_all" on public.facilities;
drop policy if exists "facilities_member_select" on public.facilities;
drop policy if exists "facility_bookings_super_admin_all" on public.facility_bookings;
drop policy if exists "facility_bookings_staff_all" on public.facility_bookings;
drop policy if exists "facility_bookings_member_select" on public.facility_bookings;
drop policy if exists "facility_bookings_member_insert" on public.facility_bookings;
drop policy if exists "facility_bookings_owner_update" on public.facility_bookings;

create policy "facilities_super_admin_all"
  on public.facilities for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "facilities_staff_all"
  on public.facilities for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Thành viên org (GV...) XEM tài sản đang hoạt động của org mình
create policy "facilities_member_select"
  on public.facilities for select
  using (org_id = public.get_my_org_id() and is_active = true and deleted_at is null);

create policy "facility_bookings_super_admin_all"
  on public.facility_bookings for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "facility_bookings_staff_all"
  on public.facility_bookings for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and exists (
      select 1 from public.facilities f
      where f.id = facility_id and public.is_org_in_my_subtree(f.org_id)
    )
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and exists (
      select 1 from public.facilities f
      where f.id = facility_id and public.is_org_in_my_subtree(f.org_id)
    )
  );

-- Thành viên org XEM lịch đặt của tài sản org mình (để tránh đặt trùng)
create policy "facility_bookings_member_select"
  on public.facility_bookings for select
  using (
    exists (
      select 1 from public.facilities f
      where f.id = facility_id and f.org_id = public.get_my_org_id()
    )
  );

-- GV/staff tự ĐẶT tài sản của org mình (reserved_by = chính mình)
create policy "facility_bookings_member_insert"
  on public.facility_bookings for insert
  with check (
    reserved_by = auth.uid()
    and status = 'confirmed'
    and exists (
      select 1 from public.facilities f
      where f.id = facility_id
        and f.org_id = public.get_my_org_id()
        and f.is_active = true
        and f.deleted_at is null
    )
  );

-- Người đặt tự HỦY booking của mình
create policy "facility_bookings_owner_update"
  on public.facility_bookings for update
  using (reserved_by = auth.uid())
  with check (reserved_by = auth.uid());

comment on table public.facilities is
  'Tài sản đặt được: phòng học, máy chiếu, thiết bị lab - theo org';
comment on table public.facility_bookings is
  'Lịch đặt tài sản - exclusion constraint chống double-booking tầng DB';
