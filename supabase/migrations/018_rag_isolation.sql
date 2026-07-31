-- ============================================================
-- GDTX ERP - 018_rag_isolation
-- CÁCH LY DỮ LIỆU RAG TUYỆT ĐỐI GIỮA CÁC CƠ SỞ (Data Isolation):
--   1. lesson_materials có org_id (bắt buộc) + metadata (jsonb).
--   2. match_lesson_materials BẮT BUỘC nhận p_org_id - không bao
--      giờ cho phép tìm kiếm vector mà không lọc org_id.
--   3. RLS: chỉ thành viên trong cây tổ chức được đọc/ghi.
--
-- (Yêu cầu gốc đặt tên 010_rag_isolation.sql nhưng số 010 đã dùng
--  bởi 010_hr_payroll_schema.sql nên file này mang số 018.)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. NÂNG CẤP BẢNG lesson_materials
-- ---------------------------------------------------------------

-- 1a. org_id: cột cách ly tenant. Backfill từ org của lớp học.
alter table public.lesson_materials
  add column if not exists org_id uuid references public.organizations (id);

update public.lesson_materials lm
set org_id = c.org_id
from public.classes c
where lm.class_id = c.id
  and lm.org_id is null;

-- Tài liệu mồ côi (lớp đã mất) không thể xác định org -> xóa mềm
update public.lesson_materials
set deleted_at = now()
where org_id is null and deleted_at is null;

alter table public.lesson_materials
  alter column org_id set not null;

-- 1b. class_id trở thành TÙY CHỌN: tài liệu có thể thuộc "kho tri
--     thức toàn cơ sở" (org-wide) thay vì gắn với 1 lớp cụ thể.
alter table public.lesson_materials
  alter column class_id drop not null;

-- 1c. metadata (jsonb): Tác giả, Cấp học, Môn học, tên file, chunk...
alter table public.lesson_materials
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.lesson_materials.metadata is
  'Thông tin bổ sung: {file_name, author, subject, grade_level, chunk_index, total_chunks}';

create index if not exists idx_lesson_materials_org
  on public.lesson_materials (org_id);

-- ---------------------------------------------------------------
-- 2. VIẾT LẠI match_lesson_materials - BẮT BUỘC p_org_id
--    filter_class_id = NULL -> tìm TOÀN CƠ SỞ (org-wide)
--    filter_class_id có giá trị -> tìm trong 1 lớp CỦA cơ sở đó
-- ---------------------------------------------------------------
drop function if exists public.match_lesson_materials(vector, uuid, int);

create or replace function public.match_lesson_materials(
  query_embedding  vector(1536),
  p_org_id         uuid,
  filter_class_id  uuid default null,
  match_count      int default 5
)
returns table (
  id          uuid,
  class_id    uuid,
  org_id      uuid,
  content     text,
  metadata    jsonb,
  similarity  float
)
language sql
stable
as $$
  select
    lm.id,
    lm.class_id,
    lm.org_id,
    lm.content,
    lm.metadata,
    1 - (lm.embedding <=> query_embedding) as similarity
  from public.lesson_materials lm
  where lm.deleted_at is null
    and lm.embedding is not null
    -- [CÁCH LY TUYỆT ĐỐI] org_id luôn là điều kiện BẮT BUỘC
    and lm.org_id = p_org_id
    and (filter_class_id is null or lm.class_id = filter_class_id)
  order by lm.embedding <=> query_embedding
  limit match_count;
$$;

comment on function public.match_lesson_materials(vector, uuid, uuid, int) is
  'Tìm kiếm vector RAG - BẮT BUỘC lọc org_id (data isolation đa cơ sở). filter_class_id NULL = tìm toàn cơ sở.';

-- ---------------------------------------------------------------
-- 3. RLS cho lesson_materials
-- ---------------------------------------------------------------
alter table public.lesson_materials enable row level security;

drop policy if exists "lesson_materials_super_admin_all" on public.lesson_materials;
drop policy if exists "lesson_materials_subtree_select" on public.lesson_materials;
drop policy if exists "lesson_materials_staff_write" on public.lesson_materials;

-- super_admin: toàn quyền
create policy "lesson_materials_super_admin_all"
  on public.lesson_materials for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Thành viên: đọc tài liệu của org mình / org trong subtree mình quản lý
create policy "lesson_materials_subtree_select"
  on public.lesson_materials for select
  using (
    org_id = public.get_my_org_id()
    or public.is_org_in_my_subtree(org_id)
  );

-- Teacher / Staff / Campus Admin: ghi tài liệu cho org của CHÍNH MÌNH
-- (campus_admin được ghi cho cả subtree)
create policy "lesson_materials_staff_write"
  on public.lesson_materials for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'teacher')
    and (
      org_id = public.get_my_org_id()
      or (public.get_my_role() = 'campus_admin' and public.is_org_in_my_subtree(org_id))
    )
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff', 'teacher')
    and (
      org_id = public.get_my_org_id()
      or (public.get_my_role() = 'campus_admin' and public.is_org_in_my_subtree(org_id))
    )
  );
