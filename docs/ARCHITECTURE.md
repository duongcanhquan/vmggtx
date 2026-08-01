# ARCHITECTURE - Bản đồ hệ thống (đọc khi cần hiểu cấu trúc, ít khi thay đổi)

## Stack
Next.js 14 App Router (Server Actions, middleware) + Supabase (Postgres/RLS/Auth/ltree)
+ Tailwind + Zustand (currentOrgId) + Vercel AI SDK v4 + Cloudflare R2 (file lớn) + Recharts.
Deploy: Vercel. TypeScript + Zod toàn bộ.

## Multi-tenant
- `organizations` cây ltree: hq → region → campus (CƠ SỞ) → branch... Tối đa 3 cấp dưới 1 campus
  (chặn trong createOrganization). 1 database chung cho mọi cơ sở, cách ly bằng RLS theo `org_id`.
- Scope subtree: SQL `get_descendant_org_ids` / server `getDescendantOrgIds` (cache Map+TTL,
  invalidate bằng `invalidateOrgScopeCache`). RPC `is_authorized(p_target_org_id, p_required_role)`.

## Roles (8) & Cổng
| Role | Cổng chính | Ghi chú |
|---|---|---|
| super_admin | (dashboard) menu SUPER_MENU 5 mục | chỉ kiến trúc: tạo cơ sở/admin/phân quyền |
| campus_admin | (dashboard) đầy đủ + /admin/* | toàn quyền subtree, tạo nhánh con + phó GĐ |
| academic_staff, admission_staff, accountant | (dashboard) theo ma trận | nhân viên cơ sở |
| teacher | /teacher/* | lịch, điểm danh, sổ đầu bài, LMS, chấm điểm |
| student | /student/*, /learn, /grades | login riêng /student/login |
| enterprise_partner | /b2b/* | doanh nghiệp chấm điểm thực tập |
| (parent - KHÔNG phải role DB) | /parent/* | cookie HMAC `parent_session`, không Supabase session |

## Phân quyền 3 tầng (thứ tự kiểm tra)
1. `src/middleware.ts`: ROUTE_RULES tĩnh (trần cứng theo role) + ma trận động qua cookie
   `menu_hint` / RPC `get_my_menu_keys` (fail-open nếu chưa chạy migration 043).
2. Layout + Server Action: tự xác thực lại role/org (requireXXX, is_authorized).
3. UI: `RoleGuard`, `useMyRole`, `useMyMenuKeys` - chỉ là UX.
- Nguồn khai báo menu: `src/lib/auth/menuRegistry.ts` (key, defaultRoles, prefixes)
  + `MENU`/`SUPER_MENU` trong `DashboardShell.tsx`. UI ma trận: `/admin/permissions`.

## File "xương sống" (sửa gì cũng nên biết)
- `src/middleware.ts` - route guard + redirect theo role + parent HMAC + menu matrix.
- `src/lib/auth/roles.ts`, `menuRegistry.ts`, `src/lib/hooks/useMyRole.ts`, `useMyMenuKeys.ts`.
- `src/lib/utils/orgScope.ts` - subtree + cache. `src/lib/supabase/{server,client,admin}.ts`.
- `src/lib/validation/schemas.ts` - TOÀN BỘ Zod schema + ActionResult/zodFail.
- `src/lib/settings/settingsResolver.ts` - org_settings.config JSONB kế thừa theo cây.
- `src/lib/ai/getTenantAIConfig.ts` - AI key per-tenant. `src/lib/storage/r2.ts` - presigned URL.
- `src/components/shared/DashboardShell.tsx` (menu), `SmartTable`, `SectionTabs`, `FunLoader`,
  `RoleGuard`, `OrgTreeSelector`, `PortalShell`.
- Dashboard tổng quan: `src/app/(dashboard)/page.tsx` + `actions.ts::getOverviewPageData`
  (1 server action gộp) + RPC `get_overview_report` (migration 042).

## Route groups (src/app)
`(auth)` login các cổng • `(dashboard)` nhân viên/quản lý (students, classes, attendance, finance,
hr, crm, assets, announcements, campus-admin/users, settings, hdsd...) • `(portals)` admin, staff,
teacher, b2b, student • `(student-portal)`, parent/* • api/ (ai/copilot, chat/tutor, cron/tuition-reminders).

## Nhóm migration (001→043, 999 chạy cuối)
- 001-006 nền: schema đa tầng, AI functions, subjects, profiles, RBAC matrix, JWT claims.
- 007-013 nghiệp vụ: hóa đơn, sổ điểm, enrollment+student portal, HR/payroll, cảnh báo, lương, session status.
- 014-023: CRM, secure views, system/org settings, AI tenant + RAG isolation, dynamic fields,
  user settings, student AI chat, đánh giá ẩn danh, phòng khảo thí.
- 024-033: exam bank, LMS (+hardening), attendance notes, student codes, teacher requests,
  operations (makeup/substitute), exam ops, ticketing, diary+facilities.
- 034-043: user_preferences+layout templates, dual-track (MaSV), assessment workflows, B2B,
  behavior logs, LMS progress, notifications, assets, overview report RPC, menu permissions.
