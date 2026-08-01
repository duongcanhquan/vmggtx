# WORKLOG - Nhật ký phiên làm việc (APPEND-ONLY, mới nhất ở CUỐI)

> Template mỗi phiên (3-6 dòng, không dài hơn):
> ```
> ## YYYY-MM-DD | commit <hash> | <chủ đề ngắn>
> - Làm: <gạch đầu dòng những gì đã đổi>
> - Tồn: <vấn đề mới phát sinh / việc dở dang, nếu có>
> ```

## 2026-07 (nén lịch sử trước khi có worklog)
- Xây toàn bộ hệ thống: nền đa tầng + RLS (001-006), học vụ/tài chính/HR/CRM (007-023),
  LMS + AI/RAG + khảo thí + B2B + hành vi + dự báo lương (024-039), notifications/assets (040-041).
- Tổng kiểm toán (SYSTEM_INTERACTION_AUDIT.md), redesign login glassmorphism 3 cổng riêng,
  fix redirect loop parent, bento UI, funny loader, tối ưu tốc độ (Promise.all, cache orgScope,
  role_hint cookie, staleTimes), sample data + script.

## 2026-08-01 | 0de3f33 | Menu nhóm + ma trận phân quyền động + dashboard báo cáo
- Làm: menuRegistry + migration 043 (menu_permissions, get_my_menu_keys) + /admin/permissions;
  DashboardShell menu gập nhóm; migration 042 get_overview_report + 4 widget báo cáo
  (ops hôm nay, điểm danh tuần, enrollment donut, vắng hôm nay); getOverviewPageData gộp 1 action;
  SectionTabs (Lương&HĐ, Học viên&Import); middleware chặn theo ma trận (menu_hint cookie).
- Tồn: migration 042+043 chưa chạy trên DB thật; apply-migration.mjs sai mật khẩu DATABASE_URL.

## 2026-08-01 | ddb3d70 | Tách vai trò Super Admin vs Admin cơ sở + giới hạn 3 cấp
- Làm: SUPER_MENU 5 mục cho super_admin; thêm "Cơ sở & Chi nhánh" (menuKey organizations)
  vào menu campus_admin; chặn tạo tầng 4 dưới 1 campus trong createOrganization; cập nhật hướng dẫn.
- Chốt: phó giám đốc = campus_admin gắn org con (D10, D11). Tư vấn SaaS license (D12) - chưa code.

## 2026-08-01 | d1f72b0 | Bộ quy định + tài liệu trạng thái cho agent
- Làm: .cursor/rules (00-core, 10-server-code, 20-migrations, 30-ui) + docs/STATE.md,
  ARCHITECTURE.md, DECISIONS.md, WORKLOG.md. Định nghĩa session protocol đọc/ghi STATE.

## 2026-08-01 | (commit kế tiếp) | Tầng LICENSE - bán account cơ sở theo module
- Làm: migration 044 (tenant_licenses + get_my_license + get_my_menu_keys giao license);
  packages.ts (3 gói preset + custom); /admin/licenses (danh sách, sửa gói, tạm ngưng,
  wizard 3 bước tạo cơ sở trọn gói có rollback); middleware chặn hết hạn (license_hint)
  + trang /license-expired; capacity.ts chặn max_students ở tạo account + import.
- Tồn: migration 044 chưa chạy DB thật; parent chưa bị chặn license (chấp nhận).
