# WORKLOG - Nh?t k? phi?n l?m vi?c (APPEND-ONLY, m?i nh?t ? CU?I)

> Template m?i phi?n (3-6 d?ng, kh?ng d?i h?n):
> ```
> ## YYYY-MM-DD | commit <hash> | <ch? ?? ng?n>
> - L?m: <g?ch ??u d?ng nh?ng g? ?? ??i>
> - T?n: <v?n ?? m?i ph?t sinh / vi?c d? dang, n?u c?>
> ```

## 2026-07 (n?n l?ch s? tr??c khi c? worklog)
- X?y to?n b? h? th?ng: n?n ?a t?ng + RLS (001-006), h?c v?/t?i ch?nh/HR/CRM (007-023),
  LMS + AI/RAG + kh?o th? + B2B + h?nh vi + d? b?o l??ng (024-039), notifications/assets (040-041).
- T?ng ki?m to?n (SYSTEM_INTERACTION_AUDIT.md), redesign login glassmorphism 3 c?ng ri?ng,
  fix redirect loop parent, bento UI, funny loader, t?i ?u t?c ?? (Promise.all, cache orgScope,
  role_hint cookie, staleTimes), sample data + script.

## 2026-08-01 | 0de3f33 | Menu nh?m + ma tr?n ph?n quy?n ??ng + dashboard b?o c?o
- L?m: menuRegistry + migration 043 (menu_permissions, get_my_menu_keys) + /admin/permissions;
  DashboardShell menu g?p nh?m; migration 042 get_overview_report + 4 widget b?o c?o
  (ops h?m nay, ?i?m danh tu?n, enrollment donut, v?ng h?m nay); getOverviewPageData g?p 1 action;
  SectionTabs (L??ng&H?, H?c vi?n&Import); middleware ch?n theo ma tr?n (menu_hint cookie).
- T?n: migration 042+043 ch?a ch?y tr?n DB th?t; apply-migration.mjs sai m?t kh?u DATABASE_URL.

## 2026-08-01 | ddb3d70 | T?ch vai tr? Super Admin vs Admin c? s? + gi?i h?n 3 c?p
- L?m: SUPER_MENU 5 m?c cho super_admin; th?m "C? s? & Chi nh?nh" (menuKey organizations)
  v?o menu campus_admin; ch?n t?o t?ng 4 d??i 1 campus trong createOrganization; c?p nh?t h??ng d?n.
- Ch?t: ph? gi?m ??c = campus_admin g?n org con (D10, D11). T? v?n SaaS license (D12) - ch?a code.

## 2026-08-01 | d1f72b0 | B? quy ??nh + t?i li?u tr?ng th?i cho agent
- L?m: .cursor/rules (00-core, 10-server-code, 20-migrations, 30-ui) + docs/STATE.md,
  ARCHITECTURE.md, DECISIONS.md, WORKLOG.md. ??nh ngh?a session protocol ??c/ghi STATE.

## 2026-08-01 | 6132838 | T?ng LICENSE - b?n account c? s? theo module
- L?m: migration 044 (tenant_licenses + get_my_license + get_my_menu_keys giao license);
  packages.ts (3 g?i preset + custom); /admin/licenses + wizard 3 b??c; middleware ch?n
  h?t h?n + /license-expired; capacity.ts ch?n max_students.
- T?n: migration 044 ch?a ch?y DB th?t; parent ch?a b? ch?n license (ch?p nh?n).

## 2026-08-01 | 71769a2 | Audit t? ch?a - overview, parent OTP, copy ng?n
- L?m: middleware cho ph?p `/`; home super/campus ? `/`; Parent OTP c? ??nh;
  createAnnouncement + is_authorized; x?a ComingSoon; r?t g?n copy.
- T?n: OTP SMS th?t; migration 042-044 ch? ch?y.

## 2026-08-01 | f229439 | Rut gon 9 doan huong dan dai portal
- L?m: budget, assessments, schedule-management, requests, grades, LmsManager.

## 2026-08-01 | (commit k? ti?p) | V? bug audit logic license/org
- L?m: b? cache menu_hint (ch?ng gi? m?o); license_hint ch? cache blocked;
  redirect mang cookie; parent area exact /dashboard; ??m HV ph?n trang;
  wizard validate t?ng b??c; c?m campus l?ng / campus_admin t?o campus;
  badge h?n theo gi? VN; capacity l?c deleted_at.
- BUG1 redirect loop `/` ?? v? t? 71769a2 (subagent ??c code c?).

## 2026-08-01 | 2c4dde8 | Fix hi?u l?m "kh?ng ??i t?n ???c c? s? m?nh"
- Nguy?n nh?n: RLS cho campus_admin TH?Y c? HQ/C?m c?p tr?n (?? v? c?y) nh?ng UI
  hi?n n?t s?a/x?a tr?n m?i node ? b?m node c?p tr?n b? "T? CH?I ngo?i ph?m vi".
  ??i t?n node C? badge "C? s? c?a b?n" ho?t ??ng ??ng (?? test session admin.cs1 th?t).
- L?m: getOrgManagementData tr? manageableIds (subtree); UI ch? hi?n n?t thao t?c
  trong ph?m vi, c?p tr?n g?n badge "C?p tr?n ? ch? xem"; select cha khi t?o m?i l?c theo ph?m vi.

## 2026-08-01 | (commit k? ti?p) | Rebrand EDU SYSTEM + UserMenu + login style m?i
- L?m: ??i brand "GDTX ERP" ? "EDU SYSTEM" to?n h? th?ng (shell, metadata, hdsd, bi?n lai);
  UserMenu m?i (??i m?t kh?u qua auth.updateUser + ??ng xu?t x?a cookie hint) g?n v?o
  DashboardShell, PortalShell, student-portal layout; AuthShell redesign theo m?u codingstella
  (k?nh trong su?t vi?n tr?ng 2px bo 20px, AuthField g?ch ch?n + label n?i + icon ph?i,
  n?t navy #162938, h?ng remember/forgot) ?p cho c? 3 c?ng login.
- L?u ?: "Ghi nh? ??ng nh?p" ch? l? UI (session Supabase v?n persist); parent portal
  kh?ng c? UserMenu (kh?ng d?ng Supabase Auth, ?? c? n?t tho?t ri?ng).

## 2026-08-01 | 3bc1bad + (commit k? ti?p) | Full-width + si?t b? c?c g?n
- L?m: b? max-w shell (Dashboard/Portal/student/teacher); v? brand teacher+hdsd;
  licenses b? padding k?p; staff header slot th?a; tutor ?n UUID; chu?n h?a
  7 header slate ? token; 6 empty state py-16 ? p-12 token; hero admin g?n h?n.

## 2026-08-01 | (commit k? ti?p) | C?ng path /coso/[slug] theo c? s?
- L?m: migration 045 (slug + RPC get_public_campus_by_slug); landing /coso/{slug};
  3 login staff/student/parent g?n campus + ch?n ngo?i subtree; UI org hi?n badge link;
  wizard license t? sinh slug; D14 ch?t path tr??c subdomain.
- T?n: user ch?y 045 tr?n DB th?t; ch?a l?m DNS subdomain.

## 2026-08-01 | (commit k? ti?p) | Tach Super Admin /login vs hub /coso
- L?m: /login chi cho super_admin; /coso danh sach co so; wizard hien link day du;
  list_public_campuses; license table hien /coso/{slug}.

## 2026-08-01 | (commit k? ti?p) | Fix khong dang nhap duoc /login
- Nguyen nhan: ban preview chan cung chi super_admin ? campus_admin bi da ra;
  role null (JWT hook tat) cung bi chan.
- Fix: bo chan cung; fallback resolveRoleServerSide; nhan su van login /login.

## 2026-08-01 | (commit ke tiep) | Fix login race + huong dan TK demo
- Nguyen nhan chinh: sau signIn goi server action doc cookie ? chua kip ?
  signOut xoa phien (Super Admin cung die).
- Fix: resolveRoleByUserId / assertUserInCampus(userId) qua Admin; khong signOut
  khi loi role; LoginGuide tren /login+/coso; seed gan slug cau-giay?

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
- Vi du: tech strip -> "Don gian voi nha truong ? phuc tap de phia sau".

## 2026-08-02 | coso login thang + family password
- /coso va /coso/[slug] -> thang /login (bo man chon).
- AuthField: label tren, input vua; 2 tab Nha truong | Gia dinh + HV/PH.
- HV: MaSV/email+pass; PH: email+pass (050 parent_accounts). Can chay 050 tren DB.

## 2026-08-02 | logo thuong hieu theo org (051)
- Migration 051: organizations.logo_url/logo_key + RPC public tra logo.
- Upload /settings (campus_admin), R2 hoac data URL; /api/org-logo/[orgId].
- OrgBrandMark: login /coso, DashboardShell, PortalShell, teacher/student, parent header.
- Can chay 051 tren Supabase SQL Editor.

## 2026-08-02 | bo hub /coso danh sach
- /coso redirect /login; khong con trang chon co so cong khai.
- Landing CTA khong con "Chon co so"; admin copy link /coso/{slug}/login.
- Login giu 2 tab Nha truong | Gia dinh (tuong lai co the tach).

## 2026-08-02 | QA multi-agent + fix dong bo (D16)
- 4 agent: auth, org/license, portals, UI ? tong hop P0/P1.
- Fix: middleware ?query; license cap campus_admin; HV home /portal;
  signOut khi sai campus; capacity createStudent+CRM; teachers catalog;
  OrgTreeSelector userOrgId; SUPER_MENU settings_global; parent login_portal.
- Build exit 0. Con: chay 049/050/051 tren DB; backlog gradebook/parent admin.

## 2026-08-02 | parent UI + gradebook + absence warning
- ParentAccountsCard tren students/[id]; parent-actions (admin hash).
- Gradebook roster enrollments active; bo MOCK, tra loadError.
- scanAttendanceWarningsAdmin + max_absence_warning; auto sau diem danh.
- deleteStudent cascade soft-delete parent_accounts; getParentStudent loi -> null.
- Payroll da siet attendance (fetchAttendedSessionIds). Build exit 0.

## 2026-08-02 | fix pipeline hoc vu P0/P1
- teacher/schedule getSessionStudents: enrollments active, bo MOCK.
- getMyGrades/getMySchedule/getStudents: empty that, khong diem/lich gia.
- Cong HV /progress: chuyen can + nhan xet/thai do; middleware + nav.
- Menu Giao vu: Bang diem tong -> /staff/transcripts. Build exit 0.

## 2026-08-02 | hub bao cao theo role (D17)
- MenuKey reports + /reports cockpit + academic + exams (Recharts bento).
- /teacher/insights, /parent/insights; ReportKpiTile + ReportCharts.
- Overview doanh thu = payments that; moduleCatalog reports. Build exit 0.

## 2026-08-02 | ra soat hoc vu + AI academic_assist (D20)
- Bo MOCK catch parent portal; import fail-closed khi mat DB; auth scan canh bao.
- createAssessment + UI so diem; softDeleteAssessment; payroll completed.
- Copilot taskType academic_assist + AcademicAiAssist (warnings/grades/diary).
- Enrollment active + deleted_at; bo banner demo staff/teacher/attendance.

## 2026-08-02 | fix bug hoc vu sau D20
- Parent MOCK chi dev; production demo cookie -> empty/null.
- softDeleteAssessment cascade soft-delete grades; loc assessments.deleted_at.
- scanAttendanceWarningsAdmin: academic_staff HOAC GV sessionId.
- loadError UI staff/classes + teacher/schedule; tutor enrollment active.
