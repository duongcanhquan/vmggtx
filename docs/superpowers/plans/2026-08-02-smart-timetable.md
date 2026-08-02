# Smart Timetable Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Phased TKB: holidays → week DnD + conflicts → rule auto-fill on `/academic/schedule`.

**Architecture:** Extend existing `class_sessions` + conflict RPC; add `org_holidays`, `class_schedule_plans`, `schedule_slots` in org config; greedy auto engine in `src/lib/schedule/`.

**Tech Stack:** Next.js 14 Server Actions, Supabase RLS, HTML5 DnD (no @dnd-kit), Zod, Tailwind bento.

## Global Constraints
- Soft-delete; UUID PKs; org_id + RLS subtree.
- Vietnamese UI; FunLoader; no emoji icons.
- Design tokens only (no hardcoded hex).
- D21: main TKB stays under DashboardShell `/academic/*`.
- Migrations 057/058 run manually by user in SQL Editor.

## File map
- `supabase/migrations/057_org_holidays.sql`
- `supabase/migrations/058_class_schedule_plans.sql`
- `src/lib/schedule/slots.ts` — defaults + helpers
- `src/lib/schedule/conflicts.ts` — client overlap helper
- `src/lib/schedule/autoScheduler.ts` — greedy preview/commit pure logic
- `src/app/(dashboard)/academic/schedule/actions.ts` — extend
- `src/app/(dashboard)/academic/schedule/page.tsx` — tabs UI
- `src/lib/validation/schemas.ts` — schedule_slots
- docs: STATE, WORKLOG, DECISIONS D24, check-db, VERCEL checklist

## Tasks
- [ ] T1 Migration 057 + holiday CRUD + skip/block
- [ ] T2a schedule_slots + week grid + conflict highlight
- [ ] T2b moveSession DnD
- [ ] T3 plans + autoScheduler preview/commit
- [ ] Docs + build
