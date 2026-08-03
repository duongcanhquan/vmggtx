# DECISIONS - Quy?t ??nh ki?n tr?c ?? ch?t (KH?NG l?m tr?i n?u user ch?a ??i ?)

M?i quy?t ??nh 1-3 d?ng. Th?m m?i v?o CU?I danh s?ch v?i m? D ti?p theo.

- **D01** Multi-tenant CHUNG 1 database, c?ch ly b?ng `org_id` + RLS (ltree subtree).
  KH?NG t?ch database per c? s? (?? t? v?n k? 2026-08-01, user ??ng thu?n h??ng n?y).
- **D02** Ph? huynh KH?NG c? t?i kho?n Supabase - ??ng nh?p /parent/login b?ng cookie HMAC
  `parent_session`. Middleware nh?n di?n qua cookie, kh?ng qua auth.getUser().
- **D03** M? h?c vi?n: c?t import b?t bu?c ti?u ?? ch?nh x?c `MaSV`; quy t?c sinh m?
  c?u h?nh per-c? s? trong org_settings (3 rule m?u).
- **D04** C?u h?nh c? s? ?? trong `org_settings.config` (JSONB) + k? th?a theo c?y
  (settingsResolver), KH?NG t?o b?ng ri?ng cho t?ng nh?m c?i ??t.
- **D05** AI per-tenant: key t? `org_ai_settings`, fallback env. RAG b?t bu?c l?c org_id.
  M?i l?i g?i AI c? try/catch + timeout + fallback "AI ?ang b?o tr?".
- **D06** File l?n (b?i gi?ng, b?i n?p) l?u Cloudflare R2 qua presigned URL, KH?NG l?u Supabase storage.
- **D07** L??ng gi?o vi?n CH? t?nh bu?i `completed` V? c? ?i?m danh. D? b?o ng?n s?ch d?ng
  bu?i `scheduled` t??ng lai qua c?ng engine.
- **D08** Ph?n quy?n 2 t?ng: ROUTE_RULES t?nh trong middleware = tr?n c?ng; ma tr?n menu ??ng
  (migration 043) ch? SI?T th?m, fail-open khi RPC ch?a c?. Campus admin b? "cap" b?i quy?n ch?nh m?nh.
- **D09** Layout dashboard l?u `user_preferences` per-user, fallback `global_layout_templates`
  (is_forced = kh?a k?o th?). KH?NG l?u layout v?o org_settings n?a.
- **D10** Governance: super_admin CH? ki?n tr?c (menu SUPER_MENU 5 m?c, kh?ng v?n h?nh chi ti?t);
  campus_admin to?n quy?n v?n h?nh subtree. "Ph? gi?m ??c" = campus_admin g?n org con, KH?NG t?o role m?i.
- **D11** C?y t? ch?c: t?i ?a 3 c?p d??i 1 C? s? (campus?nh?nh?nh?nh con), ch?n t?ng 4 trong
  createOrganization (??m ng??c l?n campus g?n nh?t).
- **D12** K? ho?ch th??ng m?i: b?n account theo c? s? b?ng t?ng LICENSE (g?i = t? h?p menu_keys
  + h?n d?ng + gi?i h?n HV) tr?n chung 1 DB; instance ri?ng ch? l? g?i premium v? sau.
  ?? TRI?N KHAI (migration 044): kh?ng license = fail-open full quy?n; license ?p d?ng
  k? th?a xu?ng nh?nh con; module cap ???c GIAO v?o get_my_menu_keys.
- **D13** Commit tr?n Windows PowerShell: build s?ch tr??c, message qua file .git-commit-msg.txt
  (kh?ng d?u), kh?ng d?ng && / heredoc.
- **D14** Phân tách cổng theo domain path:
  - Gốc (`/login`) = landing marketing; Super Admin qua `/login/admin`
    (bấm góc trái dưới → hiện icon sách → vào cổng).
  - KHÔNG có hub danh sách cơ sở công khai (`/coso` redirect về `/login`).
  - Mỗi trường nhận link trực tiếp `/{slug}/login` (tab Nhà trường | Gia đình).
    URL cũ `/coso/{slug}/…` redirect 307 sang URL mới.
  - Đăng xuất / hết phiên: cookie `login_portal` → quay về ĐÚNG `/{slug}/login`
    (không về landing). Cookie `/coso/…` cũ được chuẩn hóa.
  - HV: MaSV/email+pass; PH: email+pass qua `parent_accounts` + cookie HMAC.
  - Subdomain `*.domain` rewrite thẳng vào `/{slug}/login` nếu bật.
- **D15** Logo th??ng hi?u theo `organizations.logo_url` / `logo_key` (migration 051):
  upload t?i `/settings` (campus_admin+), l?u R2 (D06) ho?c data URL ?200KB n?u ch?a R2;
  ph?c v? c?ng khai qua `/api/org-logo/[orgId]`; hi?n th? th?ng nh?t c?ng `/coso` + AuthShell
  + Dashboard/Portal/Teacher/Student/Parent. Nh?nh kh?ng c? logo th? k? th?a t? ti?n.
- **D16** ??ng b? v?n h?nh (QA 2026-08-02):
  - C?ng HV canonical = `/portal`; `/student` redirect. License `module_keys` CAP c? campus_admin
    (middleware + DashboardShell) khi `get_my_menu_keys` ? null; fail-open n?u ch?a c? license.
  - Redirect middleware t?ch `?query` kh?i pathname (tr?nh encode `%3F`).
  - Sai campus l?c login HV ? signOut, kh?ng soft-admit v?o portal.
- **D17** Hub b?o c?o theo vai tr? (MenuKey `reports`):
  `/reports` (campus/h?c v?/KT), `/reports/academic`, `/reports/exams`,
  `/teacher/insights`, `/parent/insights`. Recharts + bento KPI; overview
  ?Doanh thu ?? thu? = t?ng `payments` (kh?ng MOCK h?c ph?).
- **D18** CRM tuy?n sinh chuy?n nghi?p (migration 052): pipeline gi? 5 tr?ng th?i
  (`new ? contacted ? test_scheduled ? enrolled | lost`); lead c? ngu?n/?? n?ng/
  follow-up/h?n/lost_reason; ch?ng tr?ng S?T live per org; nh?t k? ch?m s?c b?t bu?c
  qua UI; m?t lead b?t bu?c l? do; convert ? student qua modal (kh?ng k?o th?ng);
  KH?NG tr? MOCK khi DB tr?ng ? tr? r?ng + l?i.
- **D19** CRM AI + h? s? ??y ?? (migration 053): c?u h?nh module trong `org_settings`
  (`crm_ai_*`, b?t bu?c PH/CCCD/ng?nh ngh?); AI qua `/api/ai/copilot` taskType
  `crm_assist` + RAG `match_lesson_materials` (?u ti?n metadata admissions); h? s?
  lead/HV g?m CCCD, PH, s? th?ch, ng?nh ngh?; entity custom field `lead`; convert
  copy sang `profiles`.

- **D20** Man hinh van hanh hoc vu trong DashboardShell (vd. Bang diem tong) KHONG dat duoi `/staff/*` ? `/staff` dung PortalShell rieng, se doi menu. Bang diem tong = `/academic/transcripts`; `/staff/transcripts` redirect.

- **D21** Xep lich TKB: man hinh chinh `/academic/schedule` trong DashboardShell (khong dat create session chi trong `/staff/*`). Menu `Lich cua toi` = xem; `Xep lich / TKB` = giao vu phan cong. Lich GV gom ca `substitute_teacher_id`.

- **D22** Canh bao hoc vu van hanh day du (055): severity early|danger theo nguong org_settings (absence_early_warning / max_absence_warning / gpa_*); status new -> notified -> in_progress -> resolved + handler_notes; AI goi y tuy chon.

- **D23** Chuc danh + mau quyen (056): giu role ky thuat (cong/RLS D08/D10); `job_titles` per org = mau `menu_keys`; gan `profiles.job_title_id`; quyen hieu luc = title ? `user_menu_permissions` (kiem nhiem van chinh lech tung nguoi). Khong tao role moi kieu "Pho GD".

- **D24** TKB thong minh theo tang: (1) `org_holidays` + skip/block; (2) luoi tuan keo-tha + xung dot do; (3) `class_schedule_plans` + greedy auto; (4) toi uu nang cao (load GV lien tuyen, facility_id, HV clash) = sau. Man chinh van `/academic/schedule` (D21).

- **D25** Phan cong cong viec noi bo (059): bang `work_tasks` + `work_task_assignees` ? tach biet e-ticket/don GV. UI `/academic/tasks` (quan ly) + `/teacher/tasks` (viec duoc giao). Chi ADD, khong doi schema cu.

- **D26** Gap audit P2?P5 (ADD-only): P2 lich thi read-only cong GV/HV + In/PDF bang diem (HTML print, khong doi API diem); P3 `class_sessions.facility_id` nullable (060) giu `room`; P4 ADD COLUMN curriculum tren `subjects` (061) + `/academic/subjects`; P5 bang moi `tuition_rules` (062) sinh draft `invoices` pending ? khong doi cot invoices cu.

- **D27** Lop hai tang (migration A): classes = hoc phan; ADD class_groups + group_id + class_teachers + 	eacher_subjects/	eaching_major. Rubric LMS split-screen = phase sau (spec 2026-08-02-class-groups-lms-rubric).

- **D27b** Rubric LMS (065): 1 rubric/assignment; draft trong lms_submission_grades; final dong bo lms_submissions.score/feedback. Autosave localStorage + debounce server.

- **D28** HR nhan su: /campus-admin/users loai student; phep nam theo org; ngay cong hybrid; luong VP theo ngay cong / GV theo tiet+diem danh; tach teacher_requests. Spec 2026-08-02-hr-personnel-leave.

- **D29** Danh gia giao vien = tong hop khao sat an danh tu hoc sinh (migration 022). Mo dot (= ky) tu dong phat phieu cho moi lop co GV + HV ghi danh; moi HV/lop/dot = 1 lan; bao cao loc theo dot + ty le hoan thanh. Dong dot = khong nop them.

- **D30** To chuc nhan su (UX): 1 menu «To chuc nhan su» gom tab Tai khoan & Nhan vien + Chuc danh (route cu giu). campus_admin = setup/phan quyen cao nhat trong co so. Chuc danh = mau menu theo ten co so; role ky thuat (cong/RLS) giu; nganh/mon GV tai Ho so Giang vien (D23).

- **D31** can_view_financials: campus_admin + super_admin LUON xem luong/don gia (071 + server unmask). Role khac (vd ke toan) bat tay tai To chuc nhan su.
- **D32** Ho so NS chuyen nghiep (072): /hr/personnel (CCCD/DOB/dia chi + R2); HD probation_end_date; cron hr-reminders; menu hr_personnel. Truong phong NS = chuc danh (khong role moi). Admin khoa hr_sensitive_locked.

- **D33** Quy trinh Dao tao UX: mon → lop hanh chinh (cohort) → hoc phan (section). Them HV cohort bat buoc search/filter/multi-select; addStudents sync enrollments tat ca section cua group; ghep HV vao 1 hoc phan (enrollStudentsToSection). Menu + AcademicFlowTabs; /classes new = doc lap / ghep.

- **D34** Hanh chinh & CSVC: menu rieng (dat phong/TB, dat xe, danh muc, so tai san). Tai dung facilities + facility_bookings (033); ADD type vehicle (073). Dashboard /facilities + /facilities/vehicles; danh muc van /academic/rooms. Portal staff/teacher facilities giu nguyen.

- **D35** Menu van hanh: hien du route da phat trien tren DashboardShell (khong chi hub /staff/classes); mac dinh mo het nhom.

- **D36** Tach cong: Super Admin chi /login/admin + /admin/* (middleware isSuperAdminAllowedPath). Login slug/HV/PH tu choi super; sai co so staff signOut. enroll/cohort assertStudentsInScope. Parent area khong nhan Supabase session staff.

- **D37** Hardening: thanh toan atomic (074); CSVC pending→duyet; bo role_hint; chan enroll/CRM cheo org; khong tra MOCK o production khi DB loi; TKB chan trung lich hoc vien.

- **D38** Super Admin phan bo API AI theo don vi (/admin/ai, org_ai_settings). Trung tam Module: hien howItWorks + nhan Trong goi/Ngoai goi + huong dan cap quyen 2 buoc (license vs cong tac).

- **D39** Khao thi la module rieng (MenuKey exams): tach khoi van hanh giao vu/TKB. Cong bo diem (class_results.is_published), phat de, lo trinh HV (075). License advanced/full gom exams; backfill tu staff_ops.

- **D40** Super Admin UX: Goi dich vu gon; Cai dat chung gom API theo don vi; Admin Don vi CRUD hien ro tren cay + ho so (#admins).

- **D41** Cong bo diem: sau 075, HV/PH chi thay diem khi class_results.is_published=true (thieu dong = chua cong bo). Thieu cot = legacy fail-open. Load path bao loi thay vi UI trong gia.

- **D42** Khong export value tu 'use server' (CRM SOURCE_LABELS). Menu nhom mac dinh thu gon. Thong bao targeting (076). Coso chi con redirect → /{slug}/login. CSVC dat cho staff/GV; quan ly duyet.

- **D43** Menu van hanh: hub + tab thay vi nhieu leaf trung lap. Nhan su = To chuc NS / Ho so&luong + Ngay cong&phep; Khao thi / CSVC / Dao tao / Danh gia GV giong pattern do.

- **D44** AI nhung module: FAB «Hoi AI» + AskAiPanel theo route (admissions/training/admin/exams/hr/finance). Copilot them taskType module_assist + kbCategory; KB categories mo rong. RAG van loc org_id; khong biat chinh sach khi thieu tai lieu.

- **D45** AI soan form: taskType draft_assist + draftMode (announcement/exam_paper/contact_book/…). AiDraftButton dien thang textarea. Import HV goi validateImportData (AI chuan hoa). useEffectiveOrgId fallback profiles tren Staff portal.

- **D46** Admin co so bat/tat ai_assist_enabled (Cai dat → Ho tro AI /settings/ai). Thieu API hoac tat → thong bao «Chức năng AI chưa được kích hoạt, vui lòng liên hệ quản trị viên». assertOrgAiReady tren copilot/tutor/LMS/warnings.
