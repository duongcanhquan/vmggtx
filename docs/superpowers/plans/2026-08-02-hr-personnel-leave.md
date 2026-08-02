# HR Personnel Leave — Implementation Plan

> **For agentic workers:** Steps follow spec `docs/superpowers/specs/2026-08-02-hr-personnel-leave-design.md`. Order: P0 → P1 → P3 → P2.

**Goal:** Fix staff HR: no students in users; teacher major/subjects on account; leave + workdays; payroll approve + office salary + attendance gate.

**Tech:** Next.js 14 Server Actions, Supabase migrations 066–067, menuRegistry ×3.

## Tasks
1. P0 campus-admin/users exclude student
2. P1 teacher major/subjects block on users + job-titles copy
3. P3 migration 066 hr_leave_* + overrides; 067 staff_salary_terms
4. P3 UI /hr/attendance + /hr/my-leave + settings HR + menu
5. P2 payrollService unify + status transitions + missing attendance report + office pay
6. Docs D28 STATE WORKLOG build

---

Plan saved; executing immediately per user request to fix all issues.
