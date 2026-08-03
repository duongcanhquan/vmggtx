# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-03 - Audit + fix gaps D42-D43

## Snapshot
- Build: SẠCH (`npm run build` exit 0).
- Audit: vá roleIs flash, hub active, assets tabs.
- **D43**: Menu hub+tab (NS/lương, phép, khảo thí, CSVC, đào tạo, đánh giá GV).
- D42 CRM/UX; D41 publish grades.

## Migrations
- File: `001 → 076` + `999_*`.
- ⚠️ Chạy SQL nếu thiếu: **065, 067→076** — ưu tiên **071–076** (076 = thông báo scope).

## Module gần đây
- D42 ops UX; Khảo thí (D39); Super Admin (D40).

## Tồn đọng
1. User chạy **067→076** (+ 065) — CRM cần 052–054; thông báo scope cần **076**.
2. R2 + `PARENT_MOCK_OTP` mạnh trên prod.
3. Med: làm đề online gắn exam_schedules; sơ đồ chỗ ngồi.
4. Thin: học bạ năm; BHXH/PDF lương.
