# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-02 - Ra soat hoc vu + AI academic_assist (D20)

## Snapshot
- Build production: SẠCH (npm run build exit 0). Deploy: Vercel + Supabase, repo `duongcanhquan/vmggtx`.
- Mô hình quản trị: super_admin = kiến trúc (tạo cơ sở, tạo admin cơ sở, phân quyền, cài đặt toàn cục
  - menu riêng SUPER_MENU); campus_admin = toàn quyền vận hành trong subtree; tối đa 3 cấp dưới 1 cơ sở.
- "Phó giám đốc" = tài khoản campus_admin gắn vào org con (không có role riêng).

## Migrations
- Đã có file: `001 → 051` + `999_performance_indexes` + `999_final_rls_patch` (999 chạy cuối).
- ⚠️ **CHƯA chạy trên DB thật: 049, 050, 051** — user chạy tay qua Supabase SQL Editor.
  - 049 fail-safe; 050 thiếu → đăng nhập PH báo chạy migration; 051 thiếu → upload logo báo thiếu cột.
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
- Kiêm nhiệm (049): `user_menu_permissions` + modal gán quyền tại /campus-admin/users.
- /teachers: danh bạ giảng viên + gán/gỡ lớp; trang 360 học sinh có sửa hồ sơ + MaSV.
- **Logo org (051 / D15)**: `organizations.logo_url` + `logo_key`; upload `/settings` (campus_admin);
  R2 hoặc data URL ≤200KB; `/api/org-logo/[orgId]`; OrgBrandMark trên login + shells + parent header.
  Nhánh kế thừa logo tổ tiên. RPC public trả `logo_url`.
- **Parent accounts UI**: card trên `/students/[id]` (overview) — tạo / đổi MK / soft-delete;
  cascade soft-delete `parent_accounts` khi xóa học viên.
- **Gradebook**: roster = enrollments `active`; lỗi/từ chối → `loadError`, không MOCK.
- **Cảnh báo vắng**: `max_absence_warning` qua `resolveSetting`; auto-scan sau `submitAttendance`.
- **Payroll**: chỉ đếm buổi `completed` có bản ghi attendance (đã có sẵn).
- **Pipeline học vụ (fix)**: lịch dạy GV popup điểm danh = enrollments active;
  HV `getMyGrades`/`getMySchedule`/`getStudents` không MOCK khi trống;
  cổng HV `/progress` (chuyên cần + nhận xét/thái độ); menu Giáo vụ «Bảng điểm tổng».
- **Báo cáo (D17)**: MenuKey `reports` → `/reports` (ops cockpit), `/reports/academic`,
  `/reports/exams`; GV `/teacher/insights`; PH `/parent/insights`. Recharts + bento KPI.
  Overview «Doanh thu đã thu» = tổng payments (không MOCK).
- **Học vụ cứng (D20)**: parent/staff/teacher không MOCK khi lỗi; import fail-closed;
  `scanAttendanceWarningsAdmin` bắt buộc auth; `createAssessment` trên sổ điểm;
  AI `academic_assist` (warnings / gradebook / sổ đầu bài). Payroll chỉ buổi `completed`.

## Tồn đọng / việc tiếp theo
1. Migration **049 / 050 / 051** chờ user chạy tay qua Supabase SQL Editor (**P0 ops**).
   UI parent_accounts cần **050**; thiếu 050 → card báo lỗi / login PH báo thiếu bảng.
2. Production Vercel: set `PARENT_SESSION_SECRET` (+ `PARENT_MOCK_OTP` nếu còn OTP).
3. License: phụ huynh CHƯA bị chặn khi cơ sở hết hạn (chấp nhận được).
4. Subdomain DNS per cơ sở — sau path `/coso/` (D14).
5. Tùy chọn: `R2_PUBLIC_BASE_URL` cho CDN logo.
6. P2 (sau): wizard «Mở lớp» hàng loạt; điểm hành vi cá nhân; export PDF/CSV báo cáo;
   apply AI diary thẳng vào form (hiện copy từ stream); soft-delete cột điểm trên UI.

## Cổng /coso/[slug]/login
- Gốc `/login` = landing marketing; `/login/admin` = form nhân sự (icon sách ẩn).
- `/coso` (hub danh sách) ĐÃ BỎ — redirect về `/login`. Không chọn cơ sở công khai.
- Link gửi trường: `/coso/{slug}/login` — tab Nhà trường | Gia đình (HV MaSV/email+pass · PH email+pass).
- `/coso/{slug}` vẫn redirect → login (bookmark cũ).
- `organizations.slug` + RPC public (+ logo_url sau 051).

## Tầng LICENSE
- Gói = tổ hợp module (MenuKey). UI `/admin/licenses`. Enforcement qua get_my_menu_keys + middleware.
- Không có license = full quyền (fail-open).

## Quirks môi trường
- Windows PowerShell: KHÔNG dùng `&&`, KHÔNG heredoc. Commit qua file `.git-commit-msg.txt`
  (message không dấu). Xem rule 00-core.
- Demo accounts: `docs/demo-accounts.md`. Schema: `docs/database-schema.md`.
