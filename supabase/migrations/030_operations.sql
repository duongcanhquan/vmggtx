-- ============================================================
-- 030 - VẬN HÀNH TRUNG TÂM (rà soát góc nhìn Quản lý)
--
-- 1) announcements : Thông báo chung của cơ sở -> phát tới
--    phụ huynh / học viên / giáo viên (nghỉ lễ, học phí, sự kiện...)
-- 2) enrollments   : mở rộng vòng đời ghi danh - thêm 'paused'
--    (bảo lưu) + lý do + thời điểm đổi trạng thái
-- 3) classes       : sĩ số tối đa (max_students) để chặn ghi danh
--    vượt sức chứa phòng học
--
-- Idempotent: chạy lại không lỗi.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) BẢNG THÔNG BÁO CHUNG
-- ---------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  title       text not null,
  body        text not null,
  audience    text not null default 'all'
              check (audience in ('all', 'parents', 'students', 'teachers')),
  pinned      boolean not null default false,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_announcements_org
  on public.announcements (org_id, created_at desc);

drop trigger if exists trg_announcements_updated_at on public.announcements;
create trigger trg_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

drop policy if exists "announcements_super_admin_all" on public.announcements;
drop policy if exists "announcements_manager_all" on public.announcements;
drop policy if exists "announcements_member_select" on public.announcements;

create policy "announcements_super_admin_all"
  on public.announcements for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Quản lý cơ sở + giáo vụ: soạn/sửa/gỡ thông báo trong subtree
create policy "announcements_manager_all"
  on public.announcements for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Mọi thành viên cơ sở (GV/HS...): ĐỌC thông báo của org mình
create policy "announcements_member_select"
  on public.announcements for select
  using (org_id = public.get_my_org_id() or public.is_org_in_my_subtree(org_id));

comment on table public.announcements is
  'Thông báo chung của cơ sở - phát tới phụ huynh/học viên/giáo viên theo audience';

-- ---------------------------------------------------------------
-- 2) VÒNG ĐỜI GHI DANH: thêm 'paused' (bảo lưu) + lý do
-- ---------------------------------------------------------------
alter table public.enrollments
  add column if not exists status_note text,
  add column if not exists status_changed_at timestamptz;

do $$
begin
  alter table public.enrollments drop constraint if exists enrollments_status_check;
  alter table public.enrollments
    add constraint enrollments_status_check
    check (status in ('active', 'completed', 'dropped', 'paused'));
end $$;

comment on column public.enrollments.status_note is
  'Lý do đổi trạng thái (chuyển lớp, bảo lưu, thôi học) - do giáo vụ ghi';

-- ---------------------------------------------------------------
-- 3) SĨ SỐ LỚP TỐI ĐA
-- ---------------------------------------------------------------
alter table public.classes
  add column if not exists max_students integer
  check (max_students is null or max_students > 0);

comment on column public.classes.max_students is
  'Sĩ số tối đa - null = không giới hạn. App chặn ghi danh khi lớp đầy.';
