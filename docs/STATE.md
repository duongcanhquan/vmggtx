# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-01 - cổng /coso/[slug] theo cơ sở (045)

## Snapshot
- Build production: SẠCH (npm run build exit 0). Deploy: Vercel + Supabase, repo `duongcanhquan/vmggtx`.
- Mô hình quản trị: super_admin = kiến trúc (tạo cơ sở, tạo admin cơ sở, phân quyền, cài đặt toàn cục
  - menu riêng SUPER_MENU); campus_admin = toàn quyền vận hành trong subtree; tối đa 3 cấp dưới 1 cơ sở.
- "Phó giám đốc" = tài khoản campus_admin gắn vào org con (không có role riêng).

## Migrations
- Đã có file: `001 → 045` + `999_performance_indexes` + `999_final_rls_patch` (999 chạy cuối).
- ⚠️ **CHƯA chạy trên DB thật: 042, 043, 044, 045 (org slugs /coso)** - user phải chạy tay
  qua Supabase SQL Editor. Code fail-safe khi RPC/cột chưa tồn tại.
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
1. Migration 042/043/044/045 chờ user chạy tay (xem trên) — **045 bắt buộc** để `/coso/[slug]` hoạt động.
2. Production Vercel: set `PARENT_SESSION_SECRET` + `PARENT_MOCK_OTP` (bắt buộc, không còn fallback).
3. Subdomain DNS per cơ sở (`ten.domain.com`) — sau path `/coso/` (D14 đã chốt path trước).
4. Backlog: OTP phụ huynh thật (SMS); attendance/payroll/warnings auto-scan (xem WORKLOG audit).
5. License: phụ huynh CHƯA bị chặn khi cơ sở hết hạn (chấp nhận được).
6. Login lỗi production: kiểm tra env Supabase + JWT hook 006; dùng `/coso/{slug}/login` sau khi có slug.

## Cổng /coso/[slug] (mới - 2026-08-01)
- Gốc `/login` = Super Admin; hub `/coso` chọn cơ sở; `/coso/{slug}` = cổng cơ sở.
- `organizations.slug` + RPC `get_public_campus_by_slug` / `list_public_campuses`.
- Wizard tạo cơ sở hiện link đầy đủ để gửi admin cơ sở.

## Tầng LICENSE (mới - 2026-08-01)
- Gói = tổ hợp module (MenuKey). 3 preset trong `src/lib/licensing/packages.ts`
  (basic/advanced/full) + custom tick tay. settings_global KHÔNG bán.
- UI: `/admin/licenses` (super only): danh sách cơ sở + sửa gói + tạm ngưng/kích hoạt
  + WIZARD 3 bước tạo cơ sở trọn gói (org + license + tài khoản campus_admin, có rollback).
- Enforcement: RPC `get_my_menu_keys` = ma trận 043 GIAO module license; middleware chặn
  hết hạn/tạm ngưng qua cookie `license_hint` (10 phút) -> `/license-expired`; sĩ số
  max_students chặn ở createUserAccount + bulkImportStudents (`src/lib/licensing/capacity.ts`).
- Không có license = full quyền (fail-open, hệ thống nội bộ/legacy).

## Quirks môi trường (đọc để khỏi vấp lại)
- Windows PowerShell: KHÔNG dùng `&&`, KHÔNG heredoc. Commit qua file `.git-commit-msg.txt`
  (message không dấu). Xem rule 00-core.
- `npm run build` ~25s, sạch. `next.config.mjs` có experimental.staleTimes.
- Demo accounts + mật khẩu test: `docs/demo-accounts.md`. Schema DB: `docs/database-schema.md`.
