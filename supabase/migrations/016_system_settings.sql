-- ============================================================
-- GDTX ERP - 016_system_settings
-- Bộ Cấu hình động (Settings) bật/tắt tính năng theo từng cấp
-- tổ chức, có KẾ THỪA theo cây: Cơ sở không có record -> dùng
-- config của Vùng -> không có nữa -> dùng config Tổng công ty.
--
-- (Yêu cầu gốc đặt tên 008_system_settings.sql nhưng số 008 đã
--  dùng bởi 008_gradebook.sql nên file này mang số 016.)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. BẢNG org_settings
-- ---------------------------------------------------------------
create table if not exists public.org_settings (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null unique references public.organizations (id),
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);

comment on table public.org_settings is
  'Cấu hình động theo tổ chức. Key ví dụ: auto_attendance_sms (bool), max_absence_warning (int), grading_locked_days (int), require_manager_approval_for_refunds (bool).';

create index if not exists idx_org_settings_org on public.org_settings (org_id);

drop trigger if exists trg_org_settings_updated_at on public.org_settings;
create trigger trg_org_settings_updated_at
  before update on public.org_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 2. HÀM KẾ THỪA CẤU HÌNH: get_org_effective_config(p_org_id)
--    Merge JSONB theo thứ tự TỪ GỐC XUỐNG LÁ (HQ -> Region -> Campus)
--    bằng toán tử || : key ở cấp GẦN org nhất sẽ THẮNG (override).
--    Bắt đầu từ bộ DEFAULT để mọi key luôn có giá trị.
--    SECURITY DEFINER: mọi Server Action gọi được mà không vướng RLS.
-- ---------------------------------------------------------------
create or replace function public.get_org_effective_config(p_org_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb := '{
    "auto_attendance_sms": true,
    "max_absence_warning": 3,
    "grading_locked_days": 7,
    "require_manager_approval_for_refunds": true
  }'::jsonb;
  row_config jsonb;
begin
  -- Duyệt các tổ chức TỔ TIÊN (gồm chính nó) theo độ sâu tăng dần:
  -- HQ trước, org đích sau cùng -> cấp dưới override cấp trên.
  for row_config in
    select s.config
    from public.org_settings s
    join public.organizations o on o.id = s.org_id
    where o.deleted_at is null
      and o.path @> (select path from public.organizations where id = p_org_id)
    order by nlevel(o.path) asc
  loop
    result := result || coalesce(row_config, '{}'::jsonb);
  end loop;

  return result;
end;
$$;

grant execute on function public.get_org_effective_config(uuid) to authenticated;

comment on function public.get_org_effective_config(uuid) is
  'Cấu hình HIỆU LỰC của một org: default -> merge config các cấp cha từ gốc xuống -> merge config của chính org (cấp gần nhất thắng).';

-- ---------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------
alter table public.org_settings enable row level security;

drop policy if exists "org_settings_super_admin_all" on public.org_settings;
drop policy if exists "org_settings_campus_admin_all" on public.org_settings;
drop policy if exists "org_settings_member_read" on public.org_settings;

-- super_admin: toàn quyền
create policy "org_settings_super_admin_all"
  on public.org_settings for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- campus_admin: toàn quyền với org trong subtree của mình
create policy "org_settings_campus_admin_all"
  on public.org_settings for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );

-- Thành viên khác: chỉ ĐỌC config của org mình (đọc hiệu lực nên
-- dùng hàm get_org_effective_config là chính; policy này dự phòng)
create policy "org_settings_member_read"
  on public.org_settings for select
  using (org_id = public.get_my_org_id());
