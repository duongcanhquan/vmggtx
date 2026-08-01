-- ================================================================
-- 047: GỘP 3 KIỂM TRA TRUY CẬP THÀNH 1 RPC - TĂNG TỐC ĐIỀU HƯỚNG
-- Trước đây middleware gọi TUẦN TỰ 3 RPC mỗi lần chuyển trang:
--   get_my_license (044) + get_my_menu_keys (043) + get_my_module_flags (046)
-- -> 3 vòng round-trip database = chậm rõ rệt khi bấm menu.
-- get_my_access_state() trả về TẤT CẢ trong 1 lần gọi:
--   { license_ok, menu_keys, off_modules, off_features }
-- Từng phần lỗi (migration thiếu) -> giá trị an toàn (fail-open riêng phần).
-- ================================================================

create or replace function public.get_my_access_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lic   jsonb;
  v_keys  text[];
  v_flags jsonb;
  v_ok    boolean := true;
begin
  -- 1. License hiệu lực (044). Lỗi/chưa có -> coi như không license (ok).
  begin
    v_lic := get_my_license();
  exception when others then
    v_lic := null;
  end;
  if v_lic is not null then
    if v_lic->>'status' = 'suspended' then
      v_ok := false;
    end if;
    if v_ok and (v_lic->>'valid_until') is not null
       and (v_lic->>'valid_until')::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
      v_ok := false;
    end if;
  end if;

  -- 2. Ma trận menu (043 ∩ 044). Lỗi -> null (dùng ma trận mặc định).
  begin
    v_keys := get_my_menu_keys();
  exception when others then
    v_keys := null;
  end;

  -- 3. Công tắc module (046). Lỗi -> rỗng (bật hết).
  begin
    v_flags := get_my_module_flags();
  exception when others then
    v_flags := null;
  end;

  return jsonb_build_object(
    'license_ok', v_ok,
    'menu_keys', case when v_keys is null then null else to_jsonb(v_keys) end,
    'off_modules', coalesce(v_flags->'modules', '[]'::jsonb),
    'off_features', coalesce(v_flags->'features', '[]'::jsonb)
  );
end $$;

grant execute on function public.get_my_access_state() to authenticated;

comment on function public.get_my_access_state() is
  'Gộp license + menu keys + module flags trong 1 round-trip cho middleware. Từng phần fail-open riêng.';
