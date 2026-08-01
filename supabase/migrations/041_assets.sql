-- ============================================================
-- 041 - QUẢN LÝ TÀI SẢN CỐ ĐỊNH & KHẤU HAO
--
-- PHÂN BIỆT với `facilities` (migration 033):
--   facilities = danh mục phòng/thiết bị ĐỂ ĐẶT LỊCH sử dụng.
--   assets     = SỔ TÀI SẢN kế toán: nguyên giá, khấu hao đường
--                thẳng, tình trạng, vị trí (chi nhánh/phòng/lớp),
--                điều chuyển giữa các đơn vị, nhật ký đầy đủ.
--
-- Khấu hao ĐƯỜNG THẲNG (tính động trong app, không lưu cứng):
--   hao mòn/tháng = (nguyên giá - giá trị thu hồi) / số tháng SD
--   lũy kế        = min(số tháng đã dùng, số tháng SD) x mức/tháng
--   giá trị còn   = nguyên giá - lũy kế
--
-- Idempotent: chạy lại không lỗi.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) BẢNG assets - sổ tài sản
-- ---------------------------------------------------------------
create table if not exists public.assets (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid not null references public.organizations (id),
  code                text not null,
  name                text not null,
  category            text not null default 'teaching_device'
                      check (category in (
                        'furniture',        -- bàn ghế, tủ kệ
                        'it_equipment',     -- máy tính, máy in, mạng
                        'teaching_device',  -- máy chiếu, bảng, loa, thiết bị dạy học
                        'vehicle',          -- phương tiện
                        'building',         -- nhà cửa, cải tạo
                        'software',         -- phần mềm, bản quyền
                        'other'
                      )),
  serial_number       text,
  vendor              text,
  -- Vị trí cụ thể trong đơn vị: phòng học/lớp/kho... (org_id đã là chi nhánh)
  location            text,
  assigned_to         uuid references public.profiles (id),
  purchase_date       date not null,
  purchase_price      numeric(14, 2) not null check (purchase_price >= 0),
  salvage_value       numeric(14, 2) not null default 0 check (salvage_value >= 0),
  useful_life_months  integer not null check (useful_life_months > 0),
  warranty_until      date,
  status              text not null default 'in_use'
                      check (status in (
                        'in_use',       -- đang sử dụng
                        'in_storage',   -- lưu kho
                        'under_repair', -- đang sửa chữa
                        'broken',       -- hỏng
                        'liquidated',   -- đã thanh lý
                        'lost'          -- thất lạc
                      )),
  note                text,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint assets_salvage_lte_price check (salvage_value <= purchase_price)
);

-- Mã tài sản duy nhất TRONG TỪNG đơn vị (2 chi nhánh có thể trùng mã)
create unique index if not exists uq_assets_org_code
  on public.assets (org_id, code) where deleted_at is null;

create index if not exists idx_assets_org
  on public.assets (org_id, status) where deleted_at is null;

drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

comment on table public.assets is
  'Sổ tài sản cố định theo đơn vị: nguyên giá, khấu hao đường thẳng, tình trạng, vị trí. Khác facilities (đặt lịch phòng/thiết bị).';

-- ---------------------------------------------------------------
-- 2) BẢNG asset_logs - nhật ký tài sản (kiểm toán đầy đủ)
-- ---------------------------------------------------------------
create table if not exists public.asset_logs (
  id          uuid primary key default uuid_generate_v4(),
  asset_id    uuid not null references public.assets (id) on delete cascade,
  org_id      uuid not null references public.organizations (id),
  action      text not null
              check (action in (
                'created', 'updated', 'status_change', 'transfer', 'maintenance', 'deleted'
              )),
  detail      text not null default '',
  from_value  text,
  to_value    text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_asset_logs_asset
  on public.asset_logs (asset_id, created_at desc);

comment on table public.asset_logs is
  'Nhật ký tài sản: tạo/sửa/đổi trạng thái/điều chuyển/bảo trì - ai làm, lúc nào, từ đâu sang đâu.';

-- ---------------------------------------------------------------
-- 3) ROW LEVEL SECURITY
--    super_admin: toàn quyền. campus_admin/academic_staff/accountant:
--    thao tác trong subtree của mình. Vai trò khác: không truy cập.
-- ---------------------------------------------------------------
alter table public.assets enable row level security;
alter table public.asset_logs enable row level security;

drop policy if exists "assets_super_admin_all" on public.assets;
drop policy if exists "assets_staff_all"       on public.assets;
drop policy if exists "asset_logs_super_admin_all" on public.asset_logs;
drop policy if exists "asset_logs_staff_all"       on public.asset_logs;

create policy "assets_super_admin_all"
  on public.assets for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "assets_staff_all"
  on public.assets for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );

create policy "asset_logs_super_admin_all"
  on public.asset_logs for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "asset_logs_staff_all"
  on public.asset_logs for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'accountant')
    and public.is_org_in_my_subtree(org_id)
  );
