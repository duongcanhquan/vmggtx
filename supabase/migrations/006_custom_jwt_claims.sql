-- ============================================================
-- GDTX ERP - 006_custom_jwt_claims
-- Custom Access Token Hook: nhúng role + org_id của user vào
-- JWT claims (user_role, user_org_id) để Next.js Middleware
-- đọc quyền TRỰC TIẾP từ token, không cần query DB mỗi request.
--
-- SAU KHI CHẠY MIGRATION, PHẢI BẬT HOOK THỦ CÔNG:
--   Supabase Dashboard > Authentication > Hooks (Beta)
--   > Custom Access Token > chọn function
--   public.custom_access_token_hook > Enable.
-- Claims chỉ được làm mới khi token refresh (~1h) hoặc khi
-- user đăng nhập lại — đổi role xong nên yêu cầu re-login.
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims   jsonb;
  v_role   text;
  v_org_id uuid;
begin
  select p.role, p.org_id
  into v_role, v_org_id
  from public.profiles p
  where p.id = (event ->> 'user_id')::uuid
    and p.deleted_at is null;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  end if;

  if v_org_id is not null then
    claims := jsonb_set(claims, '{user_org_id}', to_jsonb(v_org_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Chỉ Auth server (supabase_auth_admin) được gọi hook này.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Auth server cần đọc profiles để lấy role/org_id.
grant select on public.profiles to supabase_auth_admin;

drop policy if exists "auth_admin_read_profiles" on public.profiles;
create policy "auth_admin_read_profiles"
  on public.profiles for select
  to supabase_auth_admin
  using (true);
