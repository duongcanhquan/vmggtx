# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-01 - commit `ddb3d70`

## Snapshot
- Build production: SẠCH (npm run build exit 0). Deploy: Vercel + Supabase, repo `duongcanhquan/vmggtx`.
- Mô hình quản trị: super_admin = kiến trúc (tạo cơ sở, tạo admin cơ sở, phân quyền, cài đặt toàn cục
  - menu riêng SUPER_MENU); campus_admin = toàn quyền vận hành trong subtree; tối đa 3 cấp dưới 1 cơ sở.
- "Phó giám đốc" = tài khoản campus_admin gắn vào org con (không có role riêng).

## Migrations
- Đã có file: `001 → 043` + `999_performance_indexes` + `999_final_rls_patch` (999 chạy cuối).
- ⚠️ **CHƯA chạy trên DB thật: 042 (overview report), 043 (menu permissions)** - user phải chạy tay
  qua Supabase SQL Editor. Code đã fail-safe khi RPC chưa tồn tại (dashboard fallback demo, menu fail-open).
- ⚠️ `scripts/apply-migration.mjs` lỗi "password authentication failed" - DATABASE_URL trong .env sai
  mật khẩu. Muốn tự động hóa phải xin user cập nhật.

## Trạng thái module (tất cả ĐÃ XONG trừ ghi chú)
- Nền tảng: org đa tầng ltree + RLS, 8 role, JWT claims, middleware (role_hint/menu_hint cookie).
- Học vụ: học viên (MaSV, import Excel), lớp (sĩ số max), điểm danh + sổ đầu bài + hành vi,
  lịch dạy 2 chiều (GV đề xuất/xin nghỉ - giáo vụ duyệt, dạy thay/dạy bù), enrollment lifecycle.
- Khảo thí: đề/mã đề, lịch thi, giám thị, khóa sổ điểm, phúc khảo/thi lại, duyệt kết quả.
- Tài chính: hóa đơn, thu tiền + biên lai in, nhắc học phí (notification + cron), công nợ tuổi nợ,
  lương (engine + dự báo ngân sách), hợp đồng.
- CRM tuyển sinh: leads, campaigns, tìm theo người tuyển sinh, báo cáo.
- LMS: bài giảng (R2 + YouTube), bài tập, quiz chấm server-side, tiến độ học, AI soạn bài + RAG tutor.
- Portals: dashboard (nhân viên), teacher, student, parent (HMAC cookie, KHÔNG Supabase session),
  b2b (enterprise_partner), admin. Login riêng: /login, /student/login, /parent/login (glassmorphism).
- Khác: tài sản + khấu hao + điều chuyển, ticketing/kanban, đặt phòng-thiết bị (chống trùng btree_gist),
  thông báo user_notifications, cảnh báo tâm lý tự động, HDSD tại /hdsd, dashboard kéo-thả
  (user_preferences + global_layout_templates), SmartTable lưu góc nhìn, phân quyền menu động
  (/admin/permissions, menuRegistry, RPC get_my_menu_keys).

## Tồn đọng / việc tiếp theo
1. **Tầng LICENSE bán account cơ sở** (ĐÃ TƯ VẤN, user quan tâm, CHƯA làm): bảng tenant_licenses
   (gói = tổ hợp menu_keys, hạn dùng, giới hạn HV), wizard super_admin tạo cơ sở trọn gói,
   middleware chặn khi hết hạn. Chờ user chốt danh sách gói. Giữ chung 1 DB (xem DECISIONS D12).
2. Migration 042/043 chờ user chạy tay (xem trên).
3. Subdomain per cơ sở (cosoA.domain.vn) - đã tư vấn, làm sau khi có license.
4. Backlog nhỏ: matrix phân quyền hiển thị cả key mà static ROUTE_RULES chặn (tick cũng không
   có tác dụng với role thấp) - chỉ gây bối rối nhẹ, chưa cần sửa.

## Quirks môi trường (đọc để khỏi vấp lại)
- Windows PowerShell: KHÔNG dùng `&&`, KHÔNG heredoc. Commit qua file `.git-commit-msg.txt`
  (message không dấu). Xem rule 00-core.
- `npm run build` ~25s, sạch. `next.config.mjs` có experimental.staleTimes.
- Demo accounts + mật khẩu test: `docs/demo-accounts.md`. Schema DB: `docs/database-schema.md`.
