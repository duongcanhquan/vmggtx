-- ============================================================
-- GDTX ERP - 017_ai_tenant_settings
-- Multi-tenant AI: mỗi cơ sở (org_id) cấu hình API Key AI riêng
-- để tự kiểm soát chi phí. Chi nhánh không có Key sẽ fallback
-- lên Key của cơ sở Mẹ (logic tại src/lib/ai/getTenantAIConfig.ts).
--
-- (Yêu cầu gốc đặt tên 009_ai_tenant_settings.sql nhưng số 009 đã
--  dùng bởi 009_enrollments_student_portal.sql nên file mang số 017.)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. BẢNG org_ai_settings
-- ---------------------------------------------------------------
create table if not exists public.org_ai_settings (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null unique references public.organizations (id),
  ai_provider    varchar(20) not null default 'openai'
                   check (ai_provider in ('openai', 'anthropic', 'google')),
  -- [MÃ HÓA] api_key được mã hóa AT REST bởi Supabase (AES-256 toàn bộ
  -- volume). Khuyến nghị PRODUCTION: nâng cấp lên Supabase Vault
  -- (vault.create_secret) để mã hóa cấp cột. Ứng dụng KHÔNG BAO GIỜ
  -- trả api_key về browser - chỉ trả 4 ký tự cuối để hiển thị.
  api_key        text not null,
  default_model  varchar(80) not null default 'gpt-4o-mini',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.org_ai_settings is
  'API Key AI riêng của từng tổ chức (multi-tenant AI). Chi nhánh không có key -> dùng key của org cha -> cuối cùng dùng env OPENAI_API_KEY.';

create index if not exists idx_org_ai_settings_org on public.org_ai_settings (org_id);

drop trigger if exists trg_org_ai_settings_updated_at on public.org_ai_settings;
create trigger trg_org_ai_settings_updated_at
  before update on public.org_ai_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 2. RLS - BẢO MẬT QUAN TRỌNG
--    API Key là dữ liệu tối mật:
--    - super_admin: toàn quyền.
--    - campus_admin: CHỈ xem/sửa key của org trong subtree của mình.
--    - MỌI role khác (staff, teacher, student...): KHÔNG policy nào
--      -> bị chặn hoàn toàn, kể cả SELECT.
--    Tầng chạy AI (getTenantAIConfig) dùng Service Role phía server,
--    key không bao giờ đi qua RLS xuống client.
-- ---------------------------------------------------------------
alter table public.org_ai_settings enable row level security;

drop policy if exists "org_ai_settings_super_admin_all" on public.org_ai_settings;
drop policy if exists "org_ai_settings_campus_admin_all" on public.org_ai_settings;

create policy "org_ai_settings_super_admin_all"
  on public.org_ai_settings for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "org_ai_settings_campus_admin_all"
  on public.org_ai_settings for all
  using (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() = 'campus_admin'
    and public.is_org_in_my_subtree(org_id)
  );
