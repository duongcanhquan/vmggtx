# TÀI KHOẢN DEMO — EDU SYSTEM

> Sinh bởi `npm run seed`. **Mật khẩu chung: `Demo@123456`**
>
> Dữ liệu theo MÔ HÌNH MỚI (docs/ORG_MODEL.md): Hệ thống → Khách hàng (Đơn vị cấp 1, có license) → Cơ sở nhánh.

## Cây tổ chức demo + slug

```
Hệ thống                                    <- superadmin  → /login
├── Trường Cao đẳng Việt Mỹ                 (slug: viet-my   | license FULL 18 module, 500 HV)
│   ├── Việt Mỹ - Hà Nội                    (slug: ha-noi)
│   └── Việt Mỹ - TP.HCM                    (slug: tp-hcm)
└── Trung tâm GDTX Thăng Long               (slug: thang-long | license BASIC 14 module, 200 HV)
    ├── Thăng Long - Cầu Giấy               (slug: cau-giay)
    └── Thăng Long - Hà Đông                (slug: ha-dong)
```

Gói BASIC của Thăng Long **không có**: Kho tri thức AI (`ai_kb`), Tài sản (`assets`), Đánh giá GV (`evaluations`), Cảnh báo học vụ (`academic_warnings`) — dùng để test giới hạn module theo license.

## Cách đăng nhập

| Ai | URL | Cách nhập |
|---|---|---|
| **Super Admin** | `/login/admin` | Email + mật khẩu |
| **Quản lý / GV** | `/coso/{slug}/login` — tab Nhà trường | Email/SĐT + mật khẩu |
| **Học viên** | `/coso/{slug}/login?tab=family` — Học viên | MaSV hoặc email + mật khẩu |
| **Phụ huynh** | `?tab=family&who=parent` — Phụ huynh | Email + mật khẩu (cần migration **050**) |

Email PH demo (sau 050): `parent.vm240001@gdtx-demo.edu.vn` (MaSV bỏ dấu `-`). Mật khẩu chung `Demo@123456`.

## Danh sách tài khoản (75 — mật khẩu chung `Demo@123456`)

### Quản trị

| Vai trò | Email | Phạm vi |
|---|---|---|
| Super Admin | `superadmin@gdtx-demo.edu.vn` | Toàn hệ thống → `/login` |
| Admin Đơn vị Việt Mỹ | `admin.vietmy@gdtx-demo.edu.vn` | Toàn bộ Việt Mỹ (2 nhánh) |
| Admin Đơn vị Thăng Long | `admin.thanglong@gdtx-demo.edu.vn` | Toàn bộ Thăng Long (2 nhánh) |
| Admin nhánh VM Hà Nội | `admin.vmhn@gdtx-demo.edu.vn` | Chỉ nhánh Hà Nội |
| Admin nhánh VM TP.HCM | `admin.vmhcm@gdtx-demo.edu.vn` | Chỉ nhánh TP.HCM |
| Admin nhánh TL Cầu Giấy | `admin.tlcg@gdtx-demo.edu.vn` | Chỉ nhánh Cầu Giấy |
| Admin nhánh TL Hà Đông | `admin.tlhd@gdtx-demo.edu.vn` | Chỉ nhánh Hà Đông |

### Nhân sự mỗi nhánh (thay `{tag}` = `vmhn` / `vmhcm` / `tlcg` / `tlhd`)

| Vai trò | Email | Số lượng |
|---|---|---|
| Giáo vụ | `staff1.{tag}@` và `staff2.{tag}@gdtx-demo.edu.vn` | 2/nhánh |
| Tư vấn tuyển sinh | `tuyensinh.{tag}@gdtx-demo.edu.vn` | 1/nhánh |
| Kế toán | `ketoan.{tag}@gdtx-demo.edu.vn` | 1/nhánh |
| Giáo viên | `teacher1.{tag}@` … `teacher3.{tag}@gdtx-demo.edu.vn` | 3/nhánh |
| Học viên | `student01.{tag}@` … `student10.{tag}@gdtx-demo.edu.vn` | 10/nhánh |

Học viên có **MaSV**: `VM24-0001` … `VM24-0020` (Việt Mỹ), `TL24-0021` … `TL24-0040` (Thăng Long).

## Dữ liệu nghiệp vụ kèm theo

- 5 lớp học (2 buổi/tuần, ±30 ngày), 90 buổi, 450 lượt điểm danh, 150 điểm số
- 1 lớp đã **chốt sổ điểm**, 1 lớp **quá hạn nhập điểm** (test duyệt kết quả)
- 12 hợp đồng GV (biên chế / thỉnh giảng / khoán giờ) → chạy được bảng lương
- 40 hóa đơn học phí (đủ đã đóng / một phần / quá hạn) + phiếu thu
- 24 leads CRM đủ trạng thái + nhật ký chăm sóc; 12 đề trong ngân hàng đề
- LMS: mỗi lớp có bài giảng, bài tập (60% đã nộp), quiz online (50% đã làm)
- Mỗi Đơn vị có **Người liên hệ** trong Hồ sơ Đơn vị (Super Admin xem tại `/admin/organizations`)

## Kịch bản test gợi ý

1. **Super Admin** (`/login`): chỉ thấy/sửa được 2 Đơn vị cấp 1; bấm vào mới sổ nhánh con (chỉ xem). Module Center gán/bỏ module cho từng khách hàng.
2. **Admin Đơn vị** (`admin.vietmy@`): quản toàn bộ 2 nhánh — tạo nhánh mới, nhân sự, phân quyền menu.
3. **Admin nhánh** (`admin.vmhn@`): chỉ thao tác trong nhánh mình.
4. **License**: đăng nhập nhân sự Thăng Long → không thấy menu AI/Tài sản/Đánh giá GV (gói BASIC).

## Nếu không đăng nhập được

1. **Sai mật khẩu / không có user** → DB chưa seed. Chạy:
   ```bash
   # .env có NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY thật
   npm run seed
   ```
2. **/coso trống hoặc 404 slug** → chạy `045_org_slugs.sql` trong Supabase SQL Editor, rồi seed lại.
3. **Vercel thiếu `SUPABASE_SERVICE_ROLE_KEY`** → thêm key trên Vercel Dashboard.
4. **JWT hook 006 chưa bật** → vẫn login được (code fallback đọc `profiles`); nên bật hook để nhanh hơn.

## Cách chạy seed

```bash
# 1. .env thật (không placeholder)
# 2. Migrations 001→048 + 999 đã chạy
npm run seed
```

⚠️ Script **RESET TOÀN BỘ**: xóa sạch MỌI dữ liệu cũ (tất cả org, tài khoản, license…) rồi nạp lại từ đầu. Không dùng trên database có dữ liệu thật.
