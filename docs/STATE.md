# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-03 - Stabilization load/publish (D41)

## Snapshot
- Build: SẠCH (`npm run build` exit 0).
- **D41**: Fix tải điểm (HV/PH chỉ sau công bố), load lỗi không còn trống giả,
  CSVC/AI/settings/pathways ổn định hơn.
- D40 Super Admin UX; D39 Khảo thí; D38 API allocation.

## Migrations
- File: `001 → 075` + `999_*`.
- ⚠️ Chạy SQL nếu thiếu: **065, 067→075** — **071–075 CHƯA chạy trên DB thật**.

## Module gần đây
- Stabilization D41; Super Admin UX (D40); Khảo thí (D39).

## Tồn đọng
1. User chạy **067→075** (+ 065) — ưu tiên **071–075** (075 = công bố điểm).
2. R2 + `PARENT_MOCK_OTP` mạnh trên prod.
3. Med: làm đề online gắn exam_schedules; sơ đồ chỗ ngồi.
4. Thin: học bạ năm; BHXH/PDF lương.
