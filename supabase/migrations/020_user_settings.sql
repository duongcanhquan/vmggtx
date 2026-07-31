-- ============================================================
-- GDTX ERP - 020_user_settings
-- Tầng CÁ NHÂN cho chuỗi kế thừa cài đặt:
--   Cá nhân (user_settings) -> Cơ sở -> Cụm -> HQ (org_settings)
--   -> default trong code (settingsResolver.ts).
--
-- org_settings (migration 016) đã lo 3 tầng tổ chức; bảng này bổ
-- sung tầng ghi đè theo từng user (VD: cá nhân tắt thông báo SMS).
-- ============================================================

create table if not exists public.user_settings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  -- Cùng dạng key/value với org_settings.config, VD:
  -- { "auto_attendance_sms": false }
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);

create index if not exists idx_user_settings_user on public.user_settings (user_id);

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- RLS: mỗi user toàn quyền với record CỦA MÌNH; super_admin đọc
-- tất cả (phục vụ hỗ trợ/kiểm tra). Không ai sửa hộ người khác.
-- ---------------------------------------------------------------
alter table public.user_settings enable row level security;

drop policy if exists "user_settings_owner_all" on public.user_settings;
drop policy if exists "user_settings_super_admin_read" on public.user_settings;

create policy "user_settings_owner_all"
  on public.user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_settings_super_admin_read"
  on public.user_settings for select
  using (public.get_my_role() = 'super_admin');
