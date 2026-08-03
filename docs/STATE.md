# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-03 - AI gate bật/tắt (D46)

## Snapshot
- Build: SẠCH (`npm run build` exit 0).
- **D46**: Admin cơ sở bật/tắt `ai_assist_enabled`; thiếu API → thông báo liên hệ quản trị.
- D45 draft AI; D44 FAB Ask AI.

## Migrations
- File: `001 → 076` + `999_*`.
- ⚠️ Chạy SQL nếu thiếu: **065, 067→076**.

## Module gần đây
- D46 AI gate; D45 draft; D44 Ask AI.

## Tồn đọng
1. User chạy **067→076** (+ 065).
2. R2 + `PARENT_MOCK_OTP` mạnh trên prod.
3. Nạp KB đúng category.
4. Med: làm đề online gắn exam_schedules; sơ đồ chỗ ngồi.
