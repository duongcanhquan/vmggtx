# DECISIONS - Quyết định kiến trúc đã chốt (KHÔNG làm trái nếu user chưa đổi ý)

Mỗi quyết định 1-3 dòng. Thêm mới vào CUỐI danh sách với mã D tiếp theo.

- **D01** Multi-tenant CHUNG 1 database, cách ly bằng `org_id` + RLS (ltree subtree).
  KHÔNG tách database per cơ sở (đã tư vấn kỹ 2026-08-01, user đồng thuận hướng này).
- **D02** Phụ huynh KHÔNG có tài khoản Supabase - đăng nhập /parent/login bằng cookie HMAC
  `parent_session`. Middleware nhận diện qua cookie, không qua auth.getUser().
- **D03** Mã học viên: cột import bắt buộc tiêu đề chính xác `MaSV`; quy tắc sinh mã
  cấu hình per-cơ sở trong org_settings (3 rule mẫu).
- **D04** Cấu hình cơ sở để trong `org_settings.config` (JSONB) + kế thừa theo cây
  (settingsResolver), KHÔNG tạo bảng riêng cho từng nhóm cài đặt.
- **D05** AI per-tenant: key từ `org_ai_settings`, fallback env. RAG bắt buộc lọc org_id.
  Mọi lời gọi AI có try/catch + timeout + fallback "AI đang bảo trì".
- **D06** File lớn (bài giảng, bài nộp) lưu Cloudflare R2 qua presigned URL, KHÔNG lưu Supabase storage.
- **D07** Lương giáo viên CHỈ tính buổi `completed` VÀ có điểm danh. Dự báo ngân sách dùng
  buổi `scheduled` tương lai qua cùng engine.
- **D08** Phân quyền 2 tầng: ROUTE_RULES tĩnh trong middleware = trần cứng; ma trận menu động
  (migration 043) chỉ SIẾT thêm, fail-open khi RPC chưa có. Campus admin bị "cap" bởi quyền chính mình.
- **D09** Layout dashboard lưu `user_preferences` per-user, fallback `global_layout_templates`
  (is_forced = khóa kéo thả). KHÔNG lưu layout vào org_settings nữa.
- **D10** Governance: super_admin CHỈ kiến trúc (menu SUPER_MENU 5 mục, không vận hành chi tiết);
  campus_admin toàn quyền vận hành subtree. "Phó giám đốc" = campus_admin gắn org con, KHÔNG tạo role mới.
- **D11** Cây tổ chức: tối đa 3 cấp dưới 1 Cơ sở (campus→nhánh→nhánh con), chặn tầng 4 trong
  createOrganization (đếm ngược lên campus gần nhất).
- **D12** Kế hoạch thương mại: bán account theo cơ sở bằng tầng LICENSE (gói = tổ hợp menu_keys
  + hạn dùng + giới hạn HV) trên chung 1 DB; instance riêng chỉ là gói premium về sau.
  ĐÃ TRIỂN KHAI (migration 044): không license = fail-open full quyền; license áp dụng
  kế thừa xuống nhánh con; module cap được GIAO vào get_my_menu_keys.
- **D13** Commit trên Windows PowerShell: build sạch trước, message qua file .git-commit-msg.txt
  (không dấu), không dùng && / heredoc.
- **D14** Phân tách cổng theo domain path:
  - Gốc (`/login`) = landing marketing; Super Admin qua `/login/admin` (icon sách ẩn).
  - KHÔNG có hub danh sách cơ sở công khai (`/coso` redirect → `/login`).
  - Mỗi trường nhận link trực tiếp `/coso/{slug}/login` (tab Nhà trường | Gia đình).
  - HV: MaSV/email+pass; PH: email+pass qua `parent_accounts` + cookie HMAC.
  - Tương lai có thể tách 2 tab thành 2 cổng URL riêng — chưa làm.
  - Subdomain `*.domain` rewrite thẳng vào `/coso/{slug}/login` nếu bật.
- **D15** Logo thương hiệu theo `organizations.logo_url` / `logo_key` (migration 051):
  upload tại `/settings` (campus_admin+), lưu R2 (D06) hoặc data URL ≤200KB nếu chưa R2;
  phục vụ công khai qua `/api/org-logo/[orgId]`; hiển thị thống nhất cổng `/coso` + AuthShell
  + Dashboard/Portal/Teacher/Student/Parent. Nhánh không có logo thì kế thừa tổ tiên.
- **D16** Đồng bộ vận hành (QA 2026-08-02):
  - Cổng HV canonical = `/portal`; `/student` redirect. License `module_keys` CAP cả campus_admin
    (middleware + DashboardShell) khi `get_my_menu_keys` ≠ null; fail-open nếu chưa có license.
  - Redirect middleware tách `?query` khỏi pathname (tránh encode `%3F`).
  - Sai campus lúc login HV → signOut, không soft-admit vào portal.
- **D17** Hub báo cáo theo vai trò (MenuKey `reports`):
  `/reports` (campus/học vụ/KT), `/reports/academic`, `/reports/exams`,
  `/teacher/insights`, `/parent/insights`. Recharts + bento KPI; overview
  «Doanh thu đã thu» = tổng `payments` (không MOCK học phí).
- **D20** AI học vụ (`taskType: academic_assist` trên `/api/ai/copilot`):
  hỗ trợ cảnh báo sớm, sổ điểm, sổ đầu bài; nhận `extraContext` vận hành
  + RAG nhẹ; tối thiểu role `teacher` trên org. Không MOCK khi lỗi DB
  (parent/staff/teacher trả empty/`loadError`). Tạo cột điểm qua
  `createAssessment` trên sổ điểm GV.
- **D21** LMS hỗ trợ giảng dạy (054): bài giảng `draft → pending_review →
  published|rejected`; setting `require_lesson_approval` (default true);
  hàng chờ `/staff/lms-approval`; AI giáo án lưu nháp LMS; «Cho AI học»
  chỉ sau published; `is_enrolled_in_class` bắt buộc enrollment active;
  `lesson_plan`/`hr_query` gate teacher+/nội bộ.
