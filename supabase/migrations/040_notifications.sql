-- ============================================================
-- 040 - THÔNG BÁO ĐẨY CÁ NHÂN (user_notifications)
--
-- 1) user_notifications: thông báo đẩy tới TỪNG người nhận
--    (nhắc học phí, đổi lịch/dạy thay, thông báo chung...).
--    Khác announcements (phát loa cả cơ sở), bảng này đích danh
--    recipient_id -> hiển thị ở Cổng Học viên + Sổ Liên Lạc PH.
--    ref_id: id đối tượng gốc (vd: invoice) để CHỐNG SPAM nhắc lại.
-- 2) Vá check_schedule_conflict: BỎ QUA buổi đã hủy (cancelled)
--    khi kiểm tra trùng lịch - buổi gốc bị hủy không được chặn
--    chính buổi học bù/giáo viên dạy thay của nó.
--
-- Idempotent: chạy lại không lỗi.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) BẢNG THÔNG BÁO ĐẨY CÁ NHÂN
-- ---------------------------------------------------------------
create table if not exists public.user_notifications (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  recipient_id  uuid not null references public.profiles (id),
  type          text not null default 'general'
                check (type in ('general', 'tuition_reminder', 'schedule_change', 'announcement')),
  title         text not null,
  body          text not null default '',
  link          text,
  ref_id        uuid,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_user_notifications_recipient
  on public.user_notifications (recipient_id, created_at desc);

-- Chống spam: tra nhanh "đã nhắc hóa đơn này gần đây chưa"
create index if not exists idx_user_notifications_ref
  on public.user_notifications (ref_id, type, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "notif_recipient_select" on public.user_notifications;
drop policy if exists "notif_recipient_update" on public.user_notifications;
drop policy if exists "notif_staff_insert"     on public.user_notifications;
drop policy if exists "notif_staff_select"     on public.user_notifications;

-- Người nhận: đọc thông báo của chính mình
create policy "notif_recipient_select"
  on public.user_notifications for select
  using (recipient_id = auth.uid());

-- Người nhận: đánh dấu đã đọc (chỉ record của mình)
create policy "notif_recipient_update"
  on public.user_notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Nhân sự: gửi thông báo trong subtree của mình
create policy "notif_staff_insert"
  on public.user_notifications for insert
  with check (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
      and public.is_org_in_my_subtree(org_id)
    )
  );

-- Nhân sự: xem thông báo đã gửi trong subtree (đối soát)
create policy "notif_staff_select"
  on public.user_notifications for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
      and public.is_org_in_my_subtree(org_id)
    )
  );

comment on table public.user_notifications is
  'Thông báo đẩy đích danh từng người nhận: nhắc học phí, đổi lịch, tin chung. ref_id dùng chống nhắc trùng.';

-- ---------------------------------------------------------------
-- 2) VÁ check_schedule_conflict: bỏ qua buổi ĐÃ HỦY
-- ---------------------------------------------------------------
create or replace function public.check_schedule_conflict(
  p_teacher_id uuid,
  p_room       text,
  p_start_time timestamptz,
  p_end_time   timestamptz
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.class_sessions cs
    where cs.deleted_at is null
      and coalesce(cs.status, 'scheduled') <> 'cancelled'
      and tstzrange(cs.start_time, cs.end_time) && tstzrange(p_start_time, p_end_time)
      and (
        (p_teacher_id is not null and (
          cs.teacher_id = p_teacher_id or cs.substitute_teacher_id = p_teacher_id
        ))
        or (p_room is not null and p_room <> '' and cs.room = p_room)
      )
  );
$$;

comment on function public.check_schedule_conflict is
  'Trùng lịch GV (kể cả dạy thay) hoặc phòng - BỎ QUA buổi đã hủy và đã xóa mềm.';
