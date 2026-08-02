# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-02 - QA audit fix High A–E + HR/LMS batch

## Snapshot
- Build: SẠCH (`npm run build` exit 0; `tsc --noEmit` exit 0).
- QA High A–E đã sửa (MaSV, bảo mật, mock-on-empty, payroll, AI, reports, form).

## Migrations
- File: `001 → 068` + `999_*`.
- ⚠️ Chạy SQL Editor nếu thiếu: **065** (rubric), **067** (HR leave), **068** (MaSV backfill) — CHƯA chắc đã chạy trên DB thật.

## Module gần đây
- QA-FIX: MaSV↔student_code; warnings auth; copilot roles; parent HMAC; mock-off-empty.
- HR leave/attendance; LMS rubric/cohort; KB AI.

## Tồn đọng
1. User chạy **067** + **068** (+ xác nhận 065) trên DB (`node scripts/check-db.mjs`).
2. Med còn lại: transfer enrollment transaction, invoice idempotency, RLS 064/065, menu drift, CSP.
3. OTP phụ huynh vẫn mock — prod bắt buộc `PARENT_MOCK_OTP` ≠ `123456`.
4. Clash HV / TKB tầng 4 — sau.
