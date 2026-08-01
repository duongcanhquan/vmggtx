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
- **D14** Cổng theo cơ sở dùng PATH `/coso/[slug]` (không bắt buộc subdomain DNS trước).
  Mỗi campus có `organizations.slug` duy nhất; landing + 3 login
  (`/login`, `/student/login`, `/parent/login` dưới `/coso/{slug}`). Đăng nhập
  qua cổng cơ sở phải thuộc subtree campus đó. Subdomain `*.domain` làm sau.
