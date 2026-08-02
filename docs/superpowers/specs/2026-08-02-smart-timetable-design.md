# Smart Timetable (TKB) — Design Spec (D24)

**Date:** 2026-08-02  
**Priority from gap audit:** TKB (cluster #1), approach A (phased).

## Goal
Upgrade `/academic/schedule` from manual session ledger to phased smart TKB: holidays, week grid drag-drop with conflict highlight, rule-based auto-fill. Advanced optimization = later.

## Non-goals (Tier 4 / later)
- MIP/OR-Tools solver, cross-campus teacher load balancing
- `facility_id` FK on `class_sessions` (room stays text for now)
- Student clash detection across enrollments

## Architecture
- Keep `class_sessions` + `check_schedule_conflict` (teacher + room).
- New `org_holidays` (org-scoped, inherit to subtree via ancestor walk).
- New `class_schedule_plans` (per-class weekly rule template).
- `org_settings.config.schedule_slots` — fixed periods for grid/auto.
- UI tabs on `/academic/schedule`: Manual | Week | Holidays | Auto.

## Tiers
1. Holidays CRUD; skip recurring; block single create.
2. Week grid + conflict red; HTML5 DnD → `moveSession`.
3. Greedy auto-scheduler with dry-run then commit.
4. (Later) advanced optimize — DECISIONS D24 only.

## Security
- Same gate as today: `is_authorized` academic_staff + menu `staff_ops`, org subtree.
- Soft-delete on holidays/plans; SELECT `deleted_at IS NULL`.
