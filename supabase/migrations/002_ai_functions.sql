-- ============================================================
-- GDTX ERP - 002_ai_functions
-- Hàm tìm kiếm ngữ nghĩa (semantic search) phục vụ RAG:
-- tìm tài liệu giảng dạy gần nhất với câu hỏi theo cosine distance.
-- ============================================================

-- Index vector cho cosine distance (ivfflat).
-- Lưu ý: ivfflat hoạt động tốt khi bảng đã có dữ liệu; với dữ liệu lớn
-- nên chạy lại `reindex` hoặc cân nhắc hnsw.
create index if not exists idx_lesson_materials_embedding
  on public.lesson_materials
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- match_lesson_materials:
--   query_embedding : embedding của câu hỏi (1536 chiều)
--   filter_class_id : chỉ tìm trong tài liệu của lớp này (multi-tenant an toàn)
--   match_count     : số kết quả tối đa (mặc định 5)
-- Trả về các tài liệu kèm độ tương đồng (similarity = 1 - cosine distance).
create or replace function public.match_lesson_materials(
  query_embedding  vector(1536),
  filter_class_id  uuid,
  match_count      int default 5
)
returns table (
  id          uuid,
  class_id    uuid,
  content     text,
  similarity  float
)
language sql
stable
as $$
  select
    lm.id,
    lm.class_id,
    lm.content,
    1 - (lm.embedding <=> query_embedding) as similarity
  from public.lesson_materials lm
  where lm.deleted_at is null
    and lm.class_id = filter_class_id
    and lm.embedding is not null
  order by lm.embedding <=> query_embedding
  limit match_count;
$$;
