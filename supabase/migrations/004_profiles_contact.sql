-- ============================================================
-- GDTX ERP - 004_profiles_contact
-- Bổ sung thông tin liên hệ cho profiles (phục vụ Import học sinh
-- và dò trùng lặp toàn hệ thống theo email/số điện thoại).
-- ============================================================

alter table public.profiles
  add column if not exists phone text,
  add column if not exists address text;

create index if not exists idx_profiles_phone on public.profiles (phone);
