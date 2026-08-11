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

## 2026-08-02 | CRM tuyen sinh chuyen nghiep (D18)
- Migration 052: source/priority/follow-up/appointment/lost_reason + activities soft-delete.
- actions: bo MOCK, chong trung SDT, CRUD, claim, soft-delete, activities, funnel.
- UI: drawer cham soc, filter nguon/do nong/qua han, modal ly do mat + hen test.
- Seed/check-db/checklist + STATE. Can chay 052 tren DB that.

## 2026-08-02 | CRM AI + ho so day du (D19)
- Migration 053: CCCD/PH/so thich/nganh nghe + profiles sync; entity lead; CRM org_settings.
- Copilot taskType crm_assist (RAG admissions, summarize, script, follow-up).
- Settings tab Tuyen sinh; drawer tab AI; form lead mo rong.

## 2026-08-02 | CRM bugfix pass
- Soft-delete: log activity TRUOC khi an lead (RLS).
- datetime-local -> ISO timestamptz; createLead khong ghi de follow-up th?.
- AI form luon mode rag; drawer key=lead.id; fallback cot/activities/convert.

## 2026-08-02 | CRM bang dong + ho so day du (054)
- Migration 054: strengths/weaknesses/needs/potential_rating/deposit/payment_notes.
- UI: toggle D?ng (table + pagination 10/20/50) / Kanban; drawer tab Tong quan/Cham soc/Sua/Dong tien/AI.
- getLeadPaymentInfo: dat coc + hoa don HV khi da convert. Build exit 0. Can chay 052-054 tren DB.

## 2026-08-02 | fix Bang diem tong shell + tong hop
- Root cause: menu tro /staff/transcripts -> PortalShell Staff.
- Chuyen /academic/transcripts (dashboard): KPI, loc don vi, tim lop, drill-down + tim HV.
- Redirect /staff/transcripts; update DashboardShell + staff nav. D20.

## 2026-08-02 | Xep lich TKB dashboard (A+B)
- /academic/schedule: 1 buoi + tuan lap T2-CN; anti conflict; subtree org.
- Menu + link tu /classes /teachers; staff nav; doi nhan Lich cua toi.
- GV schedule/home: thay the substitute_teacher_id. D21. Build check.

## 2026-08-02 | Canh bao hoc vu full ops (055)
- Migration 055 severity/in_progress/notes; settings nguong som + GPA.
- UI: KPI, top HV/lop, tim/loc, workflow, AI goi y. D22. Can chay 055 tren DB.

## 2026-08-02 | Chuc danh + mau quyen (056 / D23)
- Migration 056: job_titles + profiles.job_title_id; get_my_menu_grants = title ? grants.
- UI /campus-admin/job-titles (CRUD ma tran tick); gan chuc danh o S?a t?i kho?n.
- Menu staff_users + DashboardShell; GrantsModal hien ?Theo chuc danh?. Can chay 056 tren DB.

## 2026-08-02 | Gap audit 7 nhom + uu tien TKB
- Audit DONE/PARTIAL/MISSING; chon cum TKB (A theo tang).
- Spec + plan: docs/superpowers/specs|plans/2026-08-02-smart-timetable*.

## 2026-08-02 | TKB thong minh tang 1-3 (D24)
- 057 org_holidays + is_org_holiday; skip/block khi xep.
- Luoi tuan HTML5 DnD + conflict do; khung gio schedule_slots.
- 058 class_schedule_plans + autoScheduler greedy preview/commit.
- Can chay 057-058 tren DB that.

## 2026-08-02 | Phan cong cong viec (059 / D25)
- Migration work_tasks + work_task_assignees, RLS + grant work_tasks.
- UI /academic/tasks (Kanban) + /teacher/tasks; MenuKey work_tasks.
- Tach biet e-ticket. Can chay 059 tren DB.

## 2026-08-02 | Gap audit P2-P5 (060-062 / D26)
- P2: /teacher/exams + /exams + In/PDF bang diem (HTML print).
- P3: class_sessions.facility_id + dropdown CSVC xep lich (giu room).
- P4: curriculum columns subjects + /academic/subjects.
- P5: tuition_rules + sinh invoices pending /finance/tuition-rules.
- Can chay 060-062 tren DB that.

## 2026-08-02 | Class groups + GV mon/nganh (063-064 / D27)
- P0: /classes hien co so, mon, ten GV (bo UUID).
- P1: teaching_major + teacher_subjects; UI /teachers.
- P2: class_groups + group_id + class_teachers; /classes/groups.
- Rubric LMS (P3) chua code. Can chay 063-064 tren DB.

## 2026-08-02 | Rubric LMS + dong goi cohort (065 / D27)
- 065 lms_rubrics/criteria/levels/submission_grades.
- /teacher/lms/grade/[submissionId] split-screen + local+server draft + chot diem.
- LMS: Thiet lap Rubric + nut Cham rubric; cohort them HV; gan lead/co/grader.
- Build sach. Can chay 065 tren DB.

## 2026-08-02 | Kho tri thuc AI UI (option B)
- Nap theo org dang chon (useOrgStore), mon tu subjects, category training/admissions/general.
- Filter danh sach: mon ? lop ? category; bat buoc mon khi category Dao tao.
- /settings/ai: huong dan 5 buoc + link /ai/knowledge-base.
- Build sach. Khong migration moi.


## 2026-08-02 | LMS hien ro (option A)
- Menu Dashboard Dao tao: LMS Online -> /academic/lms (menuKey lms).
- /classes: nut LMS + deep-link ?classId=; listAccessibleLmsClasses (staff org / GV lead+co).
- /learn: HV tu enrollments + class_group_members; tom tat tien do; empty states.
- Build sach. Khong migration moi.

## 2026-08-02 | HR P0-P3 (D28)
- P0: users loai student; schema create/update khong student.
- P1: link nganh/mon /teachers; job-titles ghi chu.
- P3: migration 066 leave/workdays/salary; /hr/attendance + /hr/my-leave + menu.
- P2: payroll missing attendance note; duyet approved/paid.
- Can chay 066 tren DB. Build sau.

## 2026-08-02 | QA audit fix High A-E
- A: MaSV=student_code (create/CRM/import/update/list); migration 067 backfill.
- B: warnings core+auth; copilot role-gate; parent HMAC middleware; OTP harden; no MOCK prod.
- C: mock-on-empty off; payroll/accountant; assertClassAccess (co-teacher/cohort).
- D/E: report paginate; tutor timeout; form validate; toast; truncate; lucide Wallet.
- Build + tsc sach. Can chay 067 (va 066 HR) tren DB.

## 2026-08-02 | Commit QA High + HR/LMS batch
- Migration numbering: 067 HR leave, 068 MaSV backfill.
- Build + tsc sach truoc push.

## 2026-08-03 | URL cong co so rut gon + sign-out
- Bo tien to /coso: /{slug}/login (legacy /coso/* redirect).
- Landing /login: bam goc trai duoi -> icon Super Admin -> /login/admin.
- login_portal chuan hoa; dang xuat ve dung cong co so (khong ve landing).
- Cap nhat D14, demo-accounts, UI admin copy link.
- Can deploy Vercel + verify build.

## 2026-08-03 | Perf CRM + dashboard load
- CRM: bo double getLeads; slim LEAD_LIST_SELECT; RPC crm_lead_activity_stats; getLeadById drawer.
- Migration 069 indexes + sum_org_payments; overview dung RPC tong thu.
- classes/schedule dung getDescendantOrgIds cache; limit students/invoices/classes.
- Can chay 069 tren DB + deploy. Build verify.

## 2026-08-03 | Phong hoc + menu GV
- An "Lich cua toi" khoi menu quan ly (chi GV portal).
- Menu Giao vien: Danh sach / Duyet don / Danh gia.
- Them /academic/rooms (capacity, code, location, room_kind) + migration 070.
- TKB dropdown phong hien suc chua/vi tri; link quan ly phong.
- Can chay 070 tren DB.

## 2026-08-03 | Danh gia GV = khao sat HS theo ky (D29)
- Mo dot: tu phat phieu moi lop co GV+HV; chan overlap dot active.
- Dong dot + Dong bo phieu (HV ghi danh muon).
- Bao cao /academic/evaluations: loc dot, ty le hoan thanh, so lop/GV.
- Portal HS: copy "moi lop 1 lan trong ky". Khong migration moi (022).

## 2026-08-03 | To chuc nhan su (D30)
- Menu ?To chuc nhan su? thay 2 muc rieng; tabs Tai khoan + Chuc danh.
- Copy: campus_admin setup/phan quyen cao nhat; chuc danh = mau menu theo CS.
- Cap nhat menuRegistry, moduleCatalog, admin portal shortcuts.

## 2026-08-03 | Fix mask luong campus_admin (D31)
- Migration 071: get_my_can_view_financials luon true cho campus_admin/super_admin.
- App: getViewerPermissions + getContracts unmask cho admin; toggle Xem luong.
- Can chay 071 tren DB (app da unmask tam cho admin).

## 2026-08-03 | Ho so NS chuyen nghiep (D32)
- Migration 072: staff_documents, probation_end_date, notif HR types.
- /hr/personnel: CCCD/DOB/dia chi + upload R2; khoa hr_sensitive_locked.
- Hop dong: ngay het thu viec; cron /api/cron/hr-reminders; mau chuc danh Truong phong NS.
- Can chay 072 + R2 tren moi truong that.

## 2026-08-03 | Quy trinh Dao tao / lop hanh chinh (D33)
- Menu: Chuong trinh mon ? Lop hanh chinh ? Hoc phan; AcademicFlowTabs.
- Them HV: search/filter/multi-select; sync roster ? hoc phan; ghep HV section.
- /classes CTA uu tien tu lop hanh chinh. Khong migration moi (064).

## 2026-08-03 | Hanh chinh & CSVC (D34)
- Menu moi: Dat phong/TB, Dat xe, Danh muc, So tai san.
- /facilities + /facilities/vehicles (FacilityBoard); type vehicle (073).
- rooms + actions + menuRegistry/middleware. Can chay 073 tren DB.

## 2026-08-03 | Menu hien thi du module (D35)
- Sidebar: khao thi, bao cao con, dot DG GV, ky luong, chuc danh, settings AI/fields.
- Nhom menu mac dinh mo (gdtx-menu-groups-v2).

## 2026-08-03 | Tach cong + cach ly du lieu (D36)
- Middleware chan super khoi cong van hanh truong.
- Login admin chi super; slug tu choi super; sai co so signOut.
- Cohort/enroll chan HV ngoai subtree; campaigns RoleGuard bo super.

## 2026-08-03 | Sweep fix Critical/High (D37)
- 074: record_payment_atomic + facility pending/duyet.
- Bo role_hint cookie; enroll/CRM chan cheo org; tat mock prod.
- CSVC: GV pending, quan ly confirmed + nut Duyet.
- TKB: chan trung lich HV khi insert/move session; form lop/CSVC bo seed mock.

## 2026-08-03 | Super Admin API + quyen module (D38)
- /admin/ai: gan API AI theo don vi (key rieng / ke thua HQ/env).
- /admin/modules: mo ta howItWorks, badge Trong goi, cap quyen 2 buoc ro.
- Nav Super + middleware /admin/ai. Khong migration moi (017).

## 2026-08-03 | Module Khao thi tach rieng (D39)
- MenuKey exams tach khoi staff_ops (dao tao/TKB).
- Hub /staff/exam-office; exam-grades (tao cot + cong bo); exam-export; learning-pathways.
- Migration 075 + backfill license staff_ops -> exams. Can chay 075 tren DB.

## 2026-08-03 | Super Admin UX (D40)
- Goi dich vu: the module gon (Cap/Go + Chi tiet); tab nhom mac dinh.
- Cai dat chung (gop API HQ + API theo don vi); /admin/ai redirect.
- Quan ly Don vi: nut Admin -> ho so #admins (CRUD Admin), khong nhay campus-admin/users.

## 2026-08-03 | Stabilization load + cong bo diem (D41)
- Cong bo diem: HV + PH chi thay lop is_published=true; helper publishedClasses.
- Load: grades loadError; facility bookings error; exam-grades fail-soft 075;
  org_ai_settings error; settings demo banner; exam-export enroll error.
- UI: Duyet facility busy; pathway m?c theo id; search HV tra error.

## 2026-08-03 | CRM fix + UX van hanh (D42)
- CRM: tach SOURCE_LABELS khoi use server (het RSC crash prod).
- Menu mac dinh thu gon; thong bao PH/HV/GV (all/lop/ca nhan) + mig 076.
- Login /{slug}; CSVC dat phong/xe tren staff+teacher; /ai/guide.

## 2026-08-03 | Menu hub + tab gon (D43)
- Nhan su: To chuc NS / Ho so&luong + Ngay cong&phep (HrLeaveTabs).
- OrgStaffTabs them Ky tinh luong; gop Khao thi/CSVC/Dao tao/Danh gia GV.

## 2026-08-03 | Audit fix gaps D42-D43
- roleIs fail-closed; hub matchPrefixes/alsoKeys; Khao thi leaf.
- AdminOpsTabs tren /assets; doi nhan Duyet cong / Xin nghi.

## 2026-08-03 | Module Ask AI nhung van hanh (D44)
- FAB Hoi AI (Dashboard + Staff Portal) doi context theo path.
- AskAiPanel / ModuleAiInline tren CRM, TKB, HR, finance, exam-office, facilities.
- Copilot: module_assist + kbCategory; KB +hr/finance/exams/admin.

## 2026-08-03 | AI soan form + gatekeeper import (D45)
- draft_assist: thong bao, ngan hang de, so LL, canh bao PH, khoan thu, ly do nghi.
- Import HV: nut AI chuan hoa (validateImportData).
- useEffectiveOrgId cho Staff portal thieu org store.

## 2026-08-03 | AI gate bat/tat + thong bao chua kich hoat (D46)
- orgConfig.ai_assist_enabled; tab Cai dat Ho tro AI + toggle /settings/ai.
- assertOrgAiReady: tat hoac thieu API key ? thong bao lien he quan tri.
- Copilot/tutor/LMS/warnings + AskAiPanel/AiDraftButton.

## 2026-08-11 | Sidebar hover-expand + so tien trong bloc (D47)
- DashboardShell + PortalShell: mac dinh icon-rail 76px; hover/focus mo full overlay.
- Noi dung luon pl-[76px] — dien tich trang toi da.
- ReportKpiTile / budget / revenue / payroll / overview: so tien clamp + break-words.

## 2026-08-11 | CRM: bo mo ta pipeline duoi tieu de
- Xoa doan huong dan Pipeline lead / AI drawer / FAQ tren /crm/leads.

## 2026-08-11 | CRM drawer dong thoi gian (D48)
- LeadDetailDrawer max-w-6xl: trai tab TV, phai LeadTimeline.
- Timeline: mau theo loai, group theo ngay, actor initials, mốc tạo lead.
- updateLead ghi nhat ky tieng Viet; reload timeline sau save/claim.

## 2026-08-11 | Review fix + commit D47-D48
- Build sach; fix classify timeline; reset edit form khi doi lead.
- DashboardShell bo import lucide thua.

