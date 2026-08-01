-- ============================================================
-- 036: KHẢO THÍ CHUYÊN SÂU - Mã đề thi + Thi lại/Phúc khảo
-- (Yêu cầu gốc đặt tên 016 nhưng repo đã tới 035 -> đánh số 036)
--
-- 1) exam_variants           : mã đề thi (Đề 01, Đề 02...) + file đề
-- 2) re_examination_requests : đơn xin thi lại / phúc khảo của HS,
--    duyệt xong tự sinh assessment "Thi lại" (new_assessment_id)
-- 3) exam_proctors           : ĐÃ TỒN TẠI từ migration 031 (gắn theo
--    exam_schedule_id = assessment + phòng thi + giờ thi, role
--    proctor_1/proctor_2) -> KHÔNG tạo lại để tránh trùng schema.
-- ============================================================

-- ---------------------------------------------------------------
-- 1) MÃ ĐỀ THI
-- ---------------------------------------------------------------
create table if not exists public.exam_variants (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references public.organizations (id),
  assessment_id  uuid not null references public.assessments (id) on delete cascade,
  variant_code   text not null,                      -- VD: 'Đề 01', 'Đề 02'
  file_url       text,                               -- link file đề (R2/Storage)
  note           text,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  -- 1 bài kiểm tra không có 2 mã đề trùng tên
  constraint uq_exam_variant unique (assessment_id, variant_code)
);

create index if not exists idx_exam_variants_assessment
  on public.exam_variants (assessment_id);
create index if not exists idx_exam_variants_org
  on public.exam_variants (org_id);

drop trigger if exists trg_exam_variants_updated_at on public.exam_variants;
create trigger trg_exam_variants_updated_at
  before update on public.exam_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 2) ĐƠN XIN THI LẠI / PHÚC KHẢO
-- ---------------------------------------------------------------
create table if not exists public.re_examination_requests (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references public.organizations (id),
  student_id         uuid not null references public.profiles (id),
  assessment_id      uuid not null references public.assessments (id),
  grade_id           uuid references public.grades (id),   -- dòng điểm gốc (nếu có)
  reason             text not null,
  status             text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected', 'rescheduled')),
  -- Duyệt & Xếp lịch: assessment "Thi lại" được sinh tự động
  new_assessment_id  uuid references public.assessments (id),
  decided_by         uuid references public.profiles (id),
  decision_note      text,
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists idx_reexam_requests_org
  on public.re_examination_requests (org_id, status);
create index if not exists idx_reexam_requests_student
  on public.re_examination_requests (student_id);
create index if not exists idx_reexam_requests_assessment
  on public.re_examination_requests (assessment_id);

drop trigger if exists trg_reexam_requests_updated_at on public.re_examination_requests;
create trigger trg_reexam_requests_updated_at
  before update on public.re_examination_requests
  for each row execute function public.set_updated_at();

-- Chặn spam: 1 học sinh chỉ có 1 đơn PENDING cho mỗi bài kiểm tra
create unique index if not exists uq_reexam_pending
  on public.re_examination_requests (student_id, assessment_id)
  where status = 'pending' and deleted_at is null;

-- ----- RLS -----
alter table public.exam_variants enable row level security;
alter table public.re_examination_requests enable row level security;

drop policy if exists "exam_variants_super_admin_all" on public.exam_variants;
drop policy if exists "exam_variants_staff_all" on public.exam_variants;
drop policy if exists "reexam_super_admin_all" on public.re_examination_requests;
drop policy if exists "reexam_staff_all" on public.re_examination_requests;
drop policy if exists "reexam_student_select" on public.re_examination_requests;
drop policy if exists "reexam_student_insert" on public.re_examination_requests;

create policy "exam_variants_super_admin_all"
  on public.exam_variants for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Mã đề + file đề là tài liệu MẬT: chỉ Khảo thí/QTV trong subtree
create policy "exam_variants_staff_all"
  on public.exam_variants for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

create policy "reexam_super_admin_all"
  on public.re_examination_requests for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

create policy "reexam_staff_all"
  on public.re_examination_requests for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Học sinh XEM đơn của chính mình
create policy "reexam_student_select"
  on public.re_examination_requests for select
  using (student_id = auth.uid() and deleted_at is null);

-- Học sinh TỰ GỬI đơn cho chính mình (không sửa/xóa được sau khi gửi)
create policy "reexam_student_insert"
  on public.re_examination_requests for insert
  with check (student_id = auth.uid() and status = 'pending');

comment on table public.exam_variants is
  'Mã đề thi (Đề 01/02...) kèm file đề của một bài kiểm tra';
comment on table public.re_examination_requests is
  'Đơn xin thi lại/phúc khảo của học sinh - duyệt xong sinh assessment Thi lại';
