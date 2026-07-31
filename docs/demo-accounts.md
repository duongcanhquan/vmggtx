# TÀI KHOẢN DEMO — GDTX ERP

> Sinh bởi `npm run seed`. **Mật khẩu chung cho TẤT CẢ tài khoản: `Demo@123456`**

## Cây tổ chức demo

```
Tổng Công ty GDTX (Demo)                 <- superadmin
├── Cụm Miền Bắc (Demo)
│   ├── Cơ sở Hà Nội - Cầu Giấy   (cs1)
│   └── Cơ sở Hà Nội - Hà Đông    (cs2)
└── Cụm Miền Nam (Demo)
    ├── Cơ sở TP.HCM - Quận 1     (cs3)
    └── Cơ sở TP.HCM - Thủ Đức    (cs4)
```

## Danh sách đăng nhập (69 tài khoản)

Đăng nhập tại `/login`. Sau khi đăng nhập, hệ thống tự đẩy về đúng cổng theo vai trò.

| Vai trò | Email | Số lượng | Vào cổng |
|---|---|---|---|
| Super Admin (toàn hệ thống) | `superadmin@gdtx-demo.edu.vn` | 1 | `/admin` |
| Quản lý Cơ sở | `admin.cs1@gdtx-demo.edu.vn` → `admin.cs4@...` | 4 | `/admin` |
| Giáo vụ / Khảo thí | `staff1.cs1@...`, `staff2.cs1@...` (mỗi cơ sở 2) | 8 | `/staff` |
| Tư vấn Tuyển sinh | `tuyensinh.cs1@...` → `tuyensinh.cs4@...` | 4 | `/crm/leads` |
| Giáo viên | `teacher1.cs1@...` → `teacher3.cs4@...` (mỗi cơ sở 3) | 12 | `/teacher` |
| Học sinh | `student01.cs1@...` → `student10.cs4@...` (mỗi cơ sở 10) | 40 | `/student` |

Ví dụ cụ thể hay dùng nhất:

- `superadmin@gdtx-demo.edu.vn` — thấy TOÀN BỘ 4 cơ sở, quản lý cây tổ chức, doanh thu tổng.
- `admin.cs1@gdtx-demo.edu.vn` — chỉ thấy Cơ sở Cầu Giấy: nhân sự, hợp đồng, bảng lương, cài đặt.
- `staff1.cs1@gdtx-demo.edu.vn` — giáo vụ Cầu Giấy: lớp, TKB, kỳ thi, bảng điểm tổng, xét duyệt, ngân hàng đề.
- `teacher1.cs1@gdtx-demo.edu.vn` — giáo viên biên chế: lịch dạy, điểm danh, chấm điểm, trợ lý AI.
- `student01.cs1@gdtx-demo.edu.vn` — học sinh: lịch học, sổ điểm, học phí, gia sư AI.

## Dữ liệu nghiệp vụ đi kèm

| Dữ liệu | Chi tiết |
|---|---|
| Lớp học | 5 lớp (Toán/Văn/Anh/Lý/Hóa 12A1-5), mỗi lớp 2 buổi/tuần, ±30 ngày quanh hôm nay |
| Điểm danh | Buổi quá khứ đã điểm danh (~90% có mặt) và đánh dấu `completed` (chạy được bảng lương) |
| Điểm số | 3 bài/lớp (miệng 20% - giữa kỳ 30% - cuối kỳ 50%), thang 0-10 |
| Khóa sổ | Lớp cuối cùng ĐÃ CHỐT SỔ (thử sửa điểm sẽ bị chặn); lớp áp chót QUÁ HẠN nhập điểm (hiện màu vàng ở `/staff/exams`, duyệt ở `/staff/results-approval`) |
| Hợp đồng GV | Mỗi cơ sở: GV1 biên chế (12tr + BHXH), GV2 thỉnh giảng (250k/giờ), GV3 khoán giờ (200k/giờ) — bấm "Chạy Bảng Lương Tháng" tại `/finance/payroll` là ra số |
| Học phí | Mỗi HS 1 hóa đơn 2.000.000đ: ~50% đã đóng đủ, ~25% một phần, ~25% chưa đóng (một nửa QUÁ HẠN → cảnh báo đỏ ở cổng học sinh) + phiếu thu tương ứng → `/admin/revenue` có số liệu |
| CRM | 6 leads/cơ sở đủ trạng thái (mới, đã liên hệ, hẹn test, mất) — lead "mới" đầu tiên CHƯA có người phụ trách để demo nhận lead |
| Ngân hàng đề | 3 đề/cơ sở (cần đã chạy migration 024, thiếu thì seed tự bỏ qua) |

## Cách chạy seed

```bash
# 1. .env phải có giá trị THẬT (không phải placeholder):
#    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# 2. Đã chạy đủ migrations 001 -> 024 + 2 file 999 (kiểm tra: node scripts/check-db.mjs)
npm run seed
```

Script **idempotent**: chạy lại bao nhiêu lần cũng được — nó tự xóa sạch dữ liệu demo cũ (nhận diện qua email đuôi `@gdtx-demo.edu.vn` và cây org demo) trước khi nạp mới. Dữ liệu thật KHÔNG bị đụng tới.
