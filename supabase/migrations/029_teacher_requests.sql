-- ============================================================
-- 029 - KÊNH TRAO ĐỔI LỊCH DẠY HAI CHIỀU (teacher_requests)
--
-- Giáo viên tự đăng nhập cổng và:
--   - 'propose' : ĐỀ XUẤT lịch dạy (khung giờ + lớp mong muốn)
--   - 'leave'   : XIN NGHỈ một buổi dạy cụ thể
-- Giáo vụ / Quản lý cơ sở duyệt hoặc từ chối KÈM PHẢN HỒI
-- (review_note) -> hai bên trao đổi song hành trên cùng 1 đơn.
--
-- Khi DUYỆT (xử lý ở Server Action):
--   - leave   -> class_sessions.status = 'cancelled' (TKB + lương nhận biết)
--   - propose -> tạo buổi học mới (đã check trùng lịch giáo viên)
--
-- Idempotent: chạy lại không lỗi.
-- ============================================================

create table if not exists public.teacher_requests (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references public.organizations (id),
  teacher_id      uuid not null references public.profiles (id),
  request_type    text not null check (request_type in ('propose', 'leave')),

  -- 'leave': buổi dạy xin nghỉ | 'propose': lớp + khung giờ đề xuất
  session_id      uuid references public.class_sessions (id),
  class_id        uuid references public.classes (id),
  proposed_start  timestamptz,
  proposed_end    timestamptz,

  reason          text not null,           -- lời nhắn của giáo viên
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note     text,                    -- phản hồi của giáo vụ
  reviewed_by     uuid references public.profiles (id),
  reviewed_at     timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint chk_propose_time check (
    proposed_start is null or proposed_end is null or proposed_end > proposed_start
  )
);

create index if not exists idx_teacher_requests_org
  on public.teacher_requests (org_id, status);
create index if not exists idx_teacher_requests_teacher
  on public.teacher_requests (teacher_id, created_at desc);

drop trigger if exists trg_teacher_requests_updated_at on public.teacher_requests;
create trigger trg_teacher_requests_updated_at
  before update on public.teacher_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.teacher_requests enable row level security;

drop policy if exists "teacher_requests_super_admin_all" on public.teacher_requests;
drop policy if exists "teacher_requests_staff_all" on public.teacher_requests;
drop policy if exists "teacher_requests_teacher_select" on public.teacher_requests;
drop policy if exists "teacher_requests_teacher_insert" on public.teacher_requests;
drop policy if exists "teacher_requests_teacher_cancel" on public.teacher_requests;

-- super_admin: toàn quyền
create policy "teacher_requests_super_admin_all"
  on public.teacher_requests for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Giáo vụ + Quản lý cơ sở: toàn quyền trong subtree (duyệt/từ chối)
create policy "teacher_requests_staff_all"
  on public.teacher_requests for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Giáo viên: xem đơn CỦA MÌNH
create policy "teacher_requests_teacher_select"
  on public.teacher_requests for select
  using (teacher_id = auth.uid());

-- Giáo viên: tạo đơn cho CHÍNH MÌNH, trạng thái khởi tạo pending
create policy "teacher_requests_teacher_insert"
  on public.teacher_requests for insert
  with check (teacher_id = auth.uid() and status = 'pending');

-- Giáo viên: chỉ được RÚT đơn của mình khi còn pending
create policy "teacher_requests_teacher_cancel"
  on public.teacher_requests for update
  using (teacher_id = auth.uid() and status = 'pending')
  with check (teacher_id = auth.uid() and status in ('pending', 'cancelled'));

comment on table public.teacher_requests is
  'Đơn từ giáo viên: đề xuất lịch dạy (propose) / xin nghỉ buổi (leave) - giáo vụ duyệt kèm phản hồi';
