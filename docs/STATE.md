# STATE - Trạng thái dự án (NGUỒN SỰ THẬT DUY NHẤT)

> **Giao thức**: Agent đọc file này ĐẦU MỖI PHIÊN. Cập nhật CUỐI MỖI PHIÊN (trước commit).
> Giữ file này DƯỚI 120 dòng - chi tiết lịch sử để ở `WORKLOG.md`, kiến trúc ở `ARCHITECTURE.md`.

**Cập nhật lần cuối**: 2026-08-03 - AI soạn form (D45)

## Snapshot
- Build: SẠCH (`npm run build` exit 0).
- **D45**: `draft_assist` + nút «AI soạn» điền form (thông báo, đề thi, sổ LL, cảnh báo, HP, nghỉ, import).
- **D44**: FAB Hỏi AI theo module.
- useEffectiveOrgId: Staff portal fallback org từ profiles.

## Migrations
- File: `001 → 076` + `999_*`.
- ⚠️ Chạy SQL nếu thiếu: **065, 067→076** — ưu tiên **071–076**.

## Module gần đây
- D45 draft AI; D44 Ask AI; D43 hubs.

## Tồn đọng
1. User chạy **067→076** (+ 065).
2. R2 + `PARENT_MOCK_OTP` mạnh trên prod.
3. Nạp KB đúng category để RAG module có căn cứ.
4. Med: làm đề online gắn exam_schedules; sơ đồ chỗ ngồi.
