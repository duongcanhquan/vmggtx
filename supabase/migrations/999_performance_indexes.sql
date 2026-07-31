-- ============================================================
-- GDTX ERP - 999_performance_indexes
-- Tối ưu hiệu suất truy vấn trước khi lên Production.
--
-- LƯU Ý: phần lớn index cơ bản ĐÃ được tạo ngay trong các migration
-- 001-009 (quy tắc của dự án: tạo bảng là tạo index). File này dùng
-- `if not exists` nên an toàn chạy lại (idempotent) - các lệnh trùng
-- sẽ no-op; đồng thời BỔ SUNG các index còn thiếu và nâng cấp index
-- vector lên HNSW.
-- ============================================================

-- 1. classes: WHERE org_id / JOIN teacher --------------------------
create index if not exists idx_classes_org on public.classes (org_id);
create index if not exists idx_classes_teacher on public.classes (teacher_id);

-- 2. class_sessions: truy vấn LỊCH THEO KHOẢNG THỜI GIAN -----------
create index if not exists idx_class_sessions_class on public.class_sessions (class_id);
create index if not exists idx_class_sessions_org on public.class_sessions (org_id);
-- MỚI: index riêng cho start_time (range scan theo tuần/tháng)
create index if not exists idx_class_sessions_start_time
  on public.class_sessions (start_time);
-- MỚI: composite cho 2 truy vấn nóng nhất của hệ thống:
--   - Lịch giáo viên: WHERE teacher_id = ? AND start_time BETWEEN ...
--     (đã có idx_class_sessions_teacher_time từ 001)
--   - Lịch theo lớp:  WHERE class_id IN (...) AND start_time >= ...
create index if not exists idx_class_sessions_class_start
  on public.class_sessions (class_id, start_time);
--   - Roll-up theo chi nhánh: WHERE org_id IN (subtree) AND start_time ...
create index if not exists idx_class_sessions_org_start
  on public.class_sessions (org_id, start_time);

-- 3. attendance: upsert/tra cứu theo buổi + học viên ----------------
create index if not exists idx_attendance_session on public.attendance (session_id);
create index if not exists idx_attendance_student on public.attendance (student_id);

-- 4. profiles: lọc theo org + role (RLS gọi RẤT thường xuyên) -------
create index if not exists idx_profiles_org on public.profiles (org_id);
-- MỚI: lọc theo role (VD: lấy toàn bộ teacher/student)
create index if not exists idx_profiles_role on public.profiles (role);
-- MỚI: composite phục vụ truy vấn phổ biến nhất:
--   WHERE org_id IN (subtree) AND role = 'student'
create index if not exists idx_profiles_org_role on public.profiles (org_id, role);

-- 5. organizations: cây đa tầng -------------------------------------
-- parent_id: duyệt cây đệ quy / build tree ở client
create index if not exists idx_organizations_parent on public.organizations (parent_id);
-- GiST trên path (ltree): get_descendant_org_ids dùng toán tử <@
-- (đã có từ 001, giữ lại để idempotent)
create index if not exists idx_organizations_path_gist
  on public.organizations using gist (path);

-- 6. [QUAN TRỌNG] lesson_materials: index vector cho RAG ------------
-- 002 tạo IVFFlat (nhanh build, chất lượng recall phụ thuộc số lists).
-- Production nên dùng HNSW: recall tốt hơn, không cần "train" trước,
-- ổn định khi dữ liệu tăng dần. KHÔNG giữ cả 2 index trên cùng cột
-- (lãng phí RAM + chậm INSERT) -> drop IVFFlat rồi tạo HNSW.
drop index if exists public.idx_lesson_materials_embedding;

create index if not exists idx_lesson_materials_embedding_hnsw
  on public.lesson_materials
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 7. Cập nhật thống kê cho query planner sau khi thêm index --------
analyze public.organizations;
analyze public.profiles;
analyze public.classes;
analyze public.class_sessions;
analyze public.attendance;
analyze public.lesson_materials;
