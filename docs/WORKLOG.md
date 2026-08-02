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

## 2026-08-01 | 6132838 | Tầng LICENSE - bán account cơ sở theo module
- Làm: migration 044 (tenant_licenses + get_my_license + get_my_menu_keys giao license);
  packages.ts (3 gói preset + custom); /admin/licenses + wizard 3 bước; middleware chặn
  hết hạn + /license-expired; capacity.ts chặn max_students.
- Tồn: migration 044 chưa chạy DB thật; parent chưa bị chặn license (chấp nhận).

## 2026-08-01 | 71769a2 | Audit tự chữa - overview, parent OTP, copy ngắn
- Làm: middleware cho phép `/`; home super/campus → `/`; Parent OTP cố định;
  createAnnouncement + is_authorized; xóa ComingSoon; rút gọn copy.
- Tồn: OTP SMS thật; migration 042-044 chờ chạy.

## 2026-08-01 | f229439 | Rut gon 9 doan huong dan dai portal
- Làm: budget, assessments, schedule-management, requests, grades, LmsManager.

## 2026-08-01 | (commit kế tiếp) | Vá bug audit logic license/org
- Làm: bỏ cache menu_hint (chống giả mạo); license_hint chỉ cache blocked;
  redirect mang cookie; parent area exact /dashboard; đếm HV phân trang;
  wizard validate từng bước; cấm campus lồng / campus_admin tạo campus;
  badge hạn theo giờ VN; capacity lọc deleted_at.
- BUG1 redirect loop `/` đã vá từ 71769a2 (subagent đọc code cũ).

## 2026-08-01 | 2c4dde8 | Fix hiểu lầm "không đổi tên được cơ sở mình"
- Nguyên nhân: RLS cho campus_admin THẤY cả HQ/Cụm cấp trên (để vẽ cây) nhưng UI
  hiện nút sửa/xóa trên mọi node → bấm node cấp trên bị "TỪ CHỐI ngoài phạm vi".
  Đổi tên node CÓ badge "Cơ sở của bạn" hoạt động đúng (đã test session admin.cs1 thật).
- Làm: getOrgManagementData trả manageableIds (subtree); UI chỉ hiện nút thao tác
  trong phạm vi, cấp trên gắn badge "Cấp trên · chỉ xem"; select cha khi tạo mới lọc theo phạm vi.

## 2026-08-01 | (commit kế tiếp) | Rebrand EDU SYSTEM + UserMenu + login style mới
- Làm: đổi brand "GDTX ERP" → "EDU SYSTEM" toàn hệ thống (shell, metadata, hdsd, biên lai);
  UserMenu mới (đổi mật khẩu qua auth.updateUser + đăng xuất xóa cookie hint) gắn vào
  DashboardShell, PortalShell, student-portal layout; AuthShell redesign theo mẫu codingstella
  (kính trong suốt viền trắng 2px bo 20px, AuthField gạch chân + label nổi + icon phải,
  nút navy #162938, hàng remember/forgot) áp cho cả 3 cổng login.
- Lưu ý: "Ghi nhớ đăng nhập" chỉ là UI (session Supabase vốn persist); parent portal
  không có UserMenu (không dùng Supabase Auth, đã có nút thoát riêng).

## 2026-08-01 | 3bc1bad + (commit kế tiếp) | Full-width + siết bố cục gọn
- Làm: bỏ max-w shell (Dashboard/Portal/student/teacher); vá brand teacher+hdsd;
  licenses bỏ padding kép; staff header slot thừa; tutor ẩn UUID; chuẩn hóa
  7 header slate → token; 6 empty state py-16 → p-12 token; hero admin gọn hơn.

## 2026-08-01 | (commit kế tiếp) | Cổng path /coso/[slug] theo cơ sở
- Làm: migration 045 (slug + RPC get_public_campus_by_slug); landing /coso/{slug};
  3 login staff/student/parent gắn campus + chặn ngoài subtree; UI org hiện badge link;
  wizard license tự sinh slug; D14 chốt path trước subdomain.
- Tồn: user chạy 045 trên DB thật; chưa làm DNS subdomain.

## 2026-08-01 | (commit kế tiếp) | Tach Super Admin /login vs hub /coso
- Làm: /login chi cho super_admin; /coso danh sach co so; wizard hien link day du;
  list_public_campuses; license table hien /coso/{slug}.

## 2026-08-01 | (commit kế tiếp) | Fix khong dang nhap duoc /login
- Nguyen nhan: ban preview chan cung chi super_admin → campus_admin bi da ra;
  role null (JWT hook tat) cung bi chan.
- Fix: bo chan cung; fallback resolveRoleServerSide; nhan su van login /login.

## 2026-08-01 | (commit ke tiep) | Fix login race + huong dan TK demo
- Nguyen nhan chinh: sau signIn goi server action doc cookie → chua kip →
  signOut xoa phien (Super Admin cung die).
- Fix: resolveRoleByUserId / assertUserInCampus(userId) qua Admin; khong signOut
  khi loi role; LoginGuide tren /login+/coso; seed gan slug cau-giay…

## 2026-08-02 | landing /login + /login/admin
- /login thanh landing motion (hero full-bleed, marquee, da tang, bento 8 tinh nang, AI/LMS).
- Icon sach mo goc trai duoi (hover gan moi hien) ? /login/admin (StaffLoginForm superadmin).
- Anh: public/landing/{hero,network,ai-lms}.png; CSS lp-* + IntersectionObserver.

## 2026-08-02 | landing da chuong + anh nguoi
- /login hub: hero hoc sinh, strip thay/co-HS-PH, 5 the chuong.
- /gioi-thieu/{linh-hoat,dao-tao,con-nguoi,hoc-tap-ai,van-hanh}: noi dung khach hang, motion reveal/clip/stagger.
- Bo noi dung superadmin khoi marketing; giu icon sach an -> /login/admin.

## 2026-08-02 | landing storytelling it anh
- Hub: giu anh hero; bo strip 3 anh + the chuong anh; them EDU_JOURNEY 6 buoc + tech strip + role cards.
- Chapter: hero/sticky gradient + circuit/scan, chu to hon; khong lap anh stock.
- CSS: lp-journey-line, lp-mark, lp-big-num, lp-grid-tech, lp-circuit, lp-scan.

## 2026-08-02 | knowledge river + diem nhan
- KnowledgeRiver (header + rail 2 ben) chay moi trang marketing.
- Feature highlights (3 diem nhan/nhom); chapter bullet 2 dau spotlight.
- Anh chi con hero hub; push de production cap nhat.

## 2026-08-02 | copy marketing don gian
- Bo jargon (org_id, RAG, CRM, LMS, module...); viet lai hub + 5 chuong bang tieng Viet ro.
- Vi du: tech strip -> "Don gian voi nha truong � phuc tap de phia sau".

## 2026-08-02 | coso login thang + family password
- /coso va /coso/[slug] -> thang /login (bo man chon).
- AuthField: label tren, input vua; 2 tab Nha truong | Gia dinh + HV/PH.
- HV: MaSV/email+pass; PH: email+pass (050 parent_accounts). Can chay 050 tren DB.
