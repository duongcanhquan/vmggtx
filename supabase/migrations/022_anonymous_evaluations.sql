-- ============================================================
-- GDTX ERP - 022_anonymous_evaluations
-- HỆ THỐNG KHẢO SÁT/ĐÁNH GIÁ GIÁO VIÊN - 100% ẨN DANH + CHỐNG SPAM.
--
-- (Yêu cầu gốc đặt tên 012_anonymous_evaluations.sql nhưng số 012
--  đã dùng bởi 012_payroll_system.sql nên file này mang số 022.)
--
-- NGUYÊN TẮC THIẾT KẾ (rất quan trọng):
-- - evaluation_tokens biết "AI được đánh giá" (student_id) nhưng
--   KHÔNG chứa nội dung đánh giá.
-- - evaluation_results chứa nội dung nhưng TUYỆT ĐỐI KHÔNG CÓ
--   student_id - không tồn tại khóa nào JOIN được 2 bảng về danh tính.
-- - Chống spam: mỗi (đợt khảo sát, lớp, học sinh) đúng 1 token,
--   token dùng 1 lần (is_used). Server Action claim token nguyên tử
--   rồi mới insert kết quả bằng Service Role.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. evaluation_campaigns - Đợt khảo sát
-- ---------------------------------------------------------------
create table if not exists public.evaluation_campaigns (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references public.organizations (id),
  name        varchar(160) not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'active' check (status in ('active', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint chk_campaign_dates check (end_date >= start_date)
);

create index if not exists idx_eval_campaigns_org on public.evaluation_campaigns (org_id, status);

drop trigger if exists trg_eval_campaigns_updated_at on public.evaluation_campaigns;
create trigger trg_eval_campaigns_updated_at
  before update on public.evaluation_campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 2. evaluation_tokens - Mã dùng 1 lần (chống spam)
--    CHỈ dùng để phát mã cho học sinh, KHÔNG JOIN với bảng kết quả.
-- ---------------------------------------------------------------
create table if not exists public.evaluation_tokens (
  id           uuid primary key default uuid_generate_v4(),
  campaign_id  uuid not null references public.evaluation_campaigns (id),
  class_id     uuid not null references public.classes (id),
  student_id   uuid not null references public.profiles (id),
  -- Mã ngẫu nhiên gửi cho học sinh (6-12 ký tự, không đoán được)
  token        varchar(24) not null unique,
  is_used      boolean not null default false,
  created_at   timestamptz not null default now(),
  -- CHỐNG SPAM: mỗi học sinh / lớp / đợt = đúng 1 token
  constraint uq_eval_token_per_student unique (campaign_id, class_id, student_id)
);

create index if not exists idx_eval_tokens_student on public.evaluation_tokens (student_id);
create index if not exists idx_eval_tokens_campaign on public.evaluation_tokens (campaign_id, class_id);

-- ---------------------------------------------------------------
-- 3. evaluation_results - Kết quả khảo sát ẨN DANH
--    [TUYỆT ĐỐI KHÔNG CÓ CỘT student_id]
-- ---------------------------------------------------------------
create table if not exists public.evaluation_results (
  id                  uuid primary key default uuid_generate_v4(),
  campaign_id         uuid not null references public.evaluation_campaigns (id),
  class_id            uuid not null references public.classes (id),
  teacher_id          uuid not null references public.profiles (id),
  org_id              uuid not null references public.organizations (id),
  -- Thang điểm 1-5
  rating_teaching     int not null check (rating_teaching between 1 and 5),     -- Kỹ năng sư phạm
  rating_attitude     int not null check (rating_attitude between 1 and 5),     -- Thái độ, nhiệt tình
  rating_punctuality  int not null check (rating_punctuality between 1 and 5),  -- Đúng giờ
  feedback_text       text,                                                     -- Ý kiến tự do
  created_at          timestamptz not null default now()
);

create index if not exists idx_eval_results_teacher on public.evaluation_results (teacher_id);
create index if not exists idx_eval_results_campaign on public.evaluation_results (campaign_id, class_id);
create index if not exists idx_eval_results_org on public.evaluation_results (org_id);

-- ---------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------

-- ===== evaluation_campaigns =====
alter table public.evaluation_campaigns enable row level security;

drop policy if exists "eval_campaigns_admin_all" on public.evaluation_campaigns;
drop policy if exists "eval_campaigns_member_read" on public.evaluation_campaigns;

-- super_admin toàn quyền; campus_admin quản lý đợt khảo sát trong subtree
create policy "eval_campaigns_admin_all"
  on public.evaluation_campaigns for all
  using (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'campus_admin' and public.is_org_in_my_subtree(org_id))
  )
  with check (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'campus_admin' and public.is_org_in_my_subtree(org_id))
  );

-- Thành viên đọc đợt khảo sát của org mình (học sinh cần thấy tên đợt)
create policy "eval_campaigns_member_read"
  on public.evaluation_campaigns for select
  using (org_id = public.get_my_org_id() or public.is_org_in_my_subtree(org_id));

-- ===== evaluation_tokens =====
alter table public.evaluation_tokens enable row level security;

drop policy if exists "eval_tokens_student_own_select" on public.evaluation_tokens;
drop policy if exists "eval_tokens_admin_select" on public.evaluation_tokens;

-- Học sinh CHỈ xem token của chính họ
create policy "eval_tokens_student_own_select"
  on public.evaluation_tokens for select
  using (student_id = auth.uid());

-- Admin xem token trong subtree (để phát mã); KHÔNG có policy
-- insert/update cho user thường - phát mã & đánh dấu đã dùng đều
-- qua Service Role trong Server Action.
create policy "eval_tokens_admin_select"
  on public.evaluation_tokens for select
  using (
    public.get_my_role() = 'super_admin'
    or (
      public.get_my_role() = 'campus_admin'
      and exists (
        select 1 from public.evaluation_campaigns c
        where c.id = campaign_id and public.is_org_in_my_subtree(c.org_id)
      )
    )
  );

-- ===== evaluation_results =====
alter table public.evaluation_results enable row level security;

drop policy if exists "eval_results_admin_select" on public.evaluation_results;
drop policy if exists "eval_results_teacher_own_select" on public.evaluation_results;

-- Admin xem tất cả kết quả trong org/subtree của mình
create policy "eval_results_admin_select"
  on public.evaluation_results for select
  using (
    public.get_my_role() = 'super_admin'
    or (public.get_my_role() = 'campus_admin' and public.is_org_in_my_subtree(org_id))
  );

-- Teacher CHỈ SELECT các dòng đánh giá về CHÍNH MÌNH
create policy "eval_results_teacher_own_select"
  on public.evaluation_results for select
  using (public.get_my_role() = 'teacher' and teacher_id = auth.uid());

-- KHÔNG có policy INSERT/UPDATE/DELETE nào cho user thường:
-- - INSERT chỉ đi qua Server Action dùng Service Role (bỏ qua RLS)
--   SAU KHI verify + claim token.
-- - Không ai (kể cả teacher/admin qua client) sửa/xóa được kết quả.
