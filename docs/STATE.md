# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-02 - QA audit fix High A–E

## Snapshot
- Build: SẠCH (`npm run build` exit 0; `tsc --noEmit` exit 0).
- Đã sửa lỗi High từ audit (MaSV, bảo mật, mock-on-empty, payroll role, AI co-teacher, reports, form).

## Migrations
- File: `001 → 067` + `999_*`.
- ⚠️ Chạy SQL Editor nếu thiếu: **065** (rubric), **066** (HR leave), **067** (backfill MaSV↔student_code) — CHƯA chắc đã chạy trên DB thật.

## Module gần đây
- QA-FIX: đồng bộ MaSV/student_code; auth warnings; copilot role-gate; parent HMAC middleware; mock-off-empty.
- HR P0–P3; LMS menu; KB AI.

## Tồn đọng
1. User chạy **066** + **067** (+ xác nhận 065) trên DB (`node scripts/check-db.mjs`).
2. Med còn lại: transfer enrollment transaction, invoice idempotency, RLS 064/065 siết, menu/shell drift, CSP headers.
3. OTP phụ huynh vẫn mock (cần SMS thật); production bắt buộc `PARENT_MOCK_OTP` ≠ `123456`.
4. Clash HV / TKB tầng 4 / rate_modifiers — sau.
