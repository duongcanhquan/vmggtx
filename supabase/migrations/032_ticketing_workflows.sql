-- ============================================================
-- 032 - CỔNG DỊCH VỤ E-TICKETING + APPROVAL WORKFLOWS
-- (đặt số 032 vì 013 đã được dùng cho migration khác)
--
-- 1) ticket_categories : danh mục mẫu đơn, form_schema (jsonb)
--    định nghĩa ĐỘNG các trường cần điền -> tạo mẫu đơn mới
--    không cần sửa code.
-- 2) tickets           : đơn/yêu cầu người dùng gửi (payload jsonb)
-- 3) ticket_approvals  : luồng phê duyệt (ai duyệt, kết quả, lý do)
--
-- form_schema = mảng field: [{ "key": "from_date", "label": "Từ ngày",
--   "type": "date|text|textarea|number|select", "required": true,
--   "options": ["..."], "placeholder": "..." }]
--
-- [ĐA TẦNG] org_id + RLS subtree (get_my_role/is_org_in_my_subtree),
-- người gửi chỉ thấy đơn của CHÍNH MÌNH. Idempotent.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) DANH MỤC MẪU ĐƠN
-- ---------------------------------------------------------------
create table if not exists public.ticket_categories (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  name         text not null,
  description  text,
  -- Ai được dùng mẫu đơn này ở cổng dịch vụ
  audience     text not null default 'all'
               check (audience in ('all', 'students', 'teachers')),
  form_schema  jsonb not null default '[]'::jsonb,
  active       boolean not null default true,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_ticket_categories_org
  on public.ticket_categories (org_id) where deleted_at is null;

drop trigger if exists trg_ticket_categories_updated_at on public.ticket_categories;
create trigger trg_ticket_categories_updated_at
  before update on public.ticket_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 2) TICKETS
-- ---------------------------------------------------------------
create table if not exists public.tickets (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references public.organizations (id),
  category_id   uuid not null references public.ticket_categories (id),
  requester_id  uuid not null references public.profiles (id),
  status        text not null default 'pending'
                check (status in ('pending', 'in_progress', 'approved', 'rejected', 'resolved')),
  payload       jsonb not null default '{}'::jsonb,
  assigned_to   uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_tickets_org_status
  on public.tickets (org_id, status) where deleted_at is null;
create index if not exists idx_tickets_requester
  on public.tickets (requester_id) where deleted_at is null;

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 3) LUỒNG PHÊ DUYỆT
-- ---------------------------------------------------------------
create table if not exists public.ticket_approvals (
  id           uuid primary key default uuid_generate_v4(),
  ticket_id    uuid not null references public.tickets (id) on delete cascade,
  approver_id  uuid not null references public.profiles (id),
  status       text not null check (status in ('approved', 'rejected')),
  comments     text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ticket_approvals_ticket
  on public.ticket_approvals (ticket_id);

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table public.ticket_categories enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_approvals enable row level security;

drop policy if exists "ticket_categories_super_admin_all" on public.ticket_categories;
drop policy if exists "ticket_categories_staff_all" on public.ticket_categories;
drop policy if exists "ticket_categories_member_select" on public.ticket_categories;
drop policy if exists "tickets_super_admin_all" on public.tickets;
drop policy if exists "tickets_staff_all" on public.tickets;
drop policy if exists "tickets_requester_select" on public.tickets;
drop policy if exists "tickets_requester_insert" on public.tickets;
drop policy if exists "ticket_approvals_super_admin_all" on public.ticket_approvals;
drop policy if exists "ticket_approvals_staff_all" on public.ticket_approvals;
drop policy if exists "ticket_approvals_requester_select" on public.ticket_approvals;

-- Danh mục: staff quản trị theo subtree, mọi thành viên org xem mẫu đang bật
create policy "ticket_categories_super_admin_all"
  on public.ticket_categories for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "ticket_categories_staff_all"
  on public.ticket_categories for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

create policy "ticket_categories_member_select"
  on public.ticket_categories for select
  using (org_id = public.get_my_org_id() and active = true and deleted_at is null);

-- Tickets: staff subtree toàn quyền; người gửi tự tạo + xem đơn của mình
create policy "tickets_super_admin_all"
  on public.tickets for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "tickets_staff_all"
  on public.tickets for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

create policy "tickets_requester_select"
  on public.tickets for select
  using (requester_id = auth.uid());

create policy "tickets_requester_insert"
  on public.tickets for insert
  with check (
    requester_id = auth.uid()
    and org_id = public.get_my_org_id()
    and status = 'pending'
    and assigned_to is null
  );

-- Approvals: staff subtree ghi/đọc; người gửi ĐỌC để thấy lý do duyệt/từ chối
create policy "ticket_approvals_super_admin_all"
  on public.ticket_approvals for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "ticket_approvals_staff_all"
  on public.ticket_approvals for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and public.is_org_in_my_subtree(t.org_id)
    )
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and approver_id = auth.uid()
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and public.is_org_in_my_subtree(t.org_id)
    )
  );

create policy "ticket_approvals_requester_select"
  on public.ticket_approvals for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.requester_id = auth.uid()
    )
  );

comment on table public.ticket_categories is
  'Danh mục mẫu đơn cổng dịch vụ - form_schema (jsonb) sinh UI form động';
comment on table public.tickets is
  'Đơn/yêu cầu ngoại lệ của HS/GV - payload jsonb theo form_schema của danh mục';
comment on table public.ticket_approvals is
  'Lịch sử phê duyệt: ai duyệt/từ chối, kèm lý do';

-- ---------------------------------------------------------------
-- SEED 3 MẪU ĐƠN MẶC ĐỊNH cho mỗi cơ sở/chi nhánh (chưa có thì thêm)
-- ---------------------------------------------------------------
insert into public.ticket_categories (org_id, name, description, audience, form_schema)
select o.id, v.name, v.description, v.audience, v.form_schema::jsonb
from public.organizations o
cross join (
  values
    (
      'Xin nghỉ phép',
      'Học sinh/giáo viên xin nghỉ có phép trong khoảng thời gian cụ thể.',
      'all',
      '[{"key":"from_date","label":"Từ ngày","type":"date","required":true},
        {"key":"to_date","label":"Đến ngày","type":"date","required":true},
        {"key":"reason","label":"Lý do","type":"textarea","required":true,"placeholder":"Nêu rõ lý do nghỉ..."}]'
    ),
    (
      'Xin phúc khảo điểm',
      'Yêu cầu chấm lại bài kiểm tra khi có thắc mắc về điểm số.',
      'students',
      '[{"key":"subject","label":"Môn / Bài kiểm tra","type":"text","required":true,"placeholder":"VD: Toán - Giữa kỳ"},
        {"key":"reason","label":"Lý do phúc khảo","type":"textarea","required":true}]'
    ),
    (
      'Yêu cầu hoàn phí',
      'Đề nghị hoàn học phí (bảo lưu, thôi học, thu thừa...).',
      'students',
      '[{"key":"amount","label":"Số tiền đề nghị hoàn (VNĐ)","type":"number","required":true},
        {"key":"reason","label":"Lý do hoàn phí","type":"textarea","required":true}]'
    )
) as v(name, description, audience, form_schema)
where o.type in ('campus', 'branch')
  and o.deleted_at is null
  and not exists (
    select 1 from public.ticket_categories tc
    where tc.org_id = o.id and tc.name = v.name and tc.deleted_at is null
  );
