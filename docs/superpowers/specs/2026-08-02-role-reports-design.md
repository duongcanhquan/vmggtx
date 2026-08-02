# Role-based Reports Hub (D17)

## Goal
Visual multi-dimension reports per role: campus, academic, teacher, exam, parent.
Bento + Recharts, little text, tint tokens.

## Routes
- `/reports` hub + campus cockpit (campus_admin, academic_staff, accountant)
- `/reports/academic` early-warning board
- `/reports/exams` exam pass/distribution
- `/teacher/insights` teacher class analytics
- `/parent/insights` parent trends

## Menu
MenuKey `reports` — defaultRoles: super_admin, campus_admin, academic_staff, accountant.
Teacher/parent use portal nav (not DashboardShell).

## Data
Org-scoped via get_descendant_org_ids / is_authorized. Soft-delete filters.
Overview projectedRevenue = sum payments (not MOCK tuition).
