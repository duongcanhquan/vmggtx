# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-11 - D49 mật độ UI (bỏ AI trùng, PageHeader gọn)

## Snapshot
- Build: SẠCH (`npm run build` exit 0).
- **D49**: Bỏ ModuleAiInline (chỉ giữ FAB Hỏi AI); PageHeader 1 hàng; CRM/HV/GV/lớp/TKB/HR/HĐ/Khảo thí gọn hơn.
- **D48**: Lead drawer + dòng thời gian. **D47**: Sidebar hover-expand.

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
