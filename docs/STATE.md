# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-09-14 - Fix middleware 504 timeout

## Snapshot
- Middleware Edge: timeout 2.5s + skip Auth khi không có cookie (chống `MIDDLEWARE_INVOCATION_TIMEOUT`).
- Menu: «Tuyển sinh»; «Gửi thông báo» trong Đào tạo & Học vụ.
- **D49** PageHeader; **D48** timeline; **D47** sidebar.

## Migrations
- File: `001 → 076` + `999_*`.
- ⚠️ Chạy SQL nếu thiếu: **065, 067→076**.

## Module gần đây
- Fix Vercel 504 middleware; D47–D49 UI/CRM.

## Tồn đọng
1. User chạy **067→076** (+ 065).
2. R2 + `PARENT_MOCK_OTP` mạnh trên prod.
3. Nâng `@supabase/ssr` (đang 0.5.2) khi ổn định.
4. Med: làm đề online gắn exam_schedules; sơ đồ chỗ ngồi.
