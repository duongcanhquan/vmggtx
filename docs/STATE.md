# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-11 - Menu: Tuyển sinh + Gửi thông báo → Đào tạo

## Snapshot
- Build: chưa chạy lại sau đổi menu (cần verify trước commit nếu commit).
- Menu: «Tuyển sinh» (icon UserPlus); «Gửi thông báo» nằm trong Đào tạo & Học vụ.
- **D49**: PageHeader gọn + bỏ AI trùng. **D48** timeline. **D47** sidebar.

## Migrations
- File: `001 → 076` + `999_*`.
- ⚠️ Chạy SQL nếu thiếu: **065, 067→076**.

## Module gần đây
- D47 sidebar hover + money overflow; D46 AI gate.

## Tồn đọng
1. User chạy **067→076** (+ 065).
2. R2 + `PARENT_MOCK_OTP` mạnh trên prod.
3. Nạp KB đúng category.
4. Med: làm đề online gắn exam_schedules; sơ đồ chỗ ngồi.
